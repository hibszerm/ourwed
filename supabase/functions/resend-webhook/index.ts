/**
 * Resend webhook receiver — privacy-safe persistence into admin_email_events.
 *
 * Env (server only, never VITE_):
 * - RESEND_WEBHOOK_SECRET (Svix signing secret, e.g. whsec_…)
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Supported event types:
 * email.sent | email.delivered | email.bounced | email.failed |
 * email.complained | email.suppressed | email.delivery_delayed
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  extractPrivacySafeEmailEventAsync,
  type ResendWebhookPayload,
  verifySvixSignature,
} from './verify.ts'

const ALLOWED = new Set([
  'email.sent',
  'email.delivered',
  'email.bounced',
  'email.failed',
  'email.complained',
  'email.suppressed',
  'email.delivery_delayed',
])

function env(name: string): string | null {
  const raw = Deno.env.get(name)?.trim()
  return raw || null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: { code: 'method_not_allowed' } }, 405)
  }

  const secret = env('RESEND_WEBHOOK_SECRET')
  const supabaseUrl = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret || !supabaseUrl || !serviceKey) {
    return json({ ok: false, error: { code: 'misconfigured' } }, 500)
  }

  const rawBody = await req.text()
  const headers = {
    id: req.headers.get('svix-id'),
    timestamp: req.headers.get('svix-timestamp'),
    signature: req.headers.get('svix-signature'),
  }

  const verified = await verifySvixSignature({
    secret,
    body: rawBody,
    headers,
  })
  if (!verified) {
    return json({ ok: false, error: { code: 'invalid_signature' } }, 401)
  }

  let payload: ResendWebhookPayload
  try {
    payload = JSON.parse(rawBody) as ResendWebhookPayload
  } catch {
    return json({ ok: false, error: { code: 'invalid_json' } }, 400)
  }

  const eventType = String(payload.type ?? '')
  if (!ALLOWED.has(eventType)) {
    return json({ ok: true, ignored: true })
  }

  const row = await extractPrivacySafeEmailEventAsync(payload)
  if (!row) {
    return json({ ok: false, error: { code: 'unusable_payload' } }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const { error } = await supabase.from('admin_email_events').upsert(
    {
      external_email_id: row.externalEmailId,
      event_type: row.eventType,
      category: row.category,
      recipient_domain: row.recipientDomain,
      recipient_hash: row.recipientHash,
      occurred_at: row.occurredAt,
      payload_version: '1',
    },
    { onConflict: 'external_email_id,event_type,occurred_at', ignoreDuplicates: true },
  )

  if (error) {
    console.error('admin_email_events_insert_failed', error.code)
    return json({ ok: false, error: { code: 'persist_failed' } }, 500)
  }

  // Map Resend lifecycle → notification_deliveries when provider_message_id matches.
  // V1 UI treats "sent" as the product success state; webhook may refine status.
  const providerId = row.externalEmailId
  if (providerId) {
    let deliveryStatus: string | null = null
    let errorCode: string | null = null
    switch (eventType) {
      case 'email.sent':
        deliveryStatus = 'sent'
        break
      case 'email.delivered':
        // Keep status=sent (V1 does not distinguish delivered in customer UI).
        deliveryStatus = 'sent'
        break
      case 'email.bounced':
        deliveryStatus = 'failed'
        errorCode = 'bounced'
        break
      case 'email.failed':
        deliveryStatus = 'failed'
        errorCode = 'provider_failed'
        break
      case 'email.complained':
        deliveryStatus = 'failed'
        errorCode = 'complained'
        break
      case 'email.suppressed':
        deliveryStatus = 'skipped'
        errorCode = 'suppressed'
        break
      default:
        deliveryStatus = null
    }

    if (deliveryStatus) {
      const patch: Record<string, unknown> = {
        status: deliveryStatus,
        updated_at: new Date().toISOString(),
      }
      if (errorCode) patch.last_error_code = errorCode
      if (deliveryStatus === 'sent') {
        patch.sent_at = row.occurredAt
        patch.last_error_code = null
      }

      const { error: deliveryErr } = await supabase
        .from('notification_deliveries')
        .update(patch)
        .eq('provider_message_id', providerId)
        .eq('channel', 'email')

      if (deliveryErr) {
        console.error('notification_deliveries_webhook_update_failed', deliveryErr.code)
      }
    }
  }

  return json({ ok: true })
})
