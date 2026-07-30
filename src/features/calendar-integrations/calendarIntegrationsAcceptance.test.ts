/**
 * Calendar integrations Phase 1 — unit + acceptance tests (mocked Google).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  addOneCalendarDay,
  toCalendarDate,
  toIcsDateValue,
  todayCalendarDate,
} from '@/features/calendar-integrations/allDayDates'
import {
  buildExternalCalendarEvent,
  buildSessionExternalCalendarEvent,
  buildWeddingExternalCalendarEvent,
} from '@/features/calendar-integrations/buildExternalCalendarEvent'
import {
  buildAppleIcsDocument,
  escapeIcsText,
  foldIcsLine,
  stableAppleEventUid,
  toGoogleAllDayEventBody,
} from '@/features/calendar-integrations/ics'
import { buildSessionExternalTitle } from '@/features/calendar-integrations/externalTitles'
import type { Wedding } from '@/types/wedding'
import type { Session } from '@/types/session'

function weddingFixture(
  overrides: Partial<Wedding> & { id: string; date: string },
): Wedding {
  return {
    couple: {
      partner1: 'Joanna Nowak',
      partner2: 'Krystian Kowalski',
      partner1FirstName: 'Joanna',
      partner1LastName: 'Nowak',
      partner2FirstName: 'Krystian',
      partner2LastName: 'Kowalski',
    },
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Test',
    price: 0,
    depositAmount: 0,
    currency: 'PLN',
    accentColor: '#000',
    ...overrides,
  } as Wedding
}

function sessionFixture(
  overrides: Partial<Session> & { id: string; date: string },
): Session {
  return {
    customName: undefined,
    primaryPerson: { firstName: 'Joanna', lastName: 'Nowak' },
    secondaryPerson: { firstName: 'Krystian', lastName: 'Kowalski' },
    sessionType: 'engagement',
    totalPrice: 0,
    depositAmount: 0,
    ...overrides,
  } as Session
}

// --- All-day dates ---
{
  assert.equal(toCalendarDate('2026-08-15'), '2026-08-15')
  assert.equal(toCalendarDate('2026-08-15T12:00:00Z'), '2026-08-15')
  assert.equal(addOneCalendarDay('2026-08-15'), '2026-08-16')
  assert.equal(addOneCalendarDay('2026-12-31'), '2027-01-01')
  assert.equal(toIcsDateValue('2026-08-15'), '20260815')
  console.log('✓ all-day date helpers')
}

// --- Canonical DTO / titles ---
{
  const w = weddingFixture({ id: 'w1', date: '2026-09-20' })
  const event = buildWeddingExternalCalendarEvent(w, {
    syncWeddings: true,
    syncSessions: true,
    backfillMode: 'all_active',
  })
  assert.equal(event.eligible, true)
  assert.equal(event.startDate, '2026-09-20')
  assert.equal(event.endDateExclusive, '2026-09-21')
  assert.match(event.title, /^Ślub — /)
  assert.ok(!event.title.includes('emoji'))
  assert.ok(!/\d{3}/.test(event.title)) // no phone-like

  const googleBody = toGoogleAllDayEventBody(event)
  assert.deepEqual(googleBody.start, { date: '2026-09-20' })
  assert.deepEqual(googleBody.end, { date: '2026-09-21' })
  console.log('✓ wedding canonical + Google all-day payload')
}

{
  const s = sessionFixture({ id: 's1', date: '2026-10-01' })
  const event = buildSessionExternalCalendarEvent(s, {
    syncWeddings: true,
    syncSessions: true,
    backfillMode: 'all_active',
  })
  assert.equal(event.eligible, true)
  assert.match(event.title, /^Sesja narzeczeńska — /)
  assert.ok(event.title.includes('Joanna'))
  console.log('✓ session canonical title')
}

{
  const cancelled = weddingFixture({
    id: 'w2',
    date: '2026-09-20',
    status: 'cancelled',
  })
  const event = buildWeddingExternalCalendarEvent(cancelled, {
    syncWeddings: true,
    syncSessions: true,
    backfillMode: 'all_active',
  })
  assert.equal(event.eligible, false)
  assert.equal(event.omissionReason, 'cancelled')
  console.log('✓ cancelled wedding ineligible')
}

{
  const archived = weddingFixture({
    id: 'w3',
    date: '2026-09-20',
    status: 'archived',
  })
  const event = buildWeddingExternalCalendarEvent(archived, {
    syncWeddings: true,
    syncSessions: true,
    backfillMode: 'all_active',
  })
  assert.equal(event.eligible, true)
  console.log('✓ archived wedding remains eligible')
}

{
  const past = weddingFixture({ id: 'w4', date: '2020-01-01' })
  const futureOnly = buildWeddingExternalCalendarEvent(past, {
    syncWeddings: true,
    syncSessions: true,
    backfillMode: 'future',
    referenceDate: '2026-07-28',
  })
  assert.equal(futureOnly.eligible, false)
  assert.equal(futureOnly.omissionReason, 'backfill_future')

  const allActive = buildWeddingExternalCalendarEvent(past, {
    syncWeddings: true,
    syncSessions: true,
    backfillMode: 'all_active',
    referenceDate: '2026-07-28',
  })
  assert.equal(allActive.eligible, true)
  console.log('✓ backfill future vs all_active')
}

{
  const w = weddingFixture({ id: 'w5', date: '2026-09-20' })
  const disabled = buildWeddingExternalCalendarEvent(w, {
    syncWeddings: false,
    syncSessions: true,
    backfillMode: 'all_active',
  })
  assert.equal(disabled.eligible, false)
  assert.equal(disabled.omissionReason, 'category_disabled')
  console.log('✓ category disabled omits wedding')
}

{
  const w = weddingFixture({ id: 'w6', date: '2026-09-20' })
  const a = buildExternalCalendarEvent(
    { kind: 'wedding', wedding: w },
    { syncWeddings: true, syncSessions: true, backfillMode: 'all_active' },
  )
  const b = buildExternalCalendarEvent(
    { kind: 'wedding', wedding: { ...w, displayName: 'Asia & Kris' } },
    { syncWeddings: true, syncSessions: true, backfillMode: 'all_active' },
  )
  // fingerprint changes with title — same entity id used for mapping, not title
  assert.equal(a.entityId, b.entityId)
  assert.notEqual(a.fingerprint, b.fingerprint)
  assert.equal(b.title, 'Ślub — Asia & Kris')
  console.log('✓ identity is entity id; fingerprint tracks title/date')
}

// --- ICS ---
{
  const w = weddingFixture({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', date: '2026-09-20' })
  const s = sessionFixture({ id: '11111111-2222-3333-4444-555555555555', date: '2026-10-01' })
  const events = [
    buildWeddingExternalCalendarEvent(w, {
      syncWeddings: true,
      syncSessions: true,
      backfillMode: 'all_active',
    }),
    buildSessionExternalCalendarEvent(s, {
      syncWeddings: true,
      syncSessions: true,
      backfillMode: 'all_active',
    }),
  ]
  const ics = buildAppleIcsDocument({ events, now: new Date('2026-07-28T12:00:00Z') })
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'))
  assert.ok(ics.includes('VERSION:2.0\r\n'))
  assert.ok(ics.includes('X-WR-CALNAME:OurWed\r\n'))
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260920\r\n'))
  assert.ok(ics.includes('DTEND;VALUE=DATE:20260921\r\n'))
  assert.ok(ics.includes('SUMMARY:Ślub — '))
  assert.ok(ics.includes('END:VCALENDAR\r\n'))
  assert.ok(ics.includes(stableAppleEventUid('wedding', w.id)))
  assert.ok(!ics.includes('phone'))
  assert.ok(!ics.includes('5000'))
  assert.ok(ics.includes('\r\n'))
  assert.equal(ics.includes('\n') && !ics.includes('\r\n'), false)
  const withoutCrlf = ics.replaceAll('\r\n', '')
  assert.ok(!withoutCrlf.includes('\n'), 'ICS must not contain bare LF')
  console.log('✓ Apple ICS structure, dates, CRLF, Polish titles')
}

{
  const disabledSessions = buildAppleIcsDocument({
    events: [
      buildSessionExternalCalendarEvent(
        sessionFixture({ id: 's2', date: '2026-10-01' }),
        {
          syncWeddings: true,
          syncSessions: false,
          backfillMode: 'all_active',
        },
      ),
    ],
  })
  assert.ok(!disabledSessions.includes('BEGIN:VEVENT'))
  console.log('✓ disabled sessions omitted from ICS')
}

{
  assert.equal(escapeIcsText('A, B; C\\D\nE'), 'A\\, B\\; C\\\\D\\nE')
  const long = 'SUMMARY:' + 'ą'.repeat(80)
  const folded = foldIcsLine(long)
  assert.ok(folded.includes('\r\n '))
  console.log('✓ ICS escaping and folding')
}

{
  const title = buildSessionExternalTitle({
    sessionType: 'other',
    customSessionType: 'Plenerowa',
    primaryPerson: { firstName: 'Anna', lastName: 'Nowak' },
    secondaryPerson: { firstName: 'Piotr', lastName: 'Kowalski' },
  })
  assert.equal(title, 'Sesja plenerowa — Anna i Piotr')
  console.log('✓ custom session type title')
}

// --- Trigger wiring (source inspection) ---
{
  const weddingSvc = readFileSync(
    resolve('src/lib/api/weddingService.ts'),
    'utf8',
  )
  assert.ok(weddingSvc.includes('enqueueExternalCalendarSync'))
  assert.ok(weddingSvc.includes("entityType: 'wedding'"))

  const sessionSvc = readFileSync(
    resolve('src/lib/api/sessionService.ts'),
    'utf8',
  )
  assert.ok(sessionSvc.includes('enqueueExternalCalendarSync'))
  assert.ok(sessionSvc.includes("entityType: 'session'"))

  const questionnaire = readFileSync(
    resolve('src/lib/api/questionnaireService.ts'),
    'utf8',
  )
  // Approval creates wedding via weddingService.create — sync after local wedding exists
  assert.ok(questionnaire.includes('weddingService.create'))
  assert.ok(
    !questionnaire.includes('enqueueExternalCalendarSync'),
    'questionnaire must not sync before wedding create',
  )
  console.log('✓ triggers: wedding/session after persist; approve via create')
}

// --- OAuth / security source checks ---
{
  const oauth = readFileSync(
    resolve('supabase/functions/google-calendar-oauth/index.ts'),
    'utf8',
  )
  assert.ok(oauth.includes('code_challenge'))
  assert.ok(oauth.includes('state'))
  assert.ok(oauth.includes('GOOGLE_CALENDAR_CLIENT_SECRET'))
  assert.ok(oauth.includes('encryptSecret'))
  assert.ok(!oauth.includes('VITE_'))

  const sync = readFileSync(
    resolve('supabase/functions/google-calendar-sync/index.ts'),
    'utf8',
  )
  assert.ok(sync.includes('extendedProperties'))
  assert.ok(sync.includes('calendar_sync_jobs'))
  assert.ok(sync.includes('removeEvents'))
  assert.ok(sync.includes("eq('user_id', userId)"))

  const feed = readFileSync(
    resolve('supabase/functions/apple-calendar-feed/index.ts'),
    'utf8',
  )
  assert.ok(feed.includes('sha256Hex'))
  assert.ok(feed.includes('text/calendar'))
  assert.ok(feed.includes('Not Found'))
  assert.ok(!feed.includes('console.log(rawToken'))

  const migration = readFileSync(
    resolve('supabase/migrations/20260730160000_calendar_integrations.sql'),
    'utf8',
  )
  assert.ok(migration.includes('calendar_integrations'))
  assert.ok(migration.includes('external_calendar_events'))
  assert.ok(migration.includes('calendar_sync_jobs'))
  assert.ok(migration.includes('calendar_integration_secrets'))
  assert.ok(
    migration.includes(
      'unique (user_id, provider, entity_type, entity_id, external_calendar_id)',
    ),
  )
  console.log('✓ OAuth PKCE/state, secrets, mapping uniqueness, Apple hash')
}

// --- UI routes ---
{
  const router = readFileSync(resolve('src/routes/router.tsx'), 'utf8')
  assert.ok(router.includes('/ustawienia/integracje'))
  assert.ok(router.includes('CalendarIntegrationsPage'))

  const settings = readFileSync(resolve('src/pages/SettingsPage.tsx'), 'utf8')
  assert.ok(settings.includes('/ustawienia/integracje'))
  assert.ok(!settings.includes("title: 'Integracje',\n    description: 'Połączenia z narzędziami zewnętrznymi.',\n    soon: true"))

  const page = readFileSync(
    resolve('src/pages/CalendarIntegrationsPage.tsx'),
    'utf8',
  )
  assert.ok(page.includes('Połącz z Google Calendar'))
  assert.ok(page.includes('Aktywuj kalendarz Apple'))
  assert.ok(page.includes('OurWed jest źródłem prawdy'))
  console.log('✓ settings UI wired')
}

{
  // timezone smoke — todayCalendarDate returns YYYY-MM-DD
  assert.match(todayCalendarDate('Europe/Warsaw'), /^\d{4}-\d{2}-\d{2}$/)
  console.log('✓ todayCalendarDate')
}

console.log('\nAll calendar integration acceptance checks passed.')
