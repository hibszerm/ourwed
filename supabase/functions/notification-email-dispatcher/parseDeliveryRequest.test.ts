/**
 * Parser unit tests — manual + Supabase Database Webhook payloads.
 */
import assert from 'node:assert/strict'
import { parseDeliveryId } from './parseDeliveryRequest.ts'

const DELIVERY_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

function webhookRecord(
  overrides: Partial<{ id: string; channel: string; status: string }> = {},
) {
  return {
    type: 'INSERT',
    schema: 'public',
    table: 'notification_deliveries',
    record: {
      id: DELIVERY_ID,
      channel: 'email',
      status: 'pending',
      ...overrides,
    },
  }
}

// Manual payload
assert.equal(
  parseDeliveryId({ body: { deliveryId: DELIVERY_ID } }),
  DELIVERY_ID,
  'manual deliveryId',
)

// Webhook payload
assert.equal(
  parseDeliveryId({ body: webhookRecord() }),
  DELIVERY_ID,
  'webhook INSERT public notification_deliveries pending email',
)

// URL fallback (existing behaviour)
assert.equal(
  parseDeliveryId({ body: {}, urlDeliveryId: DELIVERY_ID }),
  DELIVERY_ID,
  'url delivery_id query param',
)

// Manual takes precedence over webhook-shaped body when deliveryId present
assert.equal(
  parseDeliveryId({
    body: {
      deliveryId: '11111111-1111-4111-8111-111111111111',
      ...webhookRecord(),
    },
  }),
  '11111111-1111-4111-8111-111111111111',
  'manual overrides webhook fields',
)

// Invalid payloads → null (caller returns delivery_id_required)
assert.equal(parseDeliveryId({ body: webhookRecord({ id: '' }) }), null, 'missing record.id')
assert.equal(
  parseDeliveryId({
    body: { ...webhookRecord(), table: 'notification_events' },
  }),
  null,
  'wrong table',
)
assert.equal(
  parseDeliveryId({
    body: { ...webhookRecord(), schema: 'private' },
  }),
  null,
  'wrong schema',
)
assert.equal(
  parseDeliveryId({ body: webhookRecord({ channel: 'in_app' }) }),
  null,
  'wrong channel',
)
assert.equal(
  parseDeliveryId({ body: webhookRecord({ status: 'sent' }) }),
  null,
  'wrong status',
)
assert.equal(
  parseDeliveryId({ body: { ...webhookRecord(), type: 'UPDATE' } }),
  null,
  'wrong type',
)
assert.equal(parseDeliveryId({ body: {} }), null, 'empty body')
assert.equal(parseDeliveryId({ body: null }), null, 'null body')

// Must not accept message fields as delivery id
assert.equal(
  parseDeliveryId({
    body: {
      to: 'attacker@example.com',
      subject: 'spam',
      html: '<p>x</p>',
    },
  }),
  null,
  'ignores email content fields',
)

console.log('OK notification-email-dispatcher parseDeliveryRequest')
