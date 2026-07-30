/**
 * Local Apple ICS verification helper.
 * Uses SUPABASE_SERVICE_ROLE_KEY from env to set a known test token hash,
 * fetches the feed, writes ICS to a temp file, then rotates hash away.
 *
 * Usage: npx tsx --env-file=.env.local scripts/verifyAppleCalendarFeed.ts
 */
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(url, serviceKey)

const { data: integrations, error } = await admin
  .from('calendar_integrations')
  .select('id, user_id, enabled, apple_token_hash')
  .eq('provider', 'apple')
  .eq('enabled', true)
  .limit(1)

if (error || !integrations?.length) {
  console.error('No active Apple integration found', error?.message)
  process.exit(1)
}

const integration = integrations[0]
const rawToken = randomBytes(32).toString('hex')
const hash = createHash('sha256').update(rawToken).digest('hex')

const { error: updateError } = await admin
  .from('calendar_integrations')
  .update({
    apple_token_hash: hash,
    apple_feed_etag: `W/"verify-${Date.now().toString(36)}"`,
  })
  .eq('id', integration.id)

if (updateError) {
  console.error('Failed to set token hash', updateError.message)
  process.exit(1)
}

const feedUrl = `${url.replace(/\/$/, '')}/functions/v1/apple-calendar-feed/${rawToken}/ourwed.ics`
const res = await fetch(feedUrl)
const body = await res.text()
const outPath = resolve('tmp-apple-feed-verify.ics')
writeFileSync(outPath, body, 'utf8')

console.log(
  JSON.stringify(
    {
      status: res.status,
      contentType: res.headers.get('content-type'),
      etag: res.headers.get('etag'),
      bytes: body.length,
      hasVcalendar: body.includes('BEGIN:VCALENDAR'),
      hasWedding: /SUMMARY:Ślub/.test(body),
      hasSession: /SUMMARY:Sesja/.test(body),
      veventCount: (body.match(/BEGIN:VEVENT/g) || []).length,
      outPath,
    },
    null,
    2,
  ),
)

// Invalid token should 404
const bad = await fetch(
  `${url.replace(/\/$/, '')}/functions/v1/apple-calendar-feed/deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef/ourwed.ics`,
)
console.log(JSON.stringify({ invalidTokenStatus: bad.status }))

// Restore a fresh random hash so the temporary verify token is revoked
const revokeHash = createHash('sha256')
  .update(randomBytes(32).toString('hex'))
  .digest('hex')
await admin
  .from('calendar_integrations')
  .update({ apple_token_hash: revokeHash })
  .eq('id', integration.id)

console.log('verify token revoked')
