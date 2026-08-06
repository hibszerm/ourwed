/** Pure helpers for Resend/Svix webhook verification and privacy-safe extraction. */

export type ResendWebhookPayload = {
  type?: string
  created_at?: string
  data?: {
    email_id?: string
    created_at?: string
    to?: string[] | string
    subject?: string
    tags?: Array<{ name?: string; value?: string }>
  }
}

export type PrivacySafeEmailEvent = {
  externalEmailId: string
  eventType: string
  category: string | null
  recipientDomain: string | null
  recipientHash: string | null
  occurredAt: string
}

function decodeWhsec(secret: string): Uint8Array {
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const bin = atob(raw)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifySvixSignature(input: {
  secret: string
  body: string
  headers: { id: string | null; timestamp: string | null; signature: string | null }
  nowSec?: number
}): Promise<boolean> {
  const { secret, body, headers } = input
  if (!headers.id || !headers.timestamp || !headers.signature) return false

  const now = input.nowSec ?? Math.floor(Date.now() / 1000)
  const ts = Number(headers.timestamp)
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false

  const key = await crypto.subtle.importKey(
    'raw',
    decodeWhsec(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const msg = new TextEncoder().encode(`${headers.id}.${headers.timestamp}.${body}`)
  const sigBuf = await crypto.subtle.sign('HMAC', key, msg)
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))

  const parts = headers.signature.split(' ')
  for (const part of parts) {
    const [version, value] = part.split(',')
    if (version === 'v1' && value && timingSafeEqual(value, expected)) {
      return true
    }
  }
  return false
}

function firstRecipient(to: string[] | string | undefined): string | null {
  if (!to) return null
  if (typeof to === 'string') return to
  return to[0] ?? null
}

export function extractDomain(email: string | null): string | null {
  if (!email || !email.includes('@')) return null
  return email.split('@')[1]?.toLowerCase() ?? null
}

export async function hashRecipient(email: string | null): Promise<string | null> {
  if (!email) return null
  const data = new TextEncoder().encode(email.trim().toLowerCase())
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function extractPrivacySafeEmailEvent(
  payload: ResendWebhookPayload,
): PrivacySafeEmailEvent | null {
  const eventType = String(payload.type ?? '')
  const externalEmailId = payload.data?.email_id
  if (!eventType || !externalEmailId) return null

  const recipient = firstRecipient(payload.data?.to)
  const categoryTag = payload.data?.tags?.find((t) => t.name === 'category')?.value ?? null

  return {
    externalEmailId,
    eventType,
    category: categoryTag,
    recipientDomain: extractDomain(recipient),
    // Hash computed sync-safe path: caller may overwrite async; keep domain-only if no crypto
    recipientHash: null,
    occurredAt:
      payload.data?.created_at ??
      payload.created_at ??
      new Date().toISOString(),
  }
}

/** Async variant that fills recipient_hash without storing the email. */
export async function extractPrivacySafeEmailEventAsync(
  payload: ResendWebhookPayload,
): Promise<PrivacySafeEmailEvent | null> {
  const base = extractPrivacySafeEmailEvent(payload)
  if (!base) return null
  const recipient = firstRecipient(payload.data?.to)
  return {
    ...base,
    recipientHash: await hashRecipient(recipient),
  }
}
