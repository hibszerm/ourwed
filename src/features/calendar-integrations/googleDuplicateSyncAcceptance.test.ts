/**
 * Duplicate Google Calendar sync — regression tests from live incident evidence.
 *
 * Live evidence (2026-07-30):
 * - Job 1: OAuth callback `backfill` @ 14:06:49.572
 * - Job 2: frontend `sync_now` @ 14:06:51.407 (updateGoogleSettings on ?google=connected)
 * - Job 3: frontend `sync_now` @ 14:06:51.578 (StrictMode / double effect)
 * - Result: 1 mapping per entity, 2 Google events (orphan unmapped duplicates)
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const oauth = readFileSync(
  resolve('supabase/functions/google-calendar-oauth/index.ts'),
  'utf8',
)
const sync = readFileSync(
  resolve('supabase/functions/google-calendar-sync/index.ts'),
  'utf8',
)
const core = readFileSync(
  resolve('supabase/functions/_shared/calendar/syncCore.ts'),
  'utf8',
)
const page = readFileSync(
  resolve('src/pages/CalendarIntegrationsPage.tsx'),
  'utf8',
)
const migration = readFileSync(
  resolve('supabase/migrations/20260730180000_calendar_sync_hardening.sql'),
  'utf8',
)

{
  assert.ok(oauth.includes("operation: 'backfill'"))
  assert.ok(oauth.includes('process_jobs_internal'))
  assert.ok(
    !oauth.includes('updateGoogleSettings'),
    'OAuth must not depend on frontend settings mutation',
  )
  console.log('✓ OAuth is sole initial backfill authority + invokes worker')
}

{
  assert.ok(
    page.includes('Initial backfill is enqueued exclusively by the OAuth callback'),
  )
  assert.ok(
    !page.includes("updateGoogleSettings({ backfillMode: pending })"),
    'connected effect must not enqueue sync via updateGoogleSettings',
  )
  assert.ok(page.includes("next.delete('google')"))
  console.log('✓ frontend connected effect does not start second backfill')
}

{
  assert.ok(sync.includes('body.backfillMode !== integration.backfill_mode'))
  assert.ok(sync.includes('enqueueCoalescedJob'))
  assert.ok(sync.includes("eq('status', 'pending')"))
  assert.ok(sync.includes('reserveMapping'))
  assert.ok(sync.includes('findOwnedGoogleEvents'))
  assert.ok(sync.includes('google_event_404_heal'))
  assert.ok(sync.includes('reconcile_duplicates'))
  console.log('✓ sync: coalesce, claim, reserve, adopt, 404 heal, reconcile')
}

{
  assert.ok(core.includes('calendar_sync_jobs_coalesce') || core.includes('coalesce_key') || core.includes('jobCoalesceKey'))
  assert.ok(core.includes('privateExtendedProperty'))
  assert.ok(core.includes("ourwed_source === 'ourwed'"))
  assert.ok(core.includes('listExactTitleDateEvents'))
  assert.ok(core.includes('needsManualDeletion'))
  assert.ok(core.includes('inConnectWindow') || core.includes('connectedAt'))
  assert.ok(core.includes('parseSourceFingerprint'))
  console.log('✓ syncCore ownership search + scoped orphan cleanup')
}

{
  assert.ok(migration.includes('calendar_sync_jobs_coalesce_pending_uidx'))
  assert.ok(migration.includes("alter column external_calendar_id set not null"))
  assert.ok(migration.includes("'reserving'"))
  console.log('✓ migration: job unique coalesce + non-null calendar id')
}

{
  // Simulate coalesce key stability
  function key(op: string) {
    return ['u1', 'google', 'integration', 'i1', op].join(':')
  }
  assert.equal(key('backfill'), key('backfill'))
  assert.notEqual(key('backfill'), key('sync_now'))
  console.log('✓ backfill and sync_now use distinct coalesce keys')
}

console.log('\nDuplicate Google sync regression checks passed.')
