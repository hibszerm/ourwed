/**
 * Parse dispatcher request body / query into a single delivery id.
 * Supports manual `{ deliveryId }` and Supabase Database Webhook INSERT payloads.
 * Never reads recipient, subject, HTML, or other message fields from the request.
 */

export type DispatchRequestBody = Record<string, unknown>

function trimId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t || null
}

function parseDatabaseWebhookDeliveryId(body: DispatchRequestBody): string | null {
  if (body.type !== 'INSERT') return null
  if (body.schema !== 'public') return null
  if (body.table !== 'notification_deliveries') return null

  const record = body.record
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null

  const rec = record as Record<string, unknown>
  const id = trimId(rec.id)
  if (!id) return null
  if (rec.channel !== 'email') return null
  if (rec.status !== 'pending') return null

  return id
}

export function parseDeliveryId(input: {
  body?: DispatchRequestBody | null
  urlDeliveryId?: string | null
}): string | null {
  const fromUrl = trimId(input.urlDeliveryId ?? null)
  const body = input.body

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const manual = trimId(body.deliveryId)
    if (manual) return manual

    const fromWebhook = parseDatabaseWebhookDeliveryId(body)
    if (fromWebhook) return fromWebhook
  }

  if (fromUrl) return fromUrl

  return null
}
