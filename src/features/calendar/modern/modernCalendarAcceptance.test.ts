/**
 * Modern /kalendarz presentation port.
 * Run: npm run test:modern-calendar
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveScreenPresentation } from '@/features/interface-style/types'
import {
  formatModernCalendarRemainingValue,
  getModernCalendarLocationSlot,
  getModernCalendarPreviewPlaces,
  getModernCalendarPreviewTime,
  getModernCalendarRemaining,
  getModernCalendarSupportingLine,
  getModernCalendarTypeSlot,
  getModernCalendarValueLabel,
} from '@/features/calendar/modern/modernCalendarModel'
import { CALENDAR_VIEW_MODE_KEY } from '@/features/calendar/modern/calendarViewMode'
import { SESSIONS_VIEW_MODE_KEY } from '@/features/sessions/presentation/sessionsViewMode'
import { WEDDINGS_VIEW_MODE_KEY } from '@/features/weddings/presentation/weddingsViewMode'
import {
  getAssignmentsInMonth,
  getMonthlyAssignmentStats,
  getNearestUpcomingAssignment,
} from '@/features/calendar/utils/assignmentMetrics'
import {
  formatLedgerFullDate,
  getEditorialDateParts,
} from '@/features/weddings/modern/modernWeddingsModel'
import { formatCurrency } from '@/lib/utils/currency'
import type {
  CalendarSessionEvent,
  CalendarUiEvent,
  CalendarWeddingEvent,
} from '@/features/calendar/utils/calendarEvents'
import type { WeddingPrimaryLocationSummary } from '@/types/wedding'

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(actual: T, expected: T, m: string) {
  if (actual !== expected) {
    throw new Error(`${m}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

function receptionLocation(
  partial: Partial<WeddingPrimaryLocationSummary> = {},
): WeddingPrimaryLocationSummary {
  return {
    venueName: 'Villa Love',
    locality: 'Izdebnik',
    displayText: 'Villa Love, Izdebnik',
    source: 'reception',
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
    title: 'Anna i Jan',
    coupleLabel: 'Anna i Jan',
    ceremonyLocation: '—',
    receptionLocation: '—',
    timeLabel: partial.ceremonyTime ?? 'Godzina do ustalenia',
    colors: { background: '#fff', text: '#000', border: '#ccc' },
    packageName: 'Video Mini',
    packageColor: '#000',
    assignmentTypeLabel: 'Ślub',
    assignmentValue: 12900,
    locationSummary: 'Villa Love, Izdebnik',
    wedding: {
      id: partial.entityId,
      primaryLocation: receptionLocation(),
    } as CalendarWeddingEvent['wedding'],
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
    title: 'Kasia',
    sessionTypeLabel: 'Narzeczeńska',
    timeLabel: partial.ceremonyTime ?? 'Godzina do ustalenia',
    colors: { background: '#fff', text: '#000', border: '#ccc' },
    packageColor: '#525252',
    assignmentTypeLabel: 'Sesja',
    assignmentValue: 2500,
    locationSummary: 'Dwór, Kraków',
    session: {
      id: partial.entityId,
      date: partial.dateKey,
      primaryPerson: {},
      sessionType: 'engagement',
      totalPrice: 2500,
      depositAmount: 0,
      payments: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    ...partial,
  }
}

{
  assertEq(
    resolveScreenPresentation('calendar', 'classic'),
    'classic',
    'classic style keeps classic calendar',
  )
  assertEq(
    resolveScreenPresentation('calendar', 'modern'),
    'modern',
    'modern style selects modern calendar',
  )
  assertEq(
    resolveScreenPresentation('weddings', 'modern'),
    'modern',
    'weddings remain modern-capable',
  )
  assertEq(
    resolveScreenPresentation('sessions', 'modern'),
    'modern',
    'sessions remain modern-capable',
  )
  const router = read('src/routes/router.tsx')
  const routePage = read('src/pages/CalendarRoutePage.tsx')
  const classic = read('src/pages/CalendarPage.tsx')
  const modern = read('src/pages/CalendarModernPage.tsx')
  assert(router.includes('CalendarRoutePage'), '/kalendarz uses route resolver')
  assert(!router.includes("path: '/kalendarz-modern'"), 'no extra modern path')
  assert(!router.includes("path: '/kalendarz-v2'"), 'no v2 calendar path')
  assert(!router.includes("path: '/kalendarz-v3'"), 'no v3 calendar path')
  assert(routePage.includes('<CalendarPage />'), 'classic calendar reachable')
  assert(routePage.includes('<CalendarModernPage />'), 'modern calendar reachable')
  assert(
    routePage.includes("resolveScreenPresentation('calendar'"),
    'calendar registry',
  )
  assert(!classic.includes('useInterfaceStyle'), 'classic page has no style branching')
  assert(!classic.includes('CalendarModernPage'), 'classic page is not the modern tree')
  assert(modern.includes('useCalendarWeddings'), 'modern uses calendar weddings hook')
  assert(modern.includes('useCalendarSessions'), 'modern uses calendar sessions hook')
  assert(modern.includes('useCalendarEvents'), 'modern uses calendar events hook')
  assert(!modern.includes("from '@/features/weddings/hooks/useWeddings'"), 'modern does not use full useWeddings')
  assert(!modern.includes("from '@/features/sessions/hooks/useSessions'"), 'modern does not use full useSessions')
  console.log('PASS  presentation routing')
}

{
  const classic = read('src/pages/CalendarPage.tsx')
  assert(classic.includes('CalendarSummary'), 'classic summary kept')
  assert(classic.includes('CalendarToolbar'), 'classic toolbar kept')
  assert(classic.includes('CalendarMonthView'), 'classic month kept')
  assert(classic.includes('CalendarWeekView'), 'classic week kept')
  assert(classic.includes('CalendarMonthWeddings'), 'classic month list kept')
  assert(classic.includes('CalendarDrawer'), 'classic drawer kept')
  assert(classic.includes('AddAssignmentDialog'), 'classic chooser kept')
  assert(!classic.includes('v3Material'), 'classic calendar does not opt into modern materials')
  assert(!classic.includes('interfaceStyle'), 'classic has no style branching')
  assert(!classic.includes('ourwed:calendar-view-mode'), 'classic has no collection view key')
  console.log('PASS  classic freeze')
}

{
  assertEq(CALENDAR_VIEW_MODE_KEY, 'ourwed:calendar-view-mode', 'calendar collection key')
  assert(
    String(CALENDAR_VIEW_MODE_KEY) !== String(WEDDINGS_VIEW_MODE_KEY),
    'calendar does not reuse weddings key',
  )
  assert(
    String(CALENDAR_VIEW_MODE_KEY) !== String(SESSIONS_VIEW_MODE_KEY),
    'calendar does not reuse sessions key',
  )
  const modern = read('src/pages/CalendarModernPage.tsx')
  const workspace = read(
    'src/features/calendar/modern/ModernCalendarWorkspace.tsx',
  )
  assert(modern.includes('readCalendarViewMode'), 'modern reads collection pref')
  assert(modern.includes('writeCalendarViewMode'), 'modern writes collection pref')
  assert(modern.includes("useState<CalendarViewMode>('month')"), 'month/week default month')
  assert(!modern.includes('writeCalendarViewMode(calendarView)'), 'month/week is not persisted')
  assert(workspace.includes('calendarView'), 'calendar month/week is separate state')
  assert(workspace.includes('collectionView'), 'collection kafelki/lista is separate state')
  console.log('PASS  view-mode persistence isolated')
}

{
  const wedding = weddingEvent({ entityId: 'w1', dateKey: '2026-08-20' })
  const session = sessionEvent({ entityId: 's1', dateKey: '2026-08-10' })
  assertEq(getModernCalendarLocationSlot(wedding), 'Villa Love, Izdebnik', 'wedding location')
  assertEq(getModernCalendarTypeSlot(wedding), 'Video Mini', 'wedding package')
  assertEq(getModernCalendarValueLabel(wedding), formatCurrency(12900), 'wedding value')
  assertEq(
    getModernCalendarSupportingLine(wedding),
    'Villa Love, Izdebnik  ·  Video Mini',
    'wedding supporting',
  )
  assertEq(getModernCalendarLocationSlot(session), 'Dwór, Kraków', 'session location')
  assertEq(getModernCalendarTypeSlot(session), 'Narzeczeńska', 'session type')
  assertEq(getModernCalendarValueLabel(session), formatCurrency(2500), 'session value')
  assertEq(
    getModernCalendarSupportingLine(session),
    'Dwór, Kraków  ·  Narzeczeńska',
    'session supporting',
  )
  assertEq(
    getModernCalendarValueLabel(weddingEvent({ entityId: 'z', dateKey: '2026-08-20', assignmentValue: 0 })),
    null,
    'omit zero collection value',
  )
  assertEq(
    getModernCalendarTypeSlot(
      weddingEvent({ entityId: 'p', dateKey: '2026-08-20', packageName: '' }),
    ),
    null,
    'empty package omitted',
  )
  assertEq(
    getModernCalendarLocationSlot(
      weddingEvent({
        entityId: 'l',
        dateKey: '2026-08-20',
        locationSummary: undefined,
        wedding: { id: 'l' } as CalendarWeddingEvent['wedding'],
      }),
    ),
    null,
    'missing location omitted',
  )
  assertEq(wedding.href, '/sluby/w1', 'wedding href')
  assertEq(session.href, '/sesje/s1', 'session href')
  console.log('PASS  wedding/session collection mapping')
}

{
  const events: CalendarUiEvent[] = [
    sessionEvent({ entityId: 's-early', dateKey: '2026-08-10', ceremonyTime: '09:00', assignmentValue: 1200 }),
    weddingEvent({ entityId: 'w-later', dateKey: '2026-08-12', ceremonyTime: '14:00', assignmentValue: 9000 }),
    sessionEvent({ entityId: 's-sep', dateKey: '2026-09-01', assignmentValue: 300 }),
  ]
  const stats = getMonthlyAssignmentStats(events, new Date(2026, 7, 1))
  assertEq(stats.weddingCount, 1, 'august weddings')
  assertEq(stats.sessionCount, 1, 'august sessions')
  assertEq(stats.assignmentValue, 1200 + 9000, 'august value sum')
  const nearest = getNearestUpcomingAssignment(events, '2026-07-28')
  assertEq(nearest?.entityId, 's-early', 'nearest is global earliest from today')
  assert(nearest?.dateKey !== '2026-09-01', 'nearest is not first-in-selected-month')
  const month = getAssignmentsInMonth(events, new Date(2026, 7, 1))
  assertEq(month.length, 2, 'august collection excludes september')
  assert(!month.some((e) => e.dateKey.startsWith('2026-09')), 'collection is selected month')
  console.log('PASS  month scope + nearest + stats')
}

{
  const page = read('src/pages/CalendarModernPage.tsx')
  const workspace = read(
    'src/features/calendar/modern/ModernCalendarWorkspace.tsx',
  )
  assert(page.includes('startOfMonth(new Date())'), 'current month default')
  assert(workspace.includes('onToday'), 'Dziś wired')
  assert(page.includes('handleToday'), 'Dziś handler')
  assert(page.includes('handlePrev'), 'prev handler')
  assert(page.includes('handleNext'), 'next handler')
  assert(page.includes('addMonths'), 'month ±1')
  assert(page.includes('addDays(startOfWeek(current), -7)'), 'week prev ±7')
  assert(page.includes('addDays(startOfWeek(current), 7)'), 'week next ±7')
  assert(page.includes("next === 'month' ? startOfMonth(current)"), 'month snap')
  assert(!page.includes('useSearchParams'), 'no URL month state')
  assert(!page.includes('localStorage') || page.includes('writeCalendarViewMode'), 'only collection pref uses storage')
  assert(workspace.includes('CalendarToolbar'), 'toolbar preserved')
  assert(workspace.includes('ModernCalendarMonthView'), 'modern month view')
  assert(
    !workspace.includes("from '@/features/calendar/components/CalendarMonthView'"),
    'classic month view not used in modern',
  )
  assert(workspace.includes('CalendarWeekView'), 'week view preserved')
  assert(workspace.includes('CalendarSummary'), 'summary preserved')
  assert(!workspace.includes('CalendarDrawer'), 'modern does not use classic drawer')
  assert(workspace.includes('CalendarQuickPreviewModal'), 'modern quick preview')
  assert(page.includes('AddAssignmentDialog'), 'chooser preserved')
  assert(page.includes('openAssignmentChooser'), 'chooser opener')
  assert(workspace.includes('onAddAssignment'), 'empty day create preserved')
  const monthView = read(
    'src/features/calendar/modern/ModernCalendarMonthView.tsx',
  )
  assert(monthView.includes('getMonthGrid'), 'month grid helper frozen')
  assert(monthView.includes('const MAX_VISIBLE = 3'), 'overflow limit frozen')
  assert(
    monthView.includes("['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Niedz']"),
    'monday-start headers frozen',
  )
  const weekView = read('src/features/calendar/components/CalendarWeekView.tsx')
  assert(weekView.includes('getWeekDays'), 'week days helper frozen')
  assert(weekView.includes('getEventPositionPercent'), 'week positioning frozen')
  assert(weekView.includes('allDayRow'), 'all-day area frozen')
  console.log('PASS  calendar product behavior preserved')
}

{
  const card = read(
    'src/features/calendar/modern/ModernCalendarAssignmentCard.tsx',
  )
  const ledger = read(
    'src/features/calendar/modern/ModernCalendarAssignmentLedger.tsx',
  )
  const workspace = read(
    'src/features/calendar/modern/ModernCalendarWorkspace.tsx',
  )
  const page = read('src/pages/CalendarModernPage.tsx')
  const modern = [card, ledger, workspace, page].join('\n')
  assert(workspace.includes('getAssignmentsInMonth'), 'collection uses month helper')
  assert(workspace.includes('startOfMonth(anchor)'), 'collection scoped to month')
  assert(workspace.includes('ModernCalendarAssignmentCard'), 'kafelki')
  assert(workspace.includes('ModernCalendarAssignmentLedger'), 'lista')
  assert(workspace.includes('ModernCalendarViewSwitch'), 'kafelki/lista switch')
  assert(!workspace.includes('Poprzednie sezony'), 'no previous seasons')
  assert(!workspace.includes('Wszystkie'), 'no season chips')
  assert(!modern.includes('type="search"'), 'no search field')
  assert(!card.includes('getNearTermCue'), 'kafelki no countdown helper')
  assert(!card.includes('countdown'), 'kafelki no countdown')
  assert(!card.includes('Za '), 'kafelki no za-n-dni')
  assert(!card.includes('Dziś'), 'kafelki no dziś cue')
  assert(!ledger.includes('countdown'), 'lista no countdown')
  assert(!ledger.includes('getNearTermCue'), 'lista no countdown helper')
  assert(!ledger.includes('Za '), 'lista no za-n-dni')
  assert(ledger.includes('formatLedgerFullDate'), 'lista full date')
  assert(card.includes('event.href'), 'kafelki uses event href')
  assert(ledger.includes('event.href'), 'lista uses event href')
  assert(card.includes('ModernWeddingsDate'), 'kafelki date stack')
  assert(card.includes('styles.locationSlot'), 'stable location slot')
  assert(card.includes('styles.packageSlot'), 'stable type slot')
  assert(card.includes('styles.couple'), 'stable title zone')
  assert(!card.includes('Brak lokalizacji'), 'no location placeholder')
  assert(!card.includes("'—'"), 'no em-dash placeholder')
  assert(!card.includes('Otwórz zlecenie'), 'no footer cta')
  assert(!ledger.includes('Otwórz zlecenie'), 'lista no footer cta')
  assert(!card.includes('Badge'), 'kafelki no badge')
  assert(!ledger.includes('Badge'), 'lista no badge')
  assert(workspace.includes('Brak zleceń w tym miesiącu'), 'empty month copy')
  assert(workspace.includes('+ Dodaj zlecenie'), 'empty month create')
  assert(!page.includes('useWedding('), 'no per-card getById')
  assert(!workspace.includes('useWedding('), 'workspace no getById')
  assert(!workspace.includes('weddingPlaceService'), 'workspace no per-card places')
  assert(!page.includes('weddingPlaceService'), 'page no places')
  assert(card.includes('getModernCalendarLocationSlot'), 'kafelki uses location slot')
  assert(ledger.includes('getModernCalendarSupportingLine'), 'lista uses supporting line')
  console.log('PASS  collection anatomy')
}

{
  const parts = getEditorialDateParts('2026-08-20')
  if (!parts) throw new Error('date parts')
  const fullDate = formatLedgerFullDate(parts)
  assertEq(fullDate, '20 SIE 2026', 'accepted lista full-date format')
  console.log('PASS  lista full date')
}

{
  const files = [
    'src/pages/CalendarModernPage.tsx',
    'src/pages/CalendarModernPage.module.css',
    'src/features/calendar/modern/ModernCalendarWorkspace.tsx',
    'src/features/calendar/modern/ModernCalendarWorkspace.module.css',
    'src/features/calendar/modern/ModernCalendarAssignmentCard.tsx',
    'src/features/calendar/modern/ModernCalendarAssignmentCard.module.css',
    'src/features/calendar/modern/ModernCalendarAssignmentLedger.tsx',
    'src/features/calendar/modern/ModernCalendarAssignmentLedger.module.css',
    'src/features/calendar/modern/ModernCalendarViewSwitch.tsx',
    'src/features/calendar/modern/ModernCalendarViewSwitch.module.css',
    'src/features/calendar/modern/ModernCalendarMonthView.tsx',
    'src/features/calendar/modern/ModernCalendarMonthView.module.css',
    'src/features/calendar/modern/ModernCalendarEventChip.tsx',
    'src/features/calendar/modern/ModernCalendarEventChip.module.css',
    'src/features/calendar/modern/CalendarQuickPreviewModal.tsx',
    'src/features/calendar/modern/CalendarQuickPreviewModal.module.css',
  ]
  for (const file of files) {
    assert(existsSync(resolve(process.cwd(), file)), file)
    const src = read(file)
    assert(!src.includes('backdrop-filter'), `${file} no backdrop-filter`)
    assert(!src.includes('-webkit-backdrop-filter'), `${file} no webkit blur`)
    assert(!src.includes('#F2E9DE'), `${file} no graphite paper hardcode`)
    assert(!src.includes('#22333B'), `${file} no graphite navy hardcode`)
  }
  const page = read('src/pages/CalendarModernPage.tsx')
  assert(page.includes("withDevPerf('calendar.repair'"), 'deferred repair kept')
  assert(page.includes('calendarEventService.syncWeddingDayEvents'), 'repair still deferred')
  assert(!page.includes('useCalendarWeddingNextAction'), 'next action not on first paint')
  console.log('PASS  glass / theme / performance source')
}

{
  const page = read('src/pages/CalendarModernPage.tsx')
  const pageCss = read('src/pages/CalendarModernPage.module.css')
  const workspace = read(
    'src/features/calendar/modern/ModernCalendarWorkspace.tsx',
  )
  const workspaceCss = read(
    'src/features/calendar/modern/ModernCalendarWorkspace.module.css',
  )
  const cardCss = read(
    'src/features/calendar/modern/ModernCalendarAssignmentCard.module.css',
  )
  const ledgerCss = read(
    'src/features/calendar/modern/ModernCalendarAssignmentLedger.module.css',
  )
  const weddingCardCss = read(
    'src/features/weddings/modern/ModernWeddingCard.module.css',
  )
  const weddingLedgerCss = read(
    'src/features/weddings/modern/ModernWeddingLedger.module.css',
  )
  assert(pageCss.includes('--modern-motion-fast: 150ms'), 'fast token')
  assert(pageCss.includes('--modern-motion-base: 240ms'), 'base token')
  assert(pageCss.includes('--modern-motion-slow: 300ms'), 'slow token')
  assert(workspaceCss.includes('modernCalendarEnter'), 'workspace entrance')
  assert(workspaceCss.includes('modernCalendarViewIn'), 'view-mode enter')
  assert(workspace.includes('key={viewMode}'), 'kafelki/lista remounts')
  assert(page.includes("isLoading ? 'soft' : 'full'") || page.includes("? 'soft' : 'full'"), 'soft loading entrance')
  assert(!page.includes('setTimeout'), 'no artificial delay')
  assert(!workspace.includes("from 'framer-motion'"), 'no framer')
  assert(!workspace.includes('gsap'), 'no gsap')
  assert(workspaceCss.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion')
  assert(pageCss.includes('@media (prefers-reduced-motion: reduce)'), 'header reduced motion')
  assert(cardCss === weddingCardCss, 'kafelki geometry is a 1:1 collection port')
  assert(ledgerCss === weddingLedgerCss, 'lista geometry is a 1:1 collection port')
  assert(workspaceCss.includes('repeat(3, minmax(0, 1fr))'), '3 columns')
  assert(workspaceCss.includes('@media (max-width: 1100px)'), '2-col breakpoint')
  assert(workspaceCss.includes('@media (max-width: 767px)'), '1-col breakpoint')
  assert(!workspaceCss.includes('@media (max-width: 720px)'), 'workspace 720 migrated')
  console.log('PASS  motion + collection geometry')
}

{
  const dash = read('src/pages/DashboardV3Page.tsx')
  const classicDash = read('src/pages/DashboardPage.tsx')
  const layout = read('src/layouts/AppLayout.tsx')
  const sidebar = read('src/layouts/Sidebar.tsx')
  const weddingsModern = read('src/pages/WeddingsModernPage.tsx')
  const sessionsModern = read('src/pages/SessionsModernPage.tsx')
  const classicCal = read('src/pages/CalendarPage.tsx')
  assert(dash.includes('DashboardV3Hero'), 'modern dashboard untouched')
  assert(classicDash.includes('TodoTodayCard'), 'classic dashboard untouched')
  assert(layout.includes('resolveActiveShellPresentation(interfaceStyle)'), 'shell unchanged')
  assert(sidebar.includes("label: 'Kalendarz'"), 'sidebar IA unchanged')
  assert(weddingsModern.includes('Importuj z pliku'), 'modern weddings untouched')
  assert(sessionsModern.includes('Dodaj sesję'), 'modern sessions untouched')
  assert(classicCal.includes('CalendarMonthWeddings'), 'classic calendar collection untouched')
  console.log('PASS  regression freeze')
}

{
  const remainingToday = getModernCalendarRemaining('2026-08-18', '2026-08-18')
  const remainingSoon = getModernCalendarRemaining('2026-08-20', '2026-08-18')
  const remainingPast = getModernCalendarRemaining('2026-08-01', '2026-08-18')
  const remainingOne = getModernCalendarRemaining('2026-08-19', '2026-08-18')
  assertEq(remainingToday?.kind, 'today', 'today remaining')
  assertEq(remainingSoon?.kind, 'future', 'future remaining kind')
  assertEq(
    remainingSoon && remainingSoon.kind === 'future' ? remainingSoon.days : null,
    2,
    'future remaining days',
  )
  assertEq(remainingPast, null, 'past remaining omitted')
  assertEq(
    remainingOne && remainingOne.kind === 'future'
      ? formatModernCalendarRemainingValue(remainingOne.days)
      : null,
    '1 dzień',
    'one-day polish',
  )
  assertEq(formatModernCalendarRemainingValue(2), '2 dni', 'n-days polish')
  const wedding = weddingEvent({
    entityId: 'w1',
    dateKey: '2026-08-20',
    ceremonyTime: '15:00',
    timeLabel: '15:00',
    ceremonyLocation: 'Kościół Mariacki',
    receptionLocation: 'Lwowska 78, 34-144 Izdebnik',
    locationSummary: 'Lwowska 78, 34-144 Izdebnik',
  })
  const weddingUnknownTime = weddingEvent({
    entityId: 'w2',
    dateKey: '2026-08-20',
    timeLabel: 'Godzina do ustalenia',
  })
  const weddingMissingLocation = weddingEvent({
    entityId: 'w3',
    dateKey: '2026-08-20',
    ceremonyLocation: '—',
    receptionLocation: '—',
    locationSummary: undefined,
    wedding: { id: 'w3' } as CalendarWeddingEvent['wedding'],
  })
  const session = sessionEvent({
    entityId: 's1',
    dateKey: '2026-08-10',
    ceremonyTime: '11:00',
    timeLabel: '11:00 – 12:00',
    locationSummary: 'Dwór, Kraków',
  })
  assertEq(getModernCalendarPreviewTime(wedding), '15:00', 'wedding time')
  assertEq(getModernCalendarPreviewTime(weddingUnknownTime), null, 'unknown time omitted')
  assertEq(getModernCalendarPreviewTime(session), '11:00 – 12:00', 'session time range')
  assertEq(getModernCalendarPreviewPlaces(wedding).ceremony, null, 'preview omits ceremony')
  assertEq(
    getModernCalendarPreviewPlaces(wedding).reception,
    'Villa Love, Izdebnik',
    'preview reception compact',
  )
  assertEq(getModernCalendarPreviewPlaces(weddingMissingLocation).ceremony, null, 'missing ceremony omitted')
  assertEq(getModernCalendarPreviewPlaces(weddingMissingLocation).reception, null, 'missing reception omitted')
  assertEq(getModernCalendarPreviewPlaces(session).session, 'Dwór, Kraków', 'session location')
  assertEq(getModernCalendarPreviewPlaces(session).ceremony, null, 'session has no ceremony row')
  assertEq(getModernCalendarPreviewPlaces(session).reception, null, 'session has no reception row')
  console.log('PASS  preview remaining + places mapping')
}

{
  const preview = read(
    'src/features/calendar/modern/CalendarQuickPreviewModal.tsx',
  )
  const previewCss = read(
    'src/features/calendar/modern/CalendarQuickPreviewModal.module.css',
  )
  const workspace = read(
    'src/features/calendar/modern/ModernCalendarWorkspace.tsx',
  )
  const classicPage = read('src/pages/CalendarPage.tsx')
  const classicDrawer = read(
    'src/features/calendar/components/CalendarDrawer.tsx',
  )
  const overlay = read('src/components/ui/overlay/useOverlay.ts')
  const backdrop = read('src/components/ui/Backdrop.module.css')
  const modernPage = read('src/pages/CalendarModernPage.tsx')
  const chip = read(
    'src/features/calendar/modern/ModernCalendarEventChip.tsx',
  )
  const chipCss = read(
    'src/features/calendar/modern/ModernCalendarEventChip.module.css',
  )
  const classicChipCss = read(
    'src/features/calendar/components/CalendarEventChip.module.css',
  )
  const classicMonth = read(
    'src/features/calendar/components/CalendarMonthView.tsx',
  )
  const classicChip = read(
    'src/features/calendar/components/CalendarEventChip.tsx',
  )

  assert(workspace.includes('CalendarQuickPreviewModal'), 'modern preview wired')
  assert(!workspace.includes('CalendarDrawer'), 'modern workspace has no drawer')
  assert(classicPage.includes('CalendarDrawer'), 'classic still uses drawer')
  assert(classicPage.includes('CalendarMonthView'), 'classic still uses month view')
  assert(classicPage.includes('CalendarEventChip') || classicMonth.includes('CalendarEventChip'), 'classic chips remain')
  assert(classicChip.includes('resolveCalendarEventColors'), 'classic chips appearance-aware')
  assert(!chip.includes('event.colors'), 'modern chips do not use event colors')
  assert(classicChipCss.includes('border: 1px solid'), 'classic chip outline frozen')
  assert(chipCss.includes('border: 0'), 'modern chip drops hard outline')
  assert(chipCss.includes('border-left: 2px solid'), 'modern chip quiet accent')
  assert(!chipCss.includes('box-shadow'), 'modern chip no shadow')
  assert(!chipCss.includes('transform: scale'), 'modern chip no scale')
  assert(chipCss.includes(':focus-visible'), 'modern chip focus ring')
  assert(classicDrawer.includes('Countdown'), 'classic countdown copy frozen')
  assert(!preview.includes('Countdown'), 'modern preview has no Countdown label')
  assert(!preview.includes('COUNTDOWN'), 'modern preview has no COUNTDOWN')
  assert(!preview.includes('Termin już minął'), 'modern preview has no past countdown')
  assert(preview.includes('Pozostało'), 'polish remaining label')
  assert(preview.includes('Dzisiaj'), 'today remaining label')
  assert(preview.includes('getModernCalendarRemaining'), 'remaining helper used')
  assert(preview.includes('Otwórz zlecenie'), 'open assignment cta')
  assert(preview.includes('displayed.href'), 'cta uses event href')
  assert(preview.includes('Przyjęcie'), 'preview reception label')
  assert(!preview.includes('Ceremonia'), 'preview has no ceremony label')
  assert(preview.includes('getModernCalendarPreviewPlaces'), 'preview uses places helper')
  assert(!preview.includes('useCalendarWeddingNextAction'), 'preview does not hydrate next action')
  assert(!preview.includes('hrefForWeddingNextAction'), 'preview has no next-action href')
  assert(!preview.includes('data-testid="calendar-next-action"'), 'preview has no questionnaire cta')
  assert(!preview.includes('Przejrzyj aktualizacje z ankiety'), 'preview has no questionnaire copy')
  assert(classicDrawer.includes('useCalendarWeddingNextAction'), 'classic drawer keeps next action')
  assert(preview.includes('role="dialog"'), 'dialog role')
  assert(preview.includes('aria-modal="true"'), 'aria-modal')
  assert(preview.includes('useOverlay'), 'overlay architecture')
  assert(preview.includes('ModalPortal'), 'portal rendering')
  assert(preview.includes('<Backdrop onClick={onClose} />'), 'backdrop click closes')
  assert(preview.includes('aria-label="Zamknij"'), 'close control')
  assert(overlay.includes("event.key === 'Escape'"), 'escape close exists')
  assert(overlay.includes('getFocusable'), 'focus trap exists')
  assert(overlay.includes('previouslyFocused.current?.focus'), 'focus return exists')
  assert(overlay.includes('lockBodyScroll'), 'body scroll lock')
  assert(backdrop.includes('backdrop-filter: blur(10px)'), 'backdrop blur 10px')
  assert(backdrop.includes('-webkit-backdrop-filter: blur(10px)'), 'webkit backdrop blur')
  assert(!previewCss.includes('backdrop-filter'), 'modal surface is not glass')
  assert(!previewCss.includes('scale('), 'no scale pop')
  assert(previewCss.includes('translateY(8px)'), 'open translateY')
  assert(previewCss.includes('--modern-motion-base: 240ms'), 'open duration')
  assert(previewCss.includes('--modern-motion-close: 200ms'), 'close duration')
  assert(previewCss.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion')
  assert(previewCss.includes('max-width: 767px'), 'mobile inset dialog')
  assert(!preview.includes("from 'framer-motion'"), 'no framer')
  assert(!modernPage.includes('useCalendarWeddingNextAction'), 'no list-level next action')
  assert(!modernPage.includes('weddingService.getById'), 'no page-level getById')
  assert(!workspace.includes('weddingService.getById'), 'no workspace getById')
  assert(!workspace.includes('useCalendarWeddingNextAction'), 'workspace does not hydrate all events')
  console.log('PASS  quick preview + modern chips')
}

{
  const street = weddingEvent({
    entityId: 'street',
    dateKey: '2026-08-20',
    locationSummary: 'Lwowska 78, 34-144 Izdebnik',
    ceremonyLocation: 'Lwowska 78, 34-144 Izdebnik',
    receptionLocation: 'Lwowska 78, 34-144 Izdebnik',
    packageName: 'Video Standard',
    wedding: {
      id: 'street',
      primaryLocation: receptionLocation(),
    } as CalendarWeddingEvent['wedding'],
  })
  const hotel = weddingEvent({
    entityId: 'hotel',
    dateKey: '2026-08-20',
    locationSummary: 'Szczepańska 5, 31-011 Kraków',
    packageName: 'Video Standard',
    wedding: {
      id: 'hotel',
      primaryLocation: receptionLocation({
        venueName: 'Hotel Stary',
        locality: 'Kraków',
        displayText: 'Hotel Stary, Kraków',
      }),
    } as CalendarWeddingEvent['wedding'],
  })
  const addressOnly = weddingEvent({
    entityId: 'addr',
    dateKey: '2026-08-20',
    locationSummary: 'Słoneczna 16, 43-426 Dębowiec',
    packageName: 'Video Standard',
    wedding: {
      id: 'addr',
      primaryLocation: receptionLocation({
        venueName: null,
        locality: 'Dębowiec',
        displayText: 'Dębowiec',
      }),
    } as CalendarWeddingEvent['wedding'],
  })
  const missing = weddingEvent({
    entityId: 'none',
    dateKey: '2026-08-20',
    locationSummary: undefined,
    packageName: 'Video Standard',
    wedding: {
      id: 'none',
      primaryLocation: {
        venueName: null,
        locality: null,
        displayText: null,
        source: 'none',
      },
    } as CalendarWeddingEvent['wedding'],
  })
  const session = sessionEvent({
    entityId: 's-park',
    dateKey: '2026-08-10',
    locationSummary: 'Park Łazienkowski, Warszawa',
    sessionTypeLabel: 'Narzeczeńska',
  })
  assertEq(
    getModernCalendarLocationSlot(street),
    'Villa Love, Izdebnik',
    'venue+city beats street summary',
  )
  assertEq(
    getModernCalendarSupportingLine(street),
    'Villa Love, Izdebnik  ·  Video Standard',
    'lista supporting uses compact reception',
  )
  assertEq(
    getModernCalendarPreviewPlaces(street).reception,
    'Villa Love, Izdebnik',
    'preview uses compact reception',
  )
  assertEq(getModernCalendarPreviewPlaces(street).ceremony, null, 'preview no ceremony')
  assertEq(getModernCalendarLocationSlot(hotel), 'Hotel Stary, Kraków', 'hotel compact')
  assertEq(getModernCalendarLocationSlot(addressOnly), 'Dębowiec', 'address-only uses shared locality compact')
  assertEq(getModernCalendarLocationSlot(missing), null, 'missing location empty')
  assertEq(getModernCalendarSupportingLine(missing), 'Video Standard', 'lista omits empty location fragment')
  assertEq(getModernCalendarPreviewPlaces(missing).reception, null, 'preview omits empty reception')
  assertEq(
    getModernCalendarLocationSlot(session),
    'Park Łazienkowski, Warszawa',
    'session location preserved',
  )
  assertEq(
    getModernCalendarSupportingLine(session),
    'Park Łazienkowski, Warszawa  ·  Narzeczeńska',
    'session supporting preserved',
  )
  const model = read('src/features/calendar/modern/modernCalendarModel.ts')
  const card = read(
    'src/features/calendar/modern/ModernCalendarAssignmentCard.tsx',
  )
  const ledger = read(
    'src/features/calendar/modern/ModernCalendarAssignmentLedger.tsx',
  )
  const preview = read(
    'src/features/calendar/modern/CalendarQuickPreviewModal.tsx',
  )
  const light = read('src/lib/api/calendarLightService.ts')
  const classicDrawer = read(
    'src/features/calendar/components/CalendarDrawer.tsx',
  )
  const classicMonthList = read(
    'src/features/calendar/components/CalendarMonthWeddings.tsx',
  )
  const mapping = read('src/features/calendar/utils/calendarEvents.ts')
  assert(model.includes('getWeddingPrimaryLocationSummary'), 'reuses weddings resolver')
  assert(card.includes('getModernCalendarLocationSlot'), 'kafelki binds resolver')
  assert(ledger.includes('getModernCalendarSupportingLine'), 'lista binds resolver')
  assert(preview.includes("styles.label}>Przyjęcie"), 'preview label Przyjęcie')
  assert(!preview.includes("styles.label}>Ceremonia"), 'preview label not Ceremonia')
  assert(light.includes('weddingPlaceService.listByWeddingIds'), 'batched places')
  assert(!light.includes('listByWeddingId('), 'no per-wedding places N+1')
  assert(!light.includes('applyWeddingPlaces'), 'classic scalars not overwritten')
  assert(!light.includes('finalizeWeddingViews('), 'no full hydrate')
  assert(
    mapping.includes('event.location?.trim() || compactWeddingLocation(wedding)'),
    'classic mapping still prefers calendar event location',
  )
  assert(classicMonthList.includes('event.locationSummary'), 'classic list still uses locationSummary')
  assert(classicDrawer.includes('event.ceremonyLocation'), 'classic drawer ceremony frozen')
  console.log('PASS  wedding location consistency')
}

{
  const page = read('src/pages/CalendarModernPage.tsx')
  const pageCss = read('src/pages/CalendarModernPage.module.css')
  const workspace = read(
    'src/features/calendar/modern/ModernCalendarWorkspace.tsx',
  )
  const workspaceCss = read(
    'src/features/calendar/modern/ModernCalendarWorkspace.module.css',
  )
  const monthCss = read(
    'src/features/calendar/modern/ModernCalendarMonthView.module.css',
  )
  const monthView = read(
    'src/features/calendar/modern/ModernCalendarMonthView.tsx',
  )
  const summary = read('src/features/calendar/components/CalendarSummary.tsx')
  const toolbar = read('src/features/calendar/components/CalendarToolbar.tsx')
  const classicCal = read('src/pages/CalendarPage.tsx')
  const dash = read('src/pages/DashboardV3Page.tsx')
  const weddings = read('src/pages/WeddingsModernPage.tsx')
  const sessions = read('src/pages/SessionsModernPage.tsx')
  const layout = read('src/layouts/AppLayout.tsx')

  assert(page.includes('+ Dodaj zlecenie'), 'add action preserved')
  assert(page.includes('styles.createAction'), 'create is the primary class')
  assert(page.includes('openAssignmentChooser'), 'add route/dialog unchanged')
  assert(workspace.includes('onToday'), 'today preserved')
  assert(workspace.includes('onPrev'), 'prev preserved')
  assert(workspace.includes('onNext'), 'next preserved')
  assert(toolbar.includes('Dziś'), 'today copy frozen')
  assert(toolbar.includes('aria-label="Poprzedni"'), 'prev label frozen')
  assert(toolbar.includes('aria-label="Następny"'), 'next label frozen')
  assert(workspace.includes('CalendarSummary'), 'KPI source preserved')
  assert(summary.includes('Najbliższe zlecenie'), 'nearest KPI preserved')
  assert(summary.includes('Śluby · Sesje'), 'count KPI preserved')
  assert(summary.includes('Wartość zleceń'), 'value KPI preserved')
  assert(
    monthView.includes("['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Niedz']"),
    'weekday labels frozen',
  )
  assert(monthView.includes('const MAX_VISIBLE = 3'), 'overflow still derived from loaded events')
  assert(monthView.includes('onSelectEvent'), 'event click preserved')
  assert(monthView.includes('getMonthGrid'), '7-column month helper frozen')

  assert(pageCss.includes('@media (max-width: 767px)'), 'page mobile is 767')
  assert(!pageCss.includes('@media (max-width: 720px)'), 'page 720 migrated')
  const pageMobile = pageCss.slice(pageCss.indexOf('@media (max-width: 767px)'))
  assert(pageMobile.includes('flex-wrap: nowrap'), 'title and add share one row')
  assert(pageMobile.includes('width: auto'), 'add action does not stack full-width')

  const desktopPage = pageCss.slice(0, pageCss.indexOf('@media (max-width: 767px)'))
  assert(desktopPage.includes('gap: var(--space-6)'), 'desktop page gap frozen')
  assert(desktopPage.includes('flex-wrap: wrap'), 'desktop header may wrap')

  const wsMobile = workspaceCss.slice(
    workspaceCss.indexOf('@media (max-width: 767px)'),
  )
  assert(wsMobile.includes('.toolbar'), 'toolbar participates in mobile order')
  assert(wsMobile.includes('order: 1'), 'month nav is first in mobile workspace')
  assert(wsMobile.includes('.calendar'), 'calendar participates in mobile order')
  assert(wsMobile.includes('order: 2'), 'calendar is second — before KPI')
  assert(wsMobile.includes('.summary'), 'KPI participates in mobile order')
  assert(wsMobile.includes('order: 3'), 'KPI sits below the month')
  assert(wsMobile.includes('.collection'), 'collection stays last')
  assert(wsMobile.includes('order: 4'), 'collection after KPI')

  const desktopWs = workspaceCss.slice(
    0,
    workspaceCss.indexOf('@media (max-width: 767px)'),
  )
  assert(!desktopWs.includes('order:'), 'desktop workspace order is source order')
  assert(desktopWs.includes('.summary {'), 'desktop summary still first in source CSS')

  const monthMobile = monthCss.slice(monthCss.indexOf('@media (max-width: 767px)'))
  assert(monthCss.includes('@media (max-width: 767px)'), 'month view mobile is 767')
  assert(monthMobile.includes('min-width: 0'), '7 equal columns cannot inflate')
  assert(monthMobile.includes('text-align: center'), 'weekday labels centered on mobile')
  assert(monthCss.includes('grid-template-columns: repeat(7, 1fr)'), '7-column grid frozen')

  assert(classicCal.includes('CalendarSummary'), 'classic still owns shared summary')
  assert(classicCal.includes('CalendarToolbar'), 'classic still owns shared toolbar')
  assert(!classicCal.includes('styles.createAction'), 'classic page not restyled')
  assert(dash.includes('DashboardV3Hero'), 'Phase 1A dashboard untouched')
  assert(weddings.includes('Nowy ślub'), 'Phase 1B weddings untouched')
  assert(sessions.includes('Dodaj sesję'), 'Phase 1B sessions untouched')
  assert(layout.includes('styles.shellAccess'), 'Phase 0 shell preserved')
  console.log('PASS  mobile calendar hierarchy + desktop freeze')
}

console.log('\nPASS  modern calendar presentation port')
