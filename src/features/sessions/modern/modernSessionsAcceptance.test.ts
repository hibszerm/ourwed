/**
 * Modern /sesje dual-view season workspace.
 * Run: npm run test:modern-sessions
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveScreenPresentation } from '@/features/interface-style/types'
import {
  formatLedgerFullDate,
  getEditorialDateParts,
  getModernSessionSearchText,
  getModernSessionValueLabel,
  matchesModernSessionSearch,
  splitModernSessionsSeasons,
  listCurrentAndFutureYears,
  defaultExpandedCurrentFutureYears,
  selectExclusiveCurrentFutureYear,
  expandAllCurrentFutureYears,
  resolveCurrentFutureChipSelection,
} from '@/features/sessions/modern/modernSessionsModel'
import { SESSIONS_VIEW_MODE_KEY } from '@/features/sessions/presentation/sessionsViewMode'
import { WEDDINGS_VIEW_MODE_KEY } from '@/features/weddings/presentation/weddingsViewMode'
import { formatCurrency } from '@/lib/utils/currency'
import type { Session } from '@/types/session'

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

function session(partial: Partial<Session> = {}): Session {
  return {
    id: 's1',
    customName: undefined,
    primaryPerson: { firstName: 'Anna', lastName: 'Kowalska' },
    secondaryPerson: { firstName: 'Michał', lastName: 'Nowak' },
    sessionType: 'engagement',
    date: '2026-09-12',
    location: {
      name: 'Villa Love',
      formattedAddress: 'Izdebnik, Polska',
    },
    totalPrice: 2500,
    depositAmount: 500,
    payments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

{
  assertEq(
    resolveScreenPresentation('sessions', 'classic'),
    'classic',
    'classic style keeps classic sessions',
  )
  assertEq(
    resolveScreenPresentation('sessions', 'modern'),
    'modern',
    'modern style selects modern sessions',
  )
  assertEq(
    resolveScreenPresentation('weddings', 'modern'),
    'modern',
    'weddings remain modern-capable',
  )
  assertEq(
    resolveScreenPresentation('dashboard', 'modern'),
    'modern',
    'dashboard remains modern-capable',
  )
  assertEq(
    resolveScreenPresentation('finance', 'modern'),
    'classic',
    'finance still classic content',
  )
  const router = read('src/routes/router.tsx')
  const routePage = read('src/pages/SessionsRoutePage.tsx')
  const classic = read('src/pages/SessionsPage.tsx')
  const modern = read('src/pages/SessionsModernPage.tsx')
  assert(router.includes('SessionsRoutePage'), '/sesje uses route resolver')
  assert(!router.includes("path: '/sesje-modern'"), 'no extra modern path')
  assert(!router.includes("path: '/sesje-v2'"), 'no v2 sessions path')
  assert(!router.includes("path: '/sesje-v3'"), 'no v3 sessions path')
  assert(routePage.includes('<SessionsPage />'), 'classic sessions reachable')
  assert(routePage.includes('<SessionsModernPage />'), 'modern sessions reachable')
  assert(
    routePage.includes("resolveScreenPresentation('sessions'"),
    'sessions registry',
  )
  assert(!classic.includes('useInterfaceStyle'), 'classic page has no style branching')
  assert(!classic.includes('SessionsModernPage'), 'classic page is not the modern tree')
  assert(modern.includes('useSessions'), 'modern uses shared list hook')
  assert(!modern.includes('sessionService.getById'), 'modern has no getById')
  assert(!modern.includes('sessionListLightService'), 'modern does not fork the light service')
  console.log('PASS  presentation routing')
}

{
  const classic = read('src/pages/SessionsPage.tsx')
  const card = read('src/features/sessions/components/SessionCard.tsx')
  const list = read('src/features/sessions/components/SessionList.tsx')
  assert(classic.includes('SessionCard'), 'classic grid kept')
  assert(classic.includes('SessionList'), 'classic list kept')
  assert(classic.includes('SessionsViewSwitch'), 'classic switch kept')
  assert(classic.includes('SeasonGroupedList'), 'classic season chrome kept')
  assert(classic.includes('ProGateNavButton'), 'classic create action kept')
  assert(classic.includes('/sesje/nowa'), 'classic create route kept')
  assert(card.includes('getSessionRemainingAmount'), 'classic card still shows remaining')
  assert(list.includes('Pozostało'), 'classic list still shows remaining')
  assert(list.includes('formatCurrency(session.totalPrice)'), 'classic list still shows price')
  assert(!classic.includes('v3Material'), 'classic sessions do not opt into modern materials')
  assert(!classic.includes('interfaceStyle'), 'classic has no style branching')
  console.log('PASS  classic freeze')
}

{
  assertEq(SESSIONS_VIEW_MODE_KEY, 'ourwed:sessions-view-mode', 'sessions key')
  assert(
    String(SESSIONS_VIEW_MODE_KEY) !== String(WEDDINGS_VIEW_MODE_KEY),
    'sessions do not reuse weddings view-mode key',
  )
  const classic = read('src/pages/SessionsPage.tsx')
  const modern = read('src/pages/SessionsModernPage.tsx')
  assert(classic.includes('readSessionsViewMode'), 'classic reads shared pref')
  assert(classic.includes('writeSessionsViewMode'), 'classic writes shared pref')
  assert(modern.includes('readSessionsViewMode'), 'modern reads shared pref')
  assert(modern.includes('writeSessionsViewMode'), 'modern writes shared pref')
  assert(!modern.includes('ourwed:weddings-view-mode'), 'modern does not use weddings key')
  assert(!modern.includes('ourwed:sessions-view-mode-modern'), 'no modern-only key')
  console.log('PASS  view-mode persistence shared')
}

{
  const search = getModernSessionSearchText(
    session({
      sessionType: 'family',
      location: {
        name: 'Dwór',
        formattedAddress: 'Kraków, Polska',
      },
    }),
  )
  assert(search.includes('Anna'), 'search includes client name')
  assert(search.includes('Kraków') || search.includes('Dwór'), 'search includes location')
  assert(search.includes('Rodzinna'), 'search includes session type')
  assert(matchesModernSessionSearch(session(), 'anna'), 'name match')
  assert(matchesModernSessionSearch(session(), 'villa'), 'location match')
  assert(matchesModernSessionSearch(session(), 'narzeczeńska'), 'type match')
  assert(!matchesModernSessionSearch(session(), 'gdańsk'), 'non-match')
  console.log('PASS  search haystack')
}

{
  const layers = splitModernSessionsSeasons(
    [
      {
        season: 2026,
        items: [
          session({ id: 'nov', date: '2026-11-30' }),
          session({ id: 'may', date: '2026-05-16' }),
          session({ id: 'today', date: '2026-08-20' }),
          session({ id: 'aug15', date: '2026-08-15' }),
          session({ id: 'jul', date: '2026-07-24' }),
        ],
      },
      { season: 2028, items: [session({ id: 'future', date: '2028-06-10' })] },
      { season: 2025, items: [session({ id: 'prev', date: '2025-08-07' })] },
    ],
    2026,
  )
  assert(layers.active?.season === 2026, 'active is the full current year')
  assertEq(
    layers.active?.items.map((s) => s.date).join(','),
    '2026-05-16,2026-07-24,2026-08-15,2026-08-20,2026-11-30',
    'current year keeps past today and remaining dates, chronological',
  )
  assertEq(layers.active?.items.length ?? 0, 5, 'count is all 2026 sessions')
  assertEq(layers.future.map((g) => g.season).join(','), '2028', 'future years stay future')
  assertEq(layers.previous.map((g) => g.season).join(','), '2025', 'previous is earlier years only')
  assert(
    !layers.previous.some((g) => g.season === 2026),
    'current-year dates are not previous seasons',
  )
  assert(
    !layers.previous.some((g) => g.season === 2028),
    'future years are not previous seasons',
  )
  assert(
    layers.previous.every((g) => g.season < 2026),
    'every previous season is earlier than the current year',
  )
  const model = read('src/features/sessions/modern/modernSessionsModel.ts')
  assert(!model.includes('partitionCurrentYear'), 'no today split helper')
  assert(!model.includes('currentYearPast'), 'no currentYearPast')
  assert(!model.includes('Wcześniejsze'), 'no earlier subsection in model')
  console.log('PASS  season = full calendar year')
}

{
  const layers = splitModernSessionsSeasons(
    [
      {
        season: 2026,
        items: [
          session({ id: 'may', date: '2026-05-16' }),
          session({ id: 'today', date: '2026-08-20' }),
          session({ id: 'nov', date: '2026-11-30' }),
        ],
      },
      {
        season: 2028,
        items: [
          session({ id: 'f1', date: '2028-06-10' }),
          session({ id: 'f2', date: '2028-08-12' }),
        ],
      },
      { season: 2025, items: [session({ id: 'prev', date: '2025-08-07' })] },
    ],
    2026,
  )
  const chips = listCurrentAndFutureYears(layers)
  assertEq(chips.join(','), '2026,2028', 'top chips are current + future')
  assert(!chips.includes(2025), 'past years excluded from top chips')
  assertEq(layers.previous.map((g) => g.season).join(','), '2025', 'history stays previous')

  const initial = defaultExpandedCurrentFutureYears(chips, 2026)
  assert(initial.has(2026), 'default expands current year')
  assert(!initial.has(2028), 'default keeps future collapsed')
  assert(!initial.has(2025), 'default does not expand history')

  const click2028 = selectExclusiveCurrentFutureYear(2028)
  assert(click2028.has(2028), '2028 expands')
  assert(!click2028.has(2026), '2026 collapses')
  const selected2028 = resolveCurrentFutureChipSelection(chips, click2028)
  assertEq(selected2028.allSelected, false, 'Wszystkie off after year click')
  assertEq(selected2028.selectedYear, 2028, '2028 chip active')

  const click2026 = selectExclusiveCurrentFutureYear(2026)
  const selected2026 = resolveCurrentFutureChipSelection(chips, click2026)
  assertEq(selected2026.selectedYear, 2026, '2026 chip active')
  assert(!click2026.has(2028), 'future collapses when current selected')

  const all = expandAllCurrentFutureYears(chips)
  assert(all.has(2026) && all.has(2028), 'Wszystkie expands current + future')
  assert(!all.has(2025), 'Wszystkie does not include history years')
  const selectedAll = resolveCurrentFutureChipSelection(chips, all)
  assertEq(selectedAll.allSelected, true, 'Wszystkie chip active')

  const bothViaHeaders = new Set([2026, 2028])
  assertEq(
    resolveCurrentFutureChipSelection(chips, bothViaHeaders).allSelected,
    true,
    'multiple open years mark Wszystkie',
  )
  assertEq(
    resolveCurrentFutureChipSelection(chips, new Set([2028])).selectedYear,
    2028,
    'single open year marks that chip',
  )

  const futureOnly = splitModernSessionsSeasons(
    [
      { season: 2028, items: [session({ id: 'f', date: '2028-06-10' })] },
      { season: 2025, items: [session({ id: 'p', date: '2025-08-07' })] },
    ],
    2026,
  )
  const futureChips = listCurrentAndFutureYears(futureOnly)
  assertEq(futureChips.join(','), '2028', 'no current year still excludes past')
  const futureDefault = defaultExpandedCurrentFutureYears(futureChips, 2026)
  assert(futureDefault.has(2028), 'nearest future selected when current year empty')
  console.log('PASS  year navigation semantics')
}

{
  const workspace = read('src/features/sessions/modern/ModernSessionsWorkspace.tsx')
  const page = read('src/pages/SessionsModernPage.tsx')
  assert(!workspace.includes('Pokaż zarchiwizowane'), 'no archive reveal')
  assert(!workspace.includes('Zarchiwizowane'), 'no archived empty')
  assert(!workspace.includes('showArchived'), 'no archived state')
  assert(!page.includes('archived'), 'page has no archive UI')
  const model = read('src/features/sessions/modern/modernSessionsModel.ts')
  assert(!model.includes('isArchivedOrCancelled'), 'sessions have no archive helper')
  console.log('PASS  archived/cancelled omitted — not in Session domain')
}

{
  const parts = getEditorialDateParts('2026-08-20')
  if (!parts) throw new Error('date parts')
  const fullDate = formatLedgerFullDate(parts)
  assertEq(fullDate.split(' ').length, 3, 'day month year')
  assert(fullDate.startsWith('20 '), 'day first')
  assert(fullDate.endsWith(' 2026'), 'year last')
  assert(!fullDate.includes('.'), 'no dotted numeric date')
  assertEq(fullDate, '20 SIE 2026', 'accepted lista full-date format')
  console.log('PASS  lista full date')
}

{
  const valueLabel = getModernSessionValueLabel(session({ totalPrice: 2500 }))
  assertEq(valueLabel, formatCurrency(2500), 'value')
  assert(Boolean(valueLabel?.includes('zł')), 'pln')
  assertEq(getModernSessionValueLabel(session({ totalPrice: 0 })), null, 'omit empty')
  console.log('PASS  session totalPrice as commercial value')
}

{
  const card = read('src/features/sessions/modern/ModernSessionCard.tsx')
  const ledger = read('src/features/sessions/modern/ModernSessionLedger.tsx')
  const page = read('src/pages/SessionsModernPage.tsx')
  const workspace = read('src/features/sessions/modern/ModernSessionsWorkspace.tsx')
  const modern = [card, ledger, page, workspace].join('\n')
  assert(card.includes('getModernSessionValueLabel'), 'kafel session value')
  assert(ledger.includes('getModernSessionValueLabel'), 'lista session value')
  assert(card.includes('Wartość'), 'kafel value label')
  assert(ledger.includes('formatLedgerFullDate'), 'lista full date')
  assert(ledger.includes('dateYear') || ledger.includes('dateTime.slice'), 'lista year in row')
  assert(!ledger.includes('getNearTermCue'), 'lista has no countdown')
  assert(!ledger.includes('za '), 'lista copy has no za-N-dni')
  assert(!ledger.includes('dzisiaj'), 'lista has no dzisiaj cue')
  assert(ledger.includes('getSessionDisplayName'), 'lista title')
  assert(ledger.includes('getSessionLocationSummary'), 'lista location')
  assert(ledger.includes('formatSessionType'), 'lista type')
  assert(!ledger.includes('styles.package'), 'type is not a standalone column')
  assert(!card.includes('getNearTermCue'), 'kafelki has no countdown')
  assert(!card.includes('cue='), 'kafelki date has no cue prop')
  assert(!card.includes('dzisiaj'), 'kafelki has no dzisiaj')
  assert(card.includes('ModernWeddingsDate'), 'kafelki reuses accepted date component')
  assert(!modern.includes('Wpłacono'), 'no paid')
  assert(!modern.includes('Pozostało'), 'no remaining')
  assert(!modern.includes('Zadatek'), 'no deposit')
  assert(!modern.includes('remainingToPay'), 'no remaining field')
  assert(!modern.includes('getSessionRemainingAmount'), 'no remaining helper on modern')
  assert(!modern.includes('workflowStage'), 'no workflowStage UI')
  assert(!modern.includes('Importuj z pliku'), 'import not copied')
  assert(!page.includes('/sluby/import'), 'no wedding import route')
  assert(page.includes('/sesje/nowa'), 'real create-session route')
  assert(page.includes('Dodaj sesję'), 'real create-session copy')
  assert(page.includes('actionKey="create_session"'), 'real create gating')
  assert(
    page.includes('ModernSessionsViewSwitch') ||
      workspace.includes('ModernSessionsViewSwitch'),
    'view switch',
  )
  assert(workspace.includes("viewMode === 'list'"), 'lista branch')
  assert(workspace.includes('ModernSessionCard'), 'kafelki')
  assert(workspace.includes('ModernSessionLedger'), 'lista')
  assert(page.includes('width="wide"'), 'bounded page width')
  assert(page.includes('<AppLayout>'), 'owns header, no classic title slot')
  assert(!page.includes('title="Sesje"'), 'no classic AppLayout title')
  console.log('PASS  modern item anatomy')
}

{
  const workspace = read('src/features/sessions/modern/ModernSessionsWorkspace.tsx')
  const workspaceCss = read(
    'src/features/sessions/modern/ModernSessionsWorkspace.module.css',
  )
  const ledger = read('src/features/sessions/modern/ModernSessionLedger.tsx')
  const ledgerCss = read(
    'src/features/sessions/modern/ModernSessionLedger.module.css',
  )
  const card = read('src/features/sessions/modern/ModernSessionCard.tsx')
  const cardCss = read('src/features/sessions/modern/ModernSessionCard.module.css')
  const page = read('src/pages/SessionsModernPage.tsx')
  const modern = [workspace, workspaceCss, ledger, ledgerCss, page].join('\n')

  assert(workspace.includes('splitModernSessionsSeasons'), 'uses year split')
  assert(workspace.includes('Poprzednie sezony'), 'previous seasons section copy')
  assert(
    workspace.includes('const [previousOpen, setPreviousOpen] = useState(false)'),
    'previous seasons start collapsed',
  )
  assert(
    workspace.includes('layers.previous.length > 0'),
    'search reveals history only when matches exist',
  )
  assert(workspace.includes('onToggleYear'), 'previous years are expandable')
  assert(!workspace.includes('Wcześniejsze'), 'no internal earlier divider')
  assert(!workspaceCss.includes('earlierLabel'), 'earlier divider styles removed')
  assert(!modern.includes('Wcześniejsze'), 'copy gone from modern lista tree')
  assert(workspace.includes('layers.active'), 'current season is a separate layer')
  assert(workspace.includes('layers.previous'), 'past years are a separate layer')
  assert(workspace.includes('tone="history"'), 'history years use outer hierarchy')
  assert(!workspace.includes('quiet'), 'historical ledger is not a faded variant')
  assert(!workspaceCss.includes('ledgerQuiet'), 'no transparent historical surface')
  const ledgerSurfaceUses = workspace.split('ledgerSurface').length - 1
  assert(ledgerSurfaceUses >= 1, 'shared ledger surface class exists')
  assert(
    !workspace.includes('styles.ledgerQuiet'),
    'previous years do not use a second ledger skin',
  )
  assert(
    workspace.includes('<ModernSessionLedger sessions={sessions} />'),
    'one ledger component for every season',
  )
  const collectionFn = workspace.slice(
    workspace.indexOf('function SeasonCollection'),
    workspace.indexOf('export function ModernSessionsWorkspace'),
  )
  assert(
    collectionFn.includes('v3MaterialSatinFlat'),
    'lista seasons share the satin ledger surface',
  )
  assert(
    !collectionFn.includes('quiet'),
    'SeasonCollection has no historical visual variant',
  )
  assert(workspace.includes("viewMode === 'list'"), 'lista and kafelki share season layers')
  assert(workspace.includes('ModernSessionCard'), 'kafelki uses the same year groups')
  assert(workspace.includes('chipYears'), 'top selector uses current/future years only')
  assert(workspace.includes('listCurrentAndFutureYears'), 'past years filtered from chips')
  assert(workspace.includes('chipYears.map((year)'), 'chips render current/future years')
  assert(workspace.includes('selectExclusiveCurrentFutureYear'), 'year chip collapses other current/future years')
  assert(workspace.includes('expandAllCurrentFutureYears'), 'Wszystkie expands current/future')
  assert(workspace.includes('showAllCurrentFuture'), 'Wszystkie handler is isolated')
  const wszystkieHandler = workspace.slice(
    workspace.indexOf('function showAllCurrentFuture'),
    workspace.indexOf('function toggleCurrentFuture'),
  )
  assert(!wszystkieHandler.includes('setPreviousOpen'), 'Wszystkie does not open history')
  assert(workspace.includes('selectYear'), 'year chip selects exclusive season')
  const selectYearFn = workspace.slice(
    workspace.indexOf('function selectYear'),
    workspace.indexOf('function showAllCurrentFuture'),
  )
  assert(selectYearFn.includes('selectExclusiveCurrentFutureYear'), 'year click is exclusive')
  assert(selectYearFn.includes('setPendingScroll'), 'year click scrolls to section')
  assert(!selectYearFn.includes('setPreviousOpen'), 'year click does not open history')
  assert(workspace.includes('scrollIntoView'), 'native section scroll')
  assert(workspace.includes("block: 'start'"), 'scroll aligns section start')
  assert(workspaceCss.includes('scroll-margin-top'), 'shell breathing room via scroll-margin')
  assert(!workspace.includes('findScrollRoot'), 'no JS scroll offset helper')
  assert(!workspace.includes('window.scrollTo'), 'no window.scrollTo')
  assert(!workspace.includes('.scrollTo('), 'no container scrollTo offsets')
  assert(!workspace.includes('setTimeout'), 'no timeout scroll hacks')
  assert(workspace.includes('toggleCurrentFuture'), 'headers toggle accordion')
  assert(workspace.includes('historyYearsExpanded'), 'history accordion is independent')
  assert(workspace.includes('storedCurrentFuture'), 'search does not persist over accordion')
  assert(workspace.includes('displayedCurrentFuture'), 'search temporarily expands matching years')
  assert(workspace.includes('aria-expanded'), 'season headers expose expanded state')
  assert(workspace.includes('aria-controls'), 'season headers control panels')
  assert(workspace.includes('aria-pressed'), 'chips expose pressed state')
  assert(workspace.includes('prefersReducedMotion'), 'reduced motion respected')
  assert(ledger.includes('formatLedgerFullDate'), 'full date stays on lista')
  assert(!ledger.includes('getNearTermCue'), 'lista countdown still removed')
  assert(ledger.includes('getModernSessionValueLabel'), 'session value stays')
  assert(!ledgerCss.includes('border-radius'), 'lista rows are not cards')
  assert(!ledgerCss.includes('box-shadow'), 'lista rows have no shadow')
  assert(!ledgerCss.includes('nth-child'), 'no zebra rows')
  assert(!card.includes('getNearTermCue'), 'kafelki cue removed')
  assert(card.includes('v3MaterialSecondaryCard'), 'kafelki material untouched')
  assert(card.includes('styles.locationSlot'), 'location has a reserved slot')
  assert(card.includes('styles.packageSlot'), 'type/package has a reserved slot')
  assert(card.includes('styles.couple'), 'title has a reserved zone')
  assert(!card.includes('Brak lokalizacji'), 'no location placeholder copy')
  assert(!card.includes('Bez pakietu'), 'no invented package placeholder')
  assert(cardCss.includes('grid-template-rows: auto auto auto minmax(0, 1fr) auto'), 'stable body zones')
  assert(cardCss.includes('min-height: calc(var(--text-lg) * 1.25 * 2)'), 'two-line title reserve')
  assert(cardCss.includes('.locationSlot'), 'location slot geometry')
  assert(cardCss.includes('.packageSlot'), 'type slot geometry')
  assert(cardCss.includes('minmax(0, 1fr)'), 'value is pushed to the bottom zone')
  assert(!cardCss.includes('position: absolute'), 'no absolute offsets')
  assert(!cardCss.includes('ResizeObserver'), 'no measurement')
  assert(!page.includes('sessionService.getById'), 'no new page query')
  assert(!workspace.includes('useSession('), 'no per-row hydration')
  assert(!workspace.includes('sessionListLightService'), 'no forked list service')
  console.log('PASS  active season + previous seasons')
}

{
  const files = [
    'src/pages/SessionsModernPage.tsx',
    'src/pages/SessionsModernPage.module.css',
    'src/features/sessions/modern/ModernSessionsWorkspace.tsx',
    'src/features/sessions/modern/ModernSessionsWorkspace.module.css',
    'src/features/sessions/modern/ModernSessionCard.tsx',
    'src/features/sessions/modern/ModernSessionCard.module.css',
    'src/features/sessions/modern/ModernSessionLedger.tsx',
    'src/features/sessions/modern/ModernSessionLedger.module.css',
    'src/features/sessions/modern/ModernSessionsViewSwitch.tsx',
    'src/features/sessions/modern/ModernSessionsViewSwitch.module.css',
  ]
  for (const file of files) {
    assert(existsSync(resolve(process.cwd(), file)), file)
    const src = read(file)
    assert(!src.includes('backdrop-filter'), `${file} no backdrop-filter`)
    assert(!src.includes('-webkit-backdrop-filter'), `${file} no webkit blur`)
    assert(!src.includes('themeId'), `${file} no theme-id branch`)
    assert(!src.includes('#F2E9DE'), `${file} no graphite paper hardcode`)
    assert(!src.includes('#22333B'), `${file} no graphite navy hardcode`)
  }
  const page = read('src/pages/SessionsModernPage.tsx')
  assert(page.includes('useSessions'), 'shared hook')
  assert(!page.includes('useSession('), 'no per-row getById hook')
  console.log('PASS  glass / theme / performance source')
}

{
  const dash = read('src/pages/DashboardV3Page.tsx')
  const classicDash = read('src/pages/DashboardPage.tsx')
  const layout = read('src/layouts/AppLayout.tsx')
  const sidebar = read('src/layouts/Sidebar.tsx')
  const weddingsModern = read('src/pages/WeddingsModernPage.tsx')
  const weddingsClassic = read('src/pages/WeddingsPage.tsx')
  assert(dash.includes('DashboardV3Hero'), 'modern dashboard untouched')
  assert(classicDash.includes('TodoTodayCard'), 'classic dashboard untouched')
  assert(layout.includes('resolveActiveShellPresentation(interfaceStyle)'), 'shell unchanged')
  assert(sidebar.includes("label: 'Śluby'"), 'sidebar IA unchanged')
  assert(sidebar.includes("label: 'Sesje'"), 'sessions nav label unchanged')
  assert(weddingsModern.includes('Importuj z pliku'), 'modern weddings import kept')
  assert(weddingsClassic.includes('WeddingCard'), 'classic weddings untouched')
  console.log('PASS  dashboard / shell / weddings regression')
}

{
  const page = read('src/pages/SessionsModernPage.tsx')
  const pageCss = read('src/pages/SessionsModernPage.module.css')
  const workspace = read('src/features/sessions/modern/ModernSessionsWorkspace.tsx')
  const workspaceCss = read(
    'src/features/sessions/modern/ModernSessionsWorkspace.module.css',
  )
  const ledgerCss = read(
    'src/features/sessions/modern/ModernSessionLedger.module.css',
  )
  const cardCss = read('src/features/sessions/modern/ModernSessionCard.module.css')
  const switchCss = read(
    'src/features/sessions/modern/ModernSessionsViewSwitch.module.css',
  )
  const classic = read('src/pages/SessionsPage.tsx')
  const weddingsPageCss = read('src/pages/WeddingsModernPage.module.css')
  const weddingsWorkspaceCss = read(
    'src/features/weddings/modern/ModernWeddingsWorkspace.module.css',
  )

  assert(pageCss.includes('--modern-motion-fast: 150ms'), 'fast token')
  assert(pageCss.includes('--modern-motion-base: 240ms'), 'base token')
  assert(pageCss.includes('--modern-motion-slow: 300ms'), 'slow token')
  assert(workspaceCss.includes('--modern-ease-out'), 'ease-out token')
  assert(pageCss === weddingsPageCss, 'page motion CSS is a 1:1 weddings port')
  assert(
    workspaceCss === weddingsWorkspaceCss,
    'workspace motion CSS is a 1:1 weddings port',
  )
  assert(workspaceCss.includes('grid-template-rows: 0fr'), 'accordion collapsed row')
  assert(workspaceCss.includes('grid-template-rows: 1fr'), 'accordion open row')
  assert(workspaceCss.includes('accordionInner'), 'accordion inner clip')
  assert(workspace.includes('styles.accordion'), 'year panels use accordion wrapper')
  assert(workspace.includes("data-open={expanded ? 'true' : 'false'}"), 'year accordion state attr')
  assert(workspace.includes("data-open={open ? 'true' : 'false'}"), 'previous accordion state attr')
  assert(workspace.includes('key={viewMode}'), 'view switch remounts collection')
  assert(page.includes("isLoading ? 'soft' : 'full'"), 'loading uses short reveal')
  assert(!page.includes('setTimeout'), 'no artificial loading delay')
  assert(!workspace.includes("from 'framer-motion'"), 'no framer in modern sessions')
  assert(!workspace.includes('gsap'), 'no gsap')
  assert(!page.includes("from 'framer-motion'"), 'page has no framer')
  assert(!workspace.includes('localStorage'), 'entrance not persisted')
  assert(!workspace.includes('sessionStorage'), 'entrance not session-persisted')
  assert(!workspace.includes('will-change'), 'no long-lived will-change in ts')
  assert(!workspaceCss.includes('will-change'), 'no will-change in css')
  assert(!workspaceCss.includes('filter:'), 'no blur-in')
  assert(!workspaceCss.includes('scale('), 'no scale motion')
  assert(workspaceCss.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion')
  assert(pageCss.includes('@media (prefers-reduced-motion: reduce)'), 'header reduced motion')
  assert(workspace.includes('data-entrance={entrance}'), 'entrance mode on workspace')
  assert(ledgerCss.includes('transition: background var(--transition-fast, 160ms ease)'), 'ledger hover transition preserved')
  assert(ledgerCss.includes('4.5%'), 'ledger hover mix preserved')
  assert(!ledgerCss.includes('translateY'), 'no row translate')
  assert(!ledgerCss.includes('box-shadow'), 'no row shadow')
  assert(cardCss.includes('.card {'), 'kafelki card layout frozen')
  assert(!classic.includes('modernWeddingsEnter'), 'classic has no modern motion')
  assert(!classic.includes('--modern-motion-'), 'classic has no modern tokens')
  assert(switchCss.includes('transition:'), 'view switch selected state transitions')
  console.log('PASS  modern sessions motion system')
}

{
  const page = read('src/pages/SessionsModernPage.tsx')
  const pageCss = read('src/pages/SessionsModernPage.module.css')
  const workspace = read('src/features/sessions/modern/ModernSessionsWorkspace.tsx')
  const workspaceCss = read(
    'src/features/sessions/modern/ModernSessionsWorkspace.module.css',
  )
  const switchCss = read(
    'src/features/sessions/modern/ModernSessionsViewSwitch.module.css',
  )
  const cardCss = read('src/features/sessions/modern/ModernSessionCard.module.css')
  const ledgerCss = read(
    'src/features/sessions/modern/ModernSessionLedger.module.css',
  )
  const weddingsPage = read('src/pages/WeddingsModernPage.tsx')
  const dash = read('src/pages/DashboardV3Page.tsx')
  const layout = read('src/layouts/AppLayout.tsx')
  const classic = read('src/pages/SessionsPage.tsx')

  assert(page.includes('Dodaj sesję'), 'primary create preserved')
  assert(page.includes('styles.createAction'), 'create is the primary class')
  assert(page.includes('variant="primary"'), 'create stays primary variant')
  assert(!page.includes('Importuj'), 'sessions has no import control')
  assert(workspace.includes('id={searchId}'), 'search input preserved')
  assert(workspace.includes('placeholder="Szukaj sesji, miejsca lub typu…"'), 'search copy preserved')
  assert(workspace.includes('ModernSessionsViewSwitch'), 'view switch preserved')
  assert(workspace.includes('chipYears'), 'year chips preserved when multiple years exist')
  assert(workspace.includes('formatSessionSeasonCount'), 'season count preserved')

  assert(pageCss.includes('@media (max-width: 767px)'), 'page mobile is 767')
  assert(!pageCss.includes('@media (max-width: 720px)'), 'page 720 migrated')
  const pageMobile = pageCss.slice(pageCss.indexOf('@media (max-width: 767px)'))
  assert(pageMobile.includes('flex-wrap: nowrap'), 'title and create share one row')
  assert(pageMobile.includes('width: auto'), 'actions do not stack full-width')

  assert(workspaceCss.includes('@media (max-width: 767px)'), 'workspace mobile is 767')
  assert(!workspaceCss.includes('@media (max-width: 720px)'), 'workspace 720 migrated')
  const wsMobile = workspaceCss.slice(
    workspaceCss.indexOf('@media (max-width: 767px)'),
  )
  assert(wsMobile.includes('display: contents'), 'controls flatten into compact grid')
  assert(wsMobile.includes('grid-row: 2'), 'filters and view switch share a row')
  assert(wsMobile.includes('font-size: 16px'), 'search is 16px on mobile')
  assert(wsMobile.includes('min-height: var(--touch-target)'), 'search/chip targets are 44px')
  assert(wsMobile.includes(':has(.stickyNav)'), 'same chrome language as weddings when chips exist')
  assert(wsMobile.includes('position: static'), 'year chips are not a second sticky bar')

  const desktopWs = workspaceCss.slice(
    0,
    workspaceCss.indexOf('@media (max-width: 767px)'),
  )
  assert(desktopWs.includes('max-width: 28rem'), 'desktop search max-width frozen')
  assert(desktopWs.includes('min-height: 40px'), 'desktop search height frozen')
  assert(desktopWs.includes('position: sticky'), 'desktop year nav stays sticky')

  assert(switchCss.includes('@media (max-width: 767px)'), 'view switch mobile is 767')
  assert(cardCss.includes('@media (max-width: 767px)'), 'card mobile is 767')
  assert(!cardCss.includes('@media (max-width: 720px)'), 'card 720 migrated')
  assert(ledgerCss.includes('@media (max-width: 767px)'), 'ledger mobile is 767')
  assert(!ledgerCss.includes('@media (max-width: 720px)'), 'ledger 720 migrated')
  assert(weddingsPage.includes('styles.importAction'), 'weddings import remains available')
  assert(dash.includes('DashboardV3Hero'), 'Phase 1A dashboard untouched')
  assert(layout.includes('styles.shellAccess'), 'Phase 0 shell preserved')
  assert(!classic.includes('createAction'), 'classic sessions untouched')
  console.log('PASS  mobile list chrome + desktop freeze')
}

{
  const cardCss = read('src/features/sessions/modern/ModernSessionCard.module.css')
  const weddingCardCss = read(
    'src/features/weddings/modern/ModernWeddingCard.module.css',
  )
  const ledgerCss = read(
    'src/features/sessions/modern/ModernSessionLedger.module.css',
  )
  const weddingLedgerCss = read(
    'src/features/weddings/modern/ModernWeddingLedger.module.css',
  )
  const switchCss = read(
    'src/features/sessions/modern/ModernSessionsViewSwitch.module.css',
  )
  const weddingSwitchCss = read(
    'src/features/weddings/modern/ModernWeddingsViewSwitch.module.css',
  )
  assert(cardCss === weddingCardCss, 'kafelki geometry CSS is a 1:1 weddings port')
  assert(ledgerCss === weddingLedgerCss, 'lista geometry CSS is a 1:1 weddings port')
  assert(switchCss === weddingSwitchCss, 'view-switch CSS is a 1:1 weddings port')
  console.log('PASS  visual 1:1 CSS port')
}

console.log('\nPASS  modern sessions dual-view season workspace')
