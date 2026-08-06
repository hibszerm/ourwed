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

  return json({ ok: true })
})
