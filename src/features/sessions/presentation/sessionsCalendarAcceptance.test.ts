/**
 * Run: npm run test:sessions-calendar
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  mergeCalendarUiEvents,
  toCalendarSessionEvent,
  UNKNOWN_TIME_LABEL,
} from '@/features/calendar/utils/calendarEvents'
import type { Session } from '@/types/session'
import type { CalendarWeddingEvent } from '@/features/calendar/utils/calendarEvents'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

function session(partial: Partial<Session> & Pick<Session, 'id' | 'date'>): Session {
  return {
    primaryPerson: {},
    sessionType: 'engagement',
    totalPrice: 0,
    depositAmount: 0,
    payments: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...partial,
  }
}

const timed = toCalendarSessionEvent(
  session({
    id: '11111111-1111-4111-8111-111111111111',
    date: '2026-08-12',
    startTime: '10:00',
    endTime: '12:00',
    primaryPerson: { firstName: 'Anna' },
    secondaryPerson: { firstName: 'Michał' },
  }),
)
assertEq(timed.entityType, 'session', 'entity')
assertEq(timed.title, 'Anna i Michał', 'title')
assertEq(timed.href, `/sesje/${timed.entityId}`, 'href')
assertEq(timed.ceremonyTime, '10:00', 'timed')
assert(timed.timeLabel.includes('10:00'), 'time label')

const allDay = toCalendarSessionEvent(
  session({
    id: '22222222-2222-4222-8222-222222222222',
    date: '2026-09-01',
    customName: 'Sesja produktowa',
  }),
)
assertEq(allDay.ceremonyTime, undefined, 'no invented start')
assertEq(allDay.timeLabel, UNKNOWN_TIME_LABEL, 'all-day label')

const weddingStub = {
  entityType: 'wedding',
  entityId: 'w1',
  href: '/sluby/w1',
  id: 'ev1',
  dateKey: '2026-08-12',
  title: 'Para',
  coupleLabel: 'Para',
  ceremonyTime: '14:00',
} as CalendarWeddingEvent

const merged = mergeCalendarUiEvents([weddingStub], [
  session({
    id: '11111111-1111-4111-8111-111111111111',
    date: '2026-08-12',
    startTime: '10:00',
    primaryPerson: { firstName: 'Anna' },
  }),
])
assert(merged.length === 2, 'both events')
assert(
  merged.some((e) => e.entityType === 'wedding') &&
    merged.some((e) => e.entityType === 'session'),
  'union',
)

const calPage = readFileSync(
  resolve(process.cwd(), 'src/pages/CalendarPage.tsx'),
  'utf8',
)
assert(calPage.includes('useCalendarSessions'), 'loads light sessions')
assert(calPage.includes('mergeCalendarUiEvents'), 'merges')
assert(!calPage.includes('useWeddings'), 'no full wedding hydrate hook')
assert(
  !calPage.includes('queryFn: () => calendarEventService.syncWeddingDayEvents'),
  'sync not on query critical path',
)

const weddingService = readFileSync(
  resolve(process.cwd(), 'src/lib/api/calendarEventService.ts'),
  'utf8',
)
assert(weddingService.includes("type: 'wedding'"), 'wedding sync intact')

console.log('PASS  sessions calendar')
