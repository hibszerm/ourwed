/**
 * Mocked Google Calendar provider behavior (idempotency / all-day / ownership).
 */
import assert from 'node:assert/strict'
import {
  buildWeddingExternalCalendarEvent,
} from '@/features/calendar-integrations/buildExternalCalendarEvent'
import { toGoogleAllDayEventBody } from '@/features/calendar-integrations/ics'
import type { Wedding } from '@/types/wedding'

type MockGoogleEvent = {
  id: string
  summary: string
  start: { date: string }
  end: { date: string }
  extendedProperties?: { private?: Record<string, string> }
}

class MockGoogleCalendar {
  events = new Map<string, MockGoogleEvent>()
  createCount = 0
  updateCount = 0
  deleteCount = 0
  unrelated = new Map<string, MockGoogleEvent>()

  constructor() {
    this.unrelated.set('other-1', {
      id: 'other-1',
      summary: 'Personal dentist',
      start: { date: '2026-08-01' },
      end: { date: '2026-08-02' },
    })
  }

  upsertFromOurWed(input: {
    mappingId: string | null
    event: ReturnType<typeof buildWeddingExternalCalendarEvent>
    fingerprint: string
    mappings: Map<string, { externalId: string; fingerprint: string }>
    entityKey: string
  }): string {
    const body = toGoogleAllDayEventBody(input.event)
    const existing = input.mappings.get(input.entityKey)
    if (existing && existing.fingerprint === input.fingerprint) {
      return existing.externalId
    }
    if (existing) {
      const ev = this.events.get(existing.externalId)
      assert.ok(ev)
      ev.summary = body.summary
      ev.start = body.start
      ev.end = body.end
      this.updateCount += 1
      input.mappings.set(input.entityKey, {
        externalId: existing.externalId,
        fingerprint: input.fingerprint,
      })
      return existing.externalId
    }
    const id = `gcal-${this.createCount + 1}`
    this.events.set(id, {
      id,
      summary: body.summary,
      start: body.start,
      end: body.end,
      extendedProperties: {
        private: {
          ourwed_source: 'ourwed',
          ourwed_entity_id: input.event.entityId,
        },
      },
    })
    this.createCount += 1
    input.mappings.set(input.entityKey, {
      externalId: id,
      fingerprint: input.fingerprint,
    })
    return id
  }

  deleteOurWed(externalId: string) {
    if (this.unrelated.has(externalId)) {
      throw new Error('must not delete unrelated')
    }
    this.events.delete(externalId)
    this.deleteCount += 1
  }
}

const wedding = {
  id: 'wedding-1',
  date: '2026-09-20',
  status: 'active',
  couple: {
    partner1: 'Joanna Nowak',
    partner2: 'Krystian Kowalski',
    partner1FirstName: 'Joanna',
    partner2FirstName: 'Krystian',
  },
} as Wedding

const settings = {
  syncWeddings: true,
  syncSessions: true,
  backfillMode: 'all_active' as const,
}

{
  const api = new MockGoogleCalendar()
  const mappings = new Map<string, { externalId: string; fingerprint: string }>()
  const event = buildWeddingExternalCalendarEvent(wedding, settings)
  const id1 = api.upsertFromOurWed({
    mappingId: null,
    event,
    fingerprint: event.fingerprint,
    mappings,
    entityKey: 'wedding:wedding-1',
  })
  const id2 = api.upsertFromOurWed({
    mappingId: id1,
    event,
    fingerprint: event.fingerprint,
    mappings,
    entityKey: 'wedding:wedding-1',
  })
  assert.equal(id1, id2)
  assert.equal(api.createCount, 1)
  assert.equal(api.updateCount, 0)
  console.log('✓ repeated sync does not duplicate')
}

{
  const api = new MockGoogleCalendar()
  const mappings = new Map<string, { externalId: string; fingerprint: string }>()
  const event = buildWeddingExternalCalendarEvent(wedding, settings)
  const id = api.upsertFromOurWed({
    mappingId: null,
    event,
    fingerprint: event.fingerprint,
    mappings,
    entityKey: 'wedding:wedding-1',
  })
  const renamed = buildWeddingExternalCalendarEvent(
    { ...wedding, displayName: 'Asia i Krystian' },
    settings,
  )
  const id2 = api.upsertFromOurWed({
    mappingId: id,
    event: renamed,
    fingerprint: renamed.fingerprint,
    mappings,
    entityKey: 'wedding:wedding-1',
  })
  assert.equal(id, id2)
  assert.equal(api.createCount, 1)
  assert.equal(api.updateCount, 1)
  assert.equal(api.events.get(id)?.summary, renamed.title)
  console.log('✓ title update patches same event')
}

{
  const api = new MockGoogleCalendar()
  const mappings = new Map<string, { externalId: string; fingerprint: string }>()
  const event = buildWeddingExternalCalendarEvent(wedding, settings)
  const id = api.upsertFromOurWed({
    mappingId: null,
    event,
    fingerprint: event.fingerprint,
    mappings,
    entityKey: 'wedding:wedding-1',
  })
  const moved = buildWeddingExternalCalendarEvent(
    { ...wedding, date: '2026-10-05' },
    settings,
  )
  api.upsertFromOurWed({
    mappingId: id,
    event: moved,
    fingerprint: moved.fingerprint,
    mappings,
    entityKey: 'wedding:wedding-1',
  })
  assert.deepEqual(api.events.get(id)?.start, { date: '2026-10-05' })
  assert.deepEqual(api.events.get(id)?.end, { date: '2026-10-06' })
  console.log('✓ date update moves same event (exclusive end)')
}

{
  const api = new MockGoogleCalendar()
  const mappings = new Map<string, { externalId: string; fingerprint: string }>()
  const event = buildWeddingExternalCalendarEvent(wedding, settings)
  const id = api.upsertFromOurWed({
    mappingId: null,
    event,
    fingerprint: event.fingerprint,
    mappings,
    entityKey: 'wedding:wedding-1',
  })
  api.deleteOurWed(id)
  assert.equal(api.events.has(id), false)
  assert.equal(api.unrelated.has('other-1'), true)
  assert.throws(() => api.deleteOurWed('other-1'))
  console.log('✓ disconnect cleanup never deletes unrelated events')
}

{
  const body = toGoogleAllDayEventBody(
    buildWeddingExternalCalendarEvent(wedding, settings),
  )
  assert.ok(!('dateTime' in body.start))
  assert.ok(!('dateTime' in body.end))
  console.log('✓ Google payload uses date not dateTime')
}

console.log('\nGoogle mock provider tests passed.')
