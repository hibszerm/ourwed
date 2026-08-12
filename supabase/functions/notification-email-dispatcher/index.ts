/**
 * Notification email dispatcher — Resend transactional send.
 *
 * Env (server only, never VITE_):
 * - RESEND_API_KEY
 * - RESEND_FROM_EMAIL (optional; default OurWed <powiadomienia@ourwed.pl>)
 * - APP_PUBLIC_URL | SITE_URL (CTA base)
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - NOTIFICATION_DISPATCH_SECRET (optional shared secret for DB webhook / pg_net)
 *
 * Accepts { deliveryId } or Supabase Database Webhook INSERT on notification_deliveries.
 * Never accepts recipient/email/body from caller.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { parseDeliveryId } from './parseDeliveryRequest.ts'
import { renderNotificationEmail } from './templates.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-notification-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function env(name: string): string | null {
  const raw = Deno.env.get(name)?.trim()
  return raw || null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function authorize(req: Request): boolean {
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const dispatchSecret = env('NOTIFICATION_DISPATCH_SECRET')
  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const headerSecret = req.headers.get('x-notification-secret')?.trim() ?? ''

  if (serviceKey && bearer && bearer === serviceKey) return true
  if (dispatchSecret && (bearer === dispatchSecret || headerSecret === dispatchSecret)) {
    return true
  }
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405)
  }
  if (!authorize(req)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  const supabaseUrl = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = env('RESEND_API_KEY')
  const appUrl = (
    env('APP_PUBLIC_URL') ||
    env('SITE_URL') ||
    'https://ourwed.pl'
  ).replace(/\/$/, '')
  const fromEmail =
    env('RESEND_FROM_EMAIL') || 'OurWed <powiadomienia@ourwed.pl>'

  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: 'misconfigured' }, 500)
  }
  if (!resendKey) {
    return json({ ok: false, error: 'resend_not_configured' }, 500)
  }

  let deliveryId: string | null
  try {
    const urlId = new URL(req.url).searchParams.get('delivery_id')
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    deliveryId = parseDeliveryId({ body, urlDeliveryId: urlId })
  } catch {
    deliveryId = null
  }
  if (!deliveryId) {
    return json({ ok: false, error: 'delivery_id_required' }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: delivery, error: dErr } = await supabase
    .from('notification_deliveries')
    .select(
      'id, event_id, recipient_user_id, channel, status, attempt_count, max_attempts, idempotency_key',
    )
    .eq('id', deliveryId)
    .maybeSingle()

  if (dErr || !delivery) {
    return json({ ok: false, error: 'delivery_not_found' }, 404)
  }
  if (delivery.channel !== 'email') {
    return json({ ok: false, error: 'not_email_channel' }, 400)
  }
  if (delivery.status === 'sent' || delivery.status === 'skipped') {
    return json({ ok: true, already: delivery.status })
  }
  if (delivery.attempt_count >= delivery.max_attempts) {
    await supabase
      .from('notification_deliveries')
      .update({
        status: 'failed',
        last_error_code: 'max_attempts',
        updated_at: new Date().toISOString(),
      })
      .eq('id', delivery.id)
    return json({ ok: false, error: 'max_attempts' }, 409)
  }

  const { data: event, error: eErr } = await supabase
    .from('notification_events')
    .select('id, event_type, payload_safe')
    .eq('id', delivery.event_id)
    .maybeSingle()

  if (eErr || !event) {
    return json({ ok: false, error: 'event_not_found' }, 404)
  }

  // Re-check preference at send time
  const { data: pref } = await supabase
    .from('notification_preferences')
    .select('enabled')
    .eq('user_id', delivery.recipient_user_id)
    .eq('event_type', event.event_type)
    .eq('channel', 'email')
    .maybeSingle()

  const emailEnabled =
    pref == null
      ? ['questionnaire.contract.completed', 'questionnaire.prewedding.completed'].includes(
          event.event_type,
        )
      : Boolean(pref.enabled)

  if (!emailEnabled) {
    await supabase
      .from('notification_deliveries')
      .update({
        status: 'skipped',
        skip_reason: 'preference_disabled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', delivery.id)
    return json({ ok: true, skipped: 'preference_disabled' })
  }

  const { data: userData, error: uErr } = await supabase.auth.admin.getUserById(
    delivery.recipient_user_id,
  )
  const toEmail = userData?.user?.email?.trim()
  if (uErr || !toEmail) {
    await supabase
      .from('notification_deliveries')
      .update({
        status: 'skipped',
        skip_reason: 'no_recipient_email',
        attempt_count: delivery.attempt_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', delivery.id)
    return json({ ok: true, skipped: 'no_recipient_email' })
  }

  await supabase
    .from('notification_deliveries')
    .update({
      status: 'processing',
      attempt_count: delivery.attempt_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', delivery.id)

  const payload = (event.payload_safe ?? {}) as Record<string, unknown>
  const rendered = renderNotificationEmail({
    eventType: event.event_type,
    appBaseUrl: appUrl,
    payload,
  })

  const idempotencyKey =
    delivery.idempotency_key ||
    `ourwed/${event.id}/${delivery.recipient_user_id}/email`

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    }),
  })

  const resendJson = (await resendRes.json().catch(() => ({}))) as {
    id?: string
    message?: string
    name?: string
  }

  if (!resendRes.ok) {
    const code = resendJson.name || resendJson.message || `http_${resendRes.status}`
    await supabase
      .from('notification_deliveries')
      .update({
        status: 'failed',
        last_error_code: String(code).slice(0, 120),
        updated_at: new Date().toISOString(),
      })
      .eq('id', delivery.id)
    return json({ ok: false, error: 'resend_failed', code }, 502)
  }

  await supabase
    .from('notification_deliveries')
    .update({
      status: 'sent',
      provider: 'resend',
      provider_message_id: resendJson.id ?? null,
      sent_at: new Date().toISOString(),
      last_error_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', delivery.id)

  return json({ ok: true, providerMessageId: resendJson.id ?? null })
})
