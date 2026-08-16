/**
 * Run: npm run test:calendar-assignments
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  compareCalendarUiEvents,
  getAssignmentsInMonth,
  getMonthlyAssignmentStats,
  getNearestUpcomingAssignment,
} from '@/features/calendar/utils/assignmentMetrics'
import {
  mergeCalendarUiEvents,
  toCalendarSessionEvent,
  type CalendarSessionEvent,
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

function sessionEvent(
  partial: Partial<CalendarSessionEvent> &
    Pick<CalendarSessionEvent, 'entityId' | 'dateKey'>,
): CalendarSessionEvent {
  return {
    entityType: 'session',
    href: `/sesje/${partial.entityId}`,
    id: `session:${partial.entityId}`,
    title: 'Sesja',
    sessionTypeLabel: 'Narzeczeńska',
    timeLabel: partial.ceremonyTime ?? 'Godzina do ustalenia',
    colors: { background: '#fff', text: '#000', border: '#ccc' },
    packageColor: '#525252',
    assignmentTypeLabel: 'Sesja',
    assignmentValue: 0,
    session: {
      id: partial.entityId,
      date: partial.dateKey,
      primaryPerson: {},
      sessionType: 'engagement',
      totalPrice: 0,
      depositAmount: 0,
      payments: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    ...partial,
  }
}

const todayKey = '2026-07-28'

const earlySession = sessionEvent({
  entityId: 's-early',
  dateKey: '2026-08-10',
  ceremonyTime: '09:00',
  assignmentValue: 1200,
  title: 'Kasia',
})

const laterWedding = weddingEvent({
  entityId: 'w-later',
  dateKey: '2026-08-12',
  ceremonyTime: '14:00',
  assignmentValue: 9000,
})

const sameDayEarlierWedding = weddingEvent({
  entityId: 'w-early',
  dateKey: '2026-08-10',
  ceremonyTime: '08:00',
  assignmentValue: 5000,
})

const sameDayLaterSession = sessionEvent({
  entityId: 's-late',
  dateKey: '2026-08-10',
  ceremonyTime: '16:00',
  assignmentValue: 800,
})

// Adapter: session builder
{
  const built = toCalendarSessionEvent(
    session({
      id: '11111111-1111-4111-8111-111111111111',
      date: '2026-08-15',
      startTime: '10:00',
      totalPrice: 1500,
      primaryPerson: { firstName: 'Anna' },
    }),
  )
  assertEq(built.entityType, 'session', 'session entityType')
  assertEq(built.assignmentTypeLabel, 'Sesja', 'session badge')
  assertEq(built.assignmentValue, 1500, 'session value')
  assertEq(built.href, `/sesje/${built.entityId}`, 'session href')
}

assertEq(laterWedding.entityType, 'wedding', 'wedding entityType')
assertEq(laterWedding.assignmentTypeLabel, 'Ślub', 'wedding badge')
assertEq(laterWedding.href, `/sluby/${laterWedding.entityId}`, 'wedding href')

// Nearest prefers earlier session
{
  const nearest = getNearestUpcomingAssignment(
    [laterWedding, earlySession],
    todayKey,
  )
  assert(nearest?.entityType === 'session', 'nearest prefers earlier session')
  assertEq(nearest?.entityId, earlySession.entityId, 'nearest session id')
}

// Nearest prefers earlier wedding by time on same day
{
  const nearest = getNearestUpcomingAssignment(
    [sameDayLaterSession, sameDayEarlierWedding],
    todayKey,
  )
  assert(nearest?.entityType === 'wedding', 'nearest prefers earlier wedding')
  assertEq(
    nearest?.entityId,
    sameDayEarlierWedding.entityId,
    'nearest wedding id',
  )
}

// Month stats include sessions + summed values
{
  const events: CalendarUiEvent[] = [
    earlySession,
    laterWedding,
    sameDayLaterSession,
    sessionEvent({
      entityId: 's-sep',
      dateKey: '2026-09-01',
      assignmentValue: 300,
    }),
  ]
  const stats = getMonthlyAssignmentStats(events, new Date(2026, 7, 1))
  assertEq(stats.weddingCount, 1, 'august weddings')
  assertEq(stats.sessionCount, 2, 'august sessions')
  assertEq(stats.assignmentValue, 1200 + 9000 + 800, 'august value sum')
}

// Month list contains both entity types, sorted
{
  const list = getAssignmentsInMonth(
    [laterWedding, earlySession, sameDayLaterSession, sameDayEarlierWedding],
    new Date(2026, 7, 1),
  )
  assertEq(list.length, 4, 'month list length')
  assert(
    list.some((e) => e.entityType === 'wedding') &&
      list.some((e) => e.entityType === 'session'),
    'month list has both types',
  )
  for (let i = 1; i < list.length; i += 1) {
    assert(
      compareCalendarUiEvents(list[i - 1]!, list[i]!) <= 0,
      `sorted at ${i}`,
    )
  }
}

// Merge keeps wedding path + session href
{
  const merged = mergeCalendarUiEvents(
    [laterWedding],
    [
      session({
        id: earlySession.entityId,
        date: '2026-08-10',
        startTime: '09:00',
        totalPrice: 1200,
        primaryPerson: { firstName: 'Kasia' },
      }),
    ],
  )
  assertEq(merged.length, 2, 'merged count')
  assertEq(merged[0]?.entityType, 'session', 'merged order session first')
  assertEq(merged[1]?.entityType, 'wedding', 'merged order wedding second')
}

// Source wiring
{
  const page = readFileSync(resolve('src/pages/CalendarPage.tsx'), 'utf8')
  assert(page.includes('AddAssignmentDialog'), 'page wires chooser')
  assert(page.includes('openAssignmentChooser'), 'page opens chooser')
  assert(page.includes('mergeCalendarUiEvents'), 'page uses merge')
  assert(page.includes('<CalendarSummary events={events}'), 'summary uses events')
  assert(page.includes('<CalendarMonthWeddings'), 'month list wired')
  assert(!page.includes('to="/sluby/nowy"'), 'header no longer hard-links wedding')

  const summary = readFileSync(
    resolve('src/features/calendar/components/CalendarSummary.tsx'),
    'utf8',
  )
  assert(summary.includes('Najbliższe zlecenie'), 'nearest label')
  assert(summary.includes('getNearestUpcomingAssignment'), 'nearest helper')
  assert(summary.includes('getMonthlyAssignmentStats'), 'stats helper')

  const monthList = readFileSync(
    resolve('src/features/calendar/components/CalendarMonthWeddings.tsx'),
    'utf8',
  )
  assert(monthList.includes('Zlecenia w tym miesiącu'), 'month list title')
  assert(monthList.includes('Brak zleceń w tym miesiącu'), 'empty copy')
  assert(monthList.includes('getAssignmentsInMonth'), 'month list helper')

  const dialog = readFileSync(
    resolve('src/features/calendar/components/AddAssignmentDialog.tsx'),
    'utf8',
  )
  assert(dialog.includes('/sluby/nowy'), 'dialog wedding path')
  assert(dialog.includes('/sesje/nowa'), 'dialog session path')
  assert(dialog.includes('Dodaj zlecenie'), 'dialog title')
  assert(
    dialog.includes('Wybierz rodzaj zlecenia'),
    'dialog description remains',
  )
  assert(dialog.includes('Ślub'), 'dialog Ślub option')
  assert(dialog.includes('Sesja'), 'dialog Sesja option')
  assert(dialog.includes('showClose'), 'dialog X close remains')
  assert(dialog.includes('hideFooter'), 'dialog hides Anuluj footer')
  assert(!dialog.includes('Anuluj'), 'dialog has no Anuluj')
  assert(!dialog.includes('cancelLabel'), 'dialog has no cancelLabel')
  assert(
    dialog.includes('?date=${encodeURIComponent(dateKey)}'),
    'dialog preserves tapped date for create routes',
  )

  const monthView = readFileSync(
    resolve('src/features/calendar/components/CalendarMonthView.tsx'),
    'utf8',
  )
  assert(
    monthView.includes('accessibleDayLabel'),
    'empty day has accessible label helper',
  )
  assert(
    monthView.includes('Dodaj zlecenie —'),
    'accessible label uses Dodaj zlecenie — date',
  )
  assert(monthView.includes("role={canCreate ? 'button'"), 'empty day is button')
  assert(
    monthView.includes('tabIndex={canCreate ? 0'),
    'empty day is keyboard focusable',
  )
  assert(
    monthView.includes("e.key === 'Enter' || e.key === ' '"),
    'empty day supports Enter/Space',
  )
  assert(
    monthView.includes('aria-hidden="true"'),
    'visible add hint is aria-hidden (desktop hover only)',
  )
  assert(
    monthView.includes('onAddAssignment?.(dateKey)'),
    'empty day passes tapped dateKey',
  )

  const monthCss = readFileSync(
    resolve('src/features/calendar/components/CalendarMonthView.module.css'),
    'utf8',
  )
  assert(
    monthCss.includes('@media (max-width: 900px)'),
    'mobile breakpoint hides empty-cell add hint',
  )
  assert(
    /@media \(max-width: 900px\)[\s\S]*?\.addHint\s*\{\s*display:\s*none/m.test(
      monthCss,
    ),
    'mobile hides + Dodaj zlecenie addHint',
  )
  assert(monthCss.includes('.today .dayNumber'), 'today styling preserved')
  assert(
    monthCss.includes('.emptyCell:focus-visible'),
    'empty cell has visible focus state',
  )

  const chip = readFileSync(
    resolve('src/features/calendar/components/CalendarEventChip.tsx'),
    'utf8',
  )
  assert(
    chip.includes('e.stopPropagation()'),
    'event chip stops propagation so event tap does not open chooser',
  )

  const detail = readFileSync(resolve('src/pages/SessionDetailPage.tsx'), 'utf8')
  assert(detail.includes('commandHeader'), 'session detail command header')
  assert(detail.includes('overviewBand'), 'session detail band')
  assert(!detail.includes('role="tablist"'), 'session detail no tabs')
  assert(!detail.includes('Generuj umowę'), 'no wedding contract CTA')
}

console.log('PASS  calendar assignments')
