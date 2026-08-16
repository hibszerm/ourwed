/**
 * Run: npm run test:dashboard-assignments
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getNearestUpcomingAssignment,
  getNextAssignmentsAfterNearest,
  getUpcomingAssignments,
} from '@/features/calendar/utils/assignmentMetrics'
import {
  buildAssignmentEvents,
  toCalendarSessionEvent,
  type CalendarUiEvent,
  type CalendarWeddingEvent,
} from '@/features/calendar/utils/calendarEvents'
import type { Session } from '@/types/session'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function session(
  partial: Partial<Session> & Pick<Session, 'id' | 'date'>,
): Session {
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

function weddingEvent(
  partial: Partial<CalendarWeddingEvent> &
    Pick<CalendarWeddingEvent, 'entityId' | 'dateKey'>,
): CalendarWeddingEvent {
  return {
    entityType: 'wedding',
    href: `/sluby/${partial.entityId}`,
    id: `ev-${partial.entityId}`,
    title: 'Para',
    coupleLabel: 'Para',
    ceremonyLocation: '—',
    receptionLocation: '—',
    timeLabel: partial.ceremonyTime ?? 'Godzina do ustalenia',
    colors: { background: '#fff', text: '#000', border: '#ccc' },
    packageName: 'Pakiet',
    packageColor: '#000',
    assignmentTypeLabel: 'Ślub',
    assignmentValue: 0,
    wedding: { id: partial.entityId } as CalendarWeddingEvent['wedding'],
    ...partial,
  }
}

const todayKey = '2026-07-28'

const heroSession = toCalendarSessionEvent(
  session({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    date: '2026-08-01',
    startTime: '10:00',
    primaryPerson: { firstName: 'Kasia' },
  }),
)

const laterWedding = weddingEvent({
  entityId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  dateKey: '2026-08-05',
  ceremonyTime: '14:00',
  title: 'Anna i Jan',
  href: '/sluby/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
})

const third = weddingEvent({
  entityId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  dateKey: '2026-08-10',
  title: 'Ola i Piotr',
  href: '/sluby/cccccccc-cccc-4ccc-8ccc-cccccccccccc',
})

const fourth = toCalendarSessionEvent(
  session({
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    date: '2026-08-12',
    startTime: '09:00',
    primaryPerson: { firstName: 'Marta' },
  }),
)

const events: CalendarUiEvent[] = [
  laterWedding,
  heroSession,
  fourth,
  third,
]

// nearest may be session
{
  const nearest = getNearestUpcomingAssignment(events, todayKey)
  assertEq(nearest?.entityType, 'session', 'nearest may be session')
  assertEq(nearest?.entityId, heroSession.entityId, 'nearest session id')
  assertEq(nearest?.href, `/sesje/${heroSession.entityId}`, 'hero session href')
}

// nearest may be wedding
{
  const weddingOnly = [laterWedding, third]
  const nearest = getNearestUpcomingAssignment(weddingOnly, todayKey)
  assertEq(nearest?.entityType, 'wedding', 'nearest may be wedding')
  assertEq(nearest?.href, laterWedding.href, 'hero wedding href')
}

// next three exclude hero, chronological
{
  const next = getNextAssignmentsAfterNearest(events, 3, todayKey)
  assertEq(next.length, 3, 'exactly three')
  assert(
    next.every((e) => e.entityId !== heroSession.entityId),
    'hero excluded',
  )
  assertEq(next[0]?.entityId, laterWedding.entityId, 'first after hero')
  assertEq(next[1]?.entityId, third.entityId, 'second after hero')
  assertEq(next[2]?.entityId, fourth.entityId, 'third after hero')
}

// upcoming ordering
{
  const upcoming = getUpcomingAssignments(events, todayKey)
  assertEq(upcoming[0]?.entityId, heroSession.entityId, 'order 0')
  assertEq(upcoming[1]?.entityId, laterWedding.entityId, 'order 1')
}

// buildAssignmentEvents includes both
{
  const built = buildAssignmentEvents(
    [],
    [
      session({
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        date: '2026-09-01',
        primaryPerson: { firstName: 'Ewa' },
      }),
    ],
  )
  assertEq(built.length, 1, 'built sessions')
  assertEq(built[0]?.entityType, 'session', 'built type')
  assert(built[0] && 'session' in built[0], 'session payload present')
}

// Dashboard wiring
{
  const page = readFileSync(resolve('src/pages/DashboardPage.tsx'), 'utf8')
  assert(page.includes('buildAssignmentEvents'), 'page builds once')
  assert(page.includes('getNearestUpcomingAssignment'), 'page nearest')
  assert(page.includes('getNextAssignmentsAfterNearest'), 'page next three')
  assert(page.includes('NextAssignmentsSection'), 'page next section')
  assert(page.includes('NextAssignmentCard'), 'page hero card')
  assert(page.includes('useDashboardAssignments'), 'page loads light assignments')
  assert(!page.includes('useWeddings'), 'page must not use heavy useWeddings')
  assert(!page.includes('useSessions'), 'page must not use full useSessions')

  const hero = readFileSync(
    resolve('src/features/dashboard/components/NextWeddingCard.tsx'),
    'utf8',
  )
  assert(hero.includes('Najbliższe zlecenie'), 'hero label')
  assert(hero.includes('assignment.href'), 'hero navigates by href')
  assert(hero.includes('Otwórz'), 'hero CTA')
  assert(!hero.includes('getWeddingBusinessStatus'), 'no hero business status badge')
  assert(hero.includes('getDashboardLocationLabel'), 'hero location')
  assert(!hero.includes('buildDashboardJobReadiness'), 'no readiness helper')
  assert(!hero.includes('getAssignmentContextItems'), 'no fact checklist')
  assert(!hero.includes('Wymaga działania'), 'no attention readiness')
  assert(!hero.includes('Gotowe do realizacji'), 'no ready readiness')
  assert(!hero.includes('Wyślij ankietę przedślubną'), 'no questionnaire action')
  assert(!hero.includes('Oczekuje na podpis umowy'), 'no contract action')
  assert(!hero.includes('Oczekuje na wpłatę zaliczki'), 'no deposit action')
  assert(!hero.includes('Uzupełnij lokalizacje'), 'no location action')
  assert(!hero.includes('Umowa podpisana'), 'no contract fact')
  assert(!hero.includes('Zaliczka opłacona'), 'no deposit fact')
  assert(!hero.includes('Ankieta niewysłana'), 'no questionnaire fact')
  assert(hero.includes('countdown'), 'countdown present')
  assert(hero.includes('assignmentTypeLabel'), 'entity badge')
  assert(!hero.includes('workflowStage'), 'no workflowStage on hero')
  assert(!hero.includes('WORKFLOW_STAGE_LABELS'), 'no stage labels on hero')
  assert(!hero.includes('WorkflowBadge'), 'no WorkflowBadge on hero')

  const next = readFileSync(
    resolve('src/features/dashboard/components/NextAssignmentsSection.tsx'),
    'utf8',
  )
  assert(next.includes('Kolejne zlecenia'), 'next title')
  assert(next.includes('assignment.href'), 'card navigation')
  assert(
    !next.includes('getWeddingBusinessStatus'),
    'no upcoming business status badge',
  )
  assert(next.includes('getDashboardLocationLabel'), 'upcoming location')
  assert(next.includes('assignmentTypeLabel'), 'upcoming entity badge')
  assert(!next.includes('WorkflowBadge'), 'no workflow badge')
  assert(!next.includes('workflowStage'), 'no workflowStage on upcoming')
  assert(!next.includes('WORKFLOW_STAGE_LABELS'), 'no stage labels on upcoming')
}

console.log('PASS  dashboard assignments')
