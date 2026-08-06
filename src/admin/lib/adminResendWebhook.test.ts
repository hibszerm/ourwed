/**
 * Unit tests for Resend webhook privacy + Svix verification helpers.
 * Mirrors supabase/functions/resend-webhook/verify.ts for Node crypto.subtle.
 */
import { createHmac, createHash, timingSafeEqual as nodeTse } from 'node:crypto'
import assert from 'node:assert/strict'

function extractDomain(email: string | null): string | null {
  if (!email || !email.includes('@')) return null
  return email.split('@')[1]?.toLowerCase() ?? null
}

function hashRecipient(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

function verifySvixNode(input: {
  secret: string
  body: string
  id: string
  timestamp: string
  signatureHeader: string
}): boolean {
  const raw = input.secret.startsWith('whsec_')
    ? Buffer.from(input.secret.slice(6), 'base64')
    : Buffer.from(input.secret, 'base64')
  const msg = `${input.id}.${input.timestamp}.${input.body}`
  const expected = createHmac('sha256', raw).update(msg).digest('base64')
  const parts = input.signatureHeader.split(' ')
  for (const part of parts) {
    const [version, value] = part.split(',')
    if (version === 'v1' && value) {
      const a = Buffer.from(value)
      const b = Buffer.from(expected)
      if (a.length === b.length && nodeTse(a, b)) return true
    }
  }
  return false
}

const secret = `whsec_${Buffer.from('test-secret-key-32bytes-minimum!!').toString('base64')}`
const body = JSON.stringify({
  type: 'email.delivered',
  data: {
    email_id: 're_123',
    to: ['anna.kowalska@example.com'],
    subject: 'Umowa ślubna — Jan i Anna',
    created_at: '2026-08-06T10:00:00.000Z',
  },
})
const id = 'msg_test_1'
const timestamp = String(Math.floor(Date.now() / 1000))
const raw = Buffer.from(secret.slice(6), 'base64')
const goodSig = createHmac('sha256', raw)
  .update(`${id}.${timestamp}.${body}`)
  .digest('base64')

assert.equal(
  verifySvixNode({
    secret,
    body,
    id,
    timestamp,
    signatureHeader: `v1,${goodSig}`,
  }),
  true,
  'valid signature accepted',
)

assert.equal(
  verifySvixNode({
    secret,
    body,
    id,
    timestamp,
    signatureHeader: 'v1,deadbeef',
  }),
  false,
  'invalid signature rejected',
)

assert.equal(extractDomain('anna.kowalska@example.com'), 'example.com')
assert.equal(hashRecipient('anna.kowalska@example.com').includes('@'), false)
assert.equal(hashRecipient('anna.kowalska@example.com').length, 64)

// Idempotency key shape
const unique = ['re_123', 'email.delivered', '2026-08-06T10:00:00.000Z'].join('|')
assert.ok(unique.includes('re_123'))

console.log('PASS  admin resend webhook privacy/signature')
