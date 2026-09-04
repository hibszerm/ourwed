/**
 * Modern /sluby dual-view season workspace.
 * Run: npm run test:modern-weddings
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveScreenPresentation } from '@/features/interface-style/types'
import {
  formatLedgerFullDate,
  getEditorialDateParts,
  getModernContractValueLabel,
  getModernWeddingSearchText,
  getNearTermCue,
  isArchivedOrCancelled,
  matchesModernWeddingSearch,
  splitModernWeddingsSeasons,
  listCurrentAndFutureYears,
  defaultExpandedCurrentFutureYears,
  selectExclusiveCurrentFutureYear,
  expandAllCurrentFutureYears,
  resolveCurrentFutureChipSelection,
} from '@/features/weddings/modern/modernWeddingsModel'
import { WEDDINGS_VIEW_MODE_KEY } from '@/features/weddings/presentation/weddingsViewMode'
import { formatCurrency } from '@/lib/utils/currency'
import type { Couple, Wedding } from '@/types/wedding'

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

function couple(partial: Partial<Couple> = {}): Couple {
  return {
    partner1: 'Anna Kowalska',
    partner2: 'Jan Nowak',
    email: '',
    phone: '',
    venue: '',
    city: '',
    ...partial,
  }
}

function wedding(partial: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w1',
    couple: couple(),
    date: '2026-09-12',
    status: 'active',
    workflowStage: 'deposit',
    packageName: 'Video Mini',
    price: 12900,
    packageItems: [],
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#000',
    createdAt: '2026-01-01T00:00:00.000Z',
    primaryLocation: {
      venueName: 'Villa Love',
      locality: 'Izdebnik',
      displayText: 'Villa Love, Izdebnik',
      source: 'reception',
    },
    ...partial,
  }
}

{
  assertEq(
    resolveScreenPresentation('weddings', 'classic'),
    'classic',
    'classic style keeps classic weddings',
  )
  assertEq(
    resolveScreenPresentation('weddings', 'modern'),
    'modern',
    'modern style selects modern weddings',
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
  const routePage = read('src/pages/WeddingsRoutePage.tsx')
  const classic = read('src/pages/WeddingsPage.tsx')
  const modern = read('src/pages/WeddingsModernPage.tsx')
  assert(router.includes('WeddingsRoutePage'), '/sluby uses route resolver')
  assert(!router.includes("path: '/sluby-modern'"), 'no extra modern path')
  assert(!router.includes("path: '/sluby-v3'"), 'no v3 weddings path')
  assert(routePage.includes('<WeddingsPage />'), 'classic weddings reachable')
  assert(routePage.includes('<WeddingsModernPage />'), 'modern weddings reachable')
  assert(routePage.includes("resolveScreenPresentation('weddings'"), 'weddings registry')
  assert(!classic.includes('useInterfaceStyle'), 'classic page has no style branching')
  assert(!classic.includes('WeddingsModernPage'), 'classic page is not the modern tree')
  assert(modern.includes('useWeddings'), 'modern uses shared list hook')
  assert(!modern.includes('weddingService.getAll'), 'modern has no getAll')
  assert(!modern.includes('weddingListLightService'), 'modern does not fork the light service')
  console.log('PASS  presentation routing')
}

{
  const classic = read('src/pages/WeddingsPage.tsx')
  const card = read('src/features/weddings/components/WeddingCard.tsx')
  const list = read('src/features/weddings/components/WeddingList.tsx')
  assert(classic.includes('WeddingCard'), 'classic grid kept')
  assert(classic.includes('WeddingList'), 'classic list kept')
  assert(classic.includes('WeddingsViewSwitch'), 'classic switch kept')
  assert(classic.includes('SeasonGroupedList'), 'classic season chrome kept')
  assert(card.includes('Wpłacono'), 'classic card still shows paid')
  assert(card.includes('Pozostało'), 'classic card still shows remaining')
  assert(card.includes('Zadatek'), 'classic card still shows deposit')
  assert(list.includes('remainingToPay'), 'classic list still shows remaining')
  console.log('PASS  classic freeze')
}

{
  assertEq(WEDDINGS_VIEW_MODE_KEY, 'ourwed:weddings-view-mode', 'shared key')
  const classic = read('src/pages/WeddingsPage.tsx')
  const modern = read('src/pages/WeddingsModernPage.tsx')
  assert(classic.includes('readWeddingsViewMode'), 'classic reads shared pref')
  assert(classic.includes('writeWeddingsViewMode'), 'classic writes shared pref')
  assert(modern.includes('readWeddingsViewMode'), 'modern reads shared pref')
  assert(modern.includes('writeWeddingsViewMode'), 'modern writes shared pref')
  assert(!modern.includes('ourwed:weddings-view-mode-modern'), 'no modern-only key')
  console.log('PASS  view-mode persistence shared')
}

{
  const search = getModernWeddingSearchText(
    wedding({
      packageName: 'Film Full',
      primaryLocation: {
        venueName: 'Dwór',
        locality: 'Kraków',
        displayText: 'Dwór, Kraków',
        source: 'reception',
      },
    }),
  )
  assert(search.includes('Anna Kowalska'), 'search includes couple')
  assert(search.includes('Kraków'), 'search includes location')
  assert(search.includes('Film Full'), 'search includes package')
  assert(matchesModernWeddingSearch(wedding(), 'kowalska'), 'name match')
  assert(matchesModernWeddingSearch(wedding(), 'izdebnik'), 'location match')
  assert(matchesModernWeddingSearch(wedding(), 'video mini'), 'package match')
  assert(!matchesModernWeddingSearch(wedding(), 'gdańsk'), 'non-match')
  console.log('PASS  search haystack')
}

{
  const layers = splitModernWeddingsSeasons(
    [
      {
        season: 2026,
        items: [
          wedding({ id: 'nov', date: '2026-11-30' }),
          wedding({ id: 'may', date: '2026-05-16' }),
          wedding({ id: 'today', date: '2026-08-20' }),
          wedding({ id: 'aug15', date: '2026-08-15' }),
          wedding({ id: 'jul', date: '2026-07-24' }),
        ],
      },
      { season: 2028, items: [wedding({ id: 'future', date: '2028-06-10' })] },
      { season: 2025, items: [wedding({ id: 'prev', date: '2025-08-07' })] },
    ],
    2026,
  )
  assert(layers.active?.season === 2026, 'active is the full current year')
  assertEq(
    layers.active?.items.map((w) => w.date).join(','),
    '2026-05-16,2026-07-24,2026-08-15,2026-08-20,2026-11-30',
    'current year keeps past today and remaining dates, chronological',
  )
  assertEq(layers.active?.items.length ?? 0, 5, 'count is all 2026 weddings')
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
  const model = read('src/features/weddings/modern/modernWeddingsModel.ts')
  assert(!model.includes('partitionCurrentYearWeddings'), 'today split helper removed')
  assert(!model.includes('currentYearPast'), 'no currentYearPast')
  assert(!model.includes('upcoming'), 'no upcoming/today split in season model')
  console.log('PASS  season = full calendar year')
}

{
  const layers = splitModernWeddingsSeasons(
    [
      {
        season: 2026,
        items: [
          wedding({ id: 'may', date: '2026-05-16' }),
          wedding({ id: 'today', date: '2026-08-20' }),
          wedding({ id: 'nov', date: '2026-11-30' }),
        ],
      },
      {
        season: 2028,
        items: [
          wedding({ id: 'f1', date: '2028-06-10' }),
          wedding({ id: 'f2', date: '2028-08-12' }),
        ],
      },
      { season: 2025, items: [wedding({ id: 'prev', date: '2025-08-07' })] },
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

  const futureOnly = splitModernWeddingsSeasons(
    [
      { season: 2028, items: [wedding({ id: 'f', date: '2028-06-10' })] },
      { season: 2025, items: [wedding({ id: 'p', date: '2025-08-07' })] },
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
  assert(isArchivedOrCancelled(wedding({ status: 'archived' })), 'archived hidden class')
  assert(isArchivedOrCancelled(wedding({ status: 'cancelled' })), 'cancelled hidden class')
  assert(!isArchivedOrCancelled(wedding({ status: 'active' })), 'active visible')
  const workspace = read('src/features/weddings/modern/ModernWeddingsWorkspace.tsx')
  assert(workspace.includes('Pokaż zarchiwizowane'), 'reveal control')
  assert(workspace.includes('Zarchiwizowane śluby są ukryte'), 'hidden-only empty')
  console.log('PASS  archived behavior')
}

{
  assertEq(getNearTermCue('2026-08-18', '2026-08-18'), 'dzisiaj', 'today')
  assertEq(getNearTermCue('2026-08-20', '2026-08-18'), 'za 2 dni', 'near')
  assertEq(getNearTermCue('2026-09-01', '2026-08-18'), 'za 14 dni', 'edge')
  assertEq(getNearTermCue('2026-09-02', '2026-08-18'), null, 'beyond window')
  assertEq(getNearTermCue('2026-08-01', '2026-08-18'), null, 'past hidden')
  const parts = getEditorialDateParts('2026-08-20')
  if (!parts) throw new Error('date parts')
  const fullDate = formatLedgerFullDate(parts)
  assertEq(fullDate.split(' ').length, 3, 'day month year')
  assert(fullDate.startsWith('20 '), 'day first')
  assert(fullDate.endsWith(' 2026'), 'year last')
  assert(!fullDate.includes('.'), 'no dotted numeric date')
  console.log('PASS  near-term cue window')
}

{
  const valueLabel = getModernContractValueLabel(wedding({ price: 12900 }))
  assertEq(valueLabel, formatCurrency(12900), 'value')
  assert(Boolean(valueLabel?.includes('zł')), 'pln')
  assertEq(getModernContractValueLabel(wedding({ price: 0 })), null, 'omit empty')
  console.log('PASS  contract value helper')
}

{
  const card = read('src/features/weddings/modern/ModernWeddingCard.tsx')
  const ledger = read('src/features/weddings/modern/ModernWeddingLedger.tsx')
  const page = read('src/pages/WeddingsModernPage.tsx')
  const workspace = read('src/features/weddings/modern/ModernWeddingsWorkspace.tsx')
  const modern = [card, ledger, page, workspace].join('\n')
  assert(card.includes('getModernContractValueLabel'), 'kafel contract value')
  assert(ledger.includes('getModernContractValueLabel'), 'lista contract value')
  assert(card.includes('Wartość'), 'kafel value label')
  assert(ledger.includes('formatLedgerFullDate'), 'lista full date')
  assert(ledger.includes('dateYear') || ledger.includes('dateTime.slice'), 'lista year in row')
  assert(!ledger.includes('getNearTermCue'), 'lista has no countdown')
  assert(!ledger.includes('za '), 'lista copy has no za-N-dni')
  assert(!ledger.includes('dzisiaj'), 'lista has no dzisiaj cue')
  assert(ledger.includes('getWeddingDisplayName'), 'lista couple')
  assert(ledger.includes('getWeddingPrimaryLocationSummary'), 'lista location')
  assert(ledger.includes('packageName'), 'lista package')
  assert(!ledger.includes('styles.package'), 'package is not a standalone column')
  assert(!card.includes('getNearTermCue'), 'kafelki has no countdown')
  assert(!card.includes('cue='), 'kafelki date has no cue prop')
  assert(!card.includes('dzisiaj'), 'kafelki has no dzisiaj')
  assert(card.includes('ModernWeddingsDate'), 'kafelki date component kept')
  const dateSrc = read('src/features/weddings/modern/ModernWeddingsDate.tsx')
  const dateCss = read('src/features/weddings/modern/ModernWeddingsDate.module.css')
  assert(!dateSrc.includes('cue'), 'date component has no countdown slot')
  assert(!dateCss.includes('.cue'), 'date styles have no countdown')
  assert(!modern.includes('Wpłacono'), 'no paid')
  assert(!modern.includes('Pozostało'), 'no remaining')
  assert(!modern.includes('Zadatek'), 'no deposit')
  assert(!modern.includes('remainingToPay'), 'no remaining field')
  assert(!modern.includes('workflowStage'), 'no workflowStage UI')
  assert(!modern.includes('WeddingNextAction'), 'no next action')
  assert(!modern.includes('deliveryDueDate'), 'no delivery deadline')
  assert(!modern.includes('getWeddingCommercialSummary'), 'no finance summary widget')
  assert(page.includes('ModernWeddingsViewSwitch') || workspace.includes('ModernWeddingsViewSwitch'), 'view switch')
  assert(workspace.includes("viewMode === 'list'"), 'lista branch')
  assert(workspace.includes('ModernWeddingCard'), 'kafelki')
  assert(workspace.includes('ModernWeddingLedger'), 'lista')
  assert(page.includes('width="wide"'), 'bounded page width')
  assert(page.includes('<AppLayout>'), 'owns header, no classic title slot')
  assert(!page.includes('title="Śluby"'), 'no classic AppLayout title')
  console.log('PASS  modern item anatomy')
}

{
  const workspace = read('src/features/weddings/modern/ModernWeddingsWorkspace.tsx')
  const workspaceCss = read('src/features/weddings/modern/ModernWeddingsWorkspace.module.css')
  const ledger = read('src/features/weddings/modern/ModernWeddingLedger.tsx')
  const ledgerCss = read('src/features/weddings/modern/ModernWeddingLedger.module.css')
  const card = read('src/features/weddings/modern/ModernWeddingCard.tsx')
  const cardCss = read('src/features/weddings/modern/ModernWeddingCard.module.css')
  const page = read('src/pages/WeddingsModernPage.tsx')
  const modern = [workspace, workspaceCss, ledger, ledgerCss, page].join('\n')

  assert(workspace.includes('splitModernWeddingsSeasons'), 'uses year split')
  assert(workspace.includes('Poprzednie sezony'), 'previous seasons section copy')
  assert(workspace.includes('const [previousOpen, setPreviousOpen] = useState(false)'), 'previous seasons start collapsed')
  assert(workspace.includes('layers.previous.length > 0'), 'search reveals history only when matches exist')
  assert(workspace.includes('onToggleYear'), 'previous years are expandable')
  assert(!workspace.includes('Wcześniejsze'), 'no internal earlier divider')
  assert(!workspaceCss.includes('earlierLabel'), 'earlier divider styles removed')
  assert(!modern.includes('Wcześniejsze'), 'copy gone from modern lista tree')
  assert(workspace.includes('layers.active'), 'current season is a separate layer')
  assert(workspace.includes('layers.previous'), 'past years are a separate layer')
  assert(workspace.includes('tone="history"'), 'history years use outer hierarchy')
  assert(!workspace.includes('quiet'), 'historical ledger is not a faded variant')
  assert(!workspaceCss.includes('ledgerQuiet'), 'no transparent historical surface')
  assert(!workspace.includes('opacity'), 'historical rows are not dimmed in source')
  const ledgerSurfaceUses = workspace.split('ledgerSurface').length - 1
  assert(ledgerSurfaceUses >= 1, 'shared ledger surface class exists')
  assert(
    !workspace.includes('styles.ledgerQuiet'),
    'previous years do not use a second ledger skin',
  )
  assert(
    workspace.includes('<ModernWeddingLedger weddings={weddings} />'),
    'one ledger component for every season',
  )
  const collectionFn = workspace.slice(
    workspace.indexOf('function SeasonCollection'),
    workspace.indexOf('export function ModernWeddingsWorkspace'),
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
  assert(workspace.includes('ModernWeddingCard'), 'kafelki uses the same year groups')
  assert(workspace.includes('chipYears'), 'top selector uses current/future years only')
  assert(workspace.includes('listCurrentAndFutureYears'), 'past years filtered from chips')
  assert(workspace.includes('chipYears.map((year)'), 'chips render current/future years')
  assert(!workspace.includes('groups.map((g)'), 'chips are not built from all season groups')
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
  assert(!workspace.includes('toggleable={false}'), 'current year is collapsible')
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
  assert(ledger.includes('getModernContractValueLabel'), 'contract value stays')
  assert(!ledgerCss.includes('border-radius'), 'lista rows are not cards')
  assert(!ledgerCss.includes('box-shadow'), 'lista rows have no shadow')
  assert(!ledgerCss.includes('nth-child'), 'no zebra rows')
  assert(!card.includes('getNearTermCue'), 'kafelki cue removed')
  assert(card.includes('v3MaterialSecondaryCard'), 'kafelki material untouched')
  assert(card.includes('styles.locationSlot'), 'location has a reserved slot')
  assert(card.includes('styles.packageSlot'), 'package has a reserved slot')
  assert(card.includes('styles.couple'), 'couple has a reserved zone')
  assert(!card.includes('Brak lokalizacji'), 'no location placeholder copy')
  assert(!card.includes('Bez pakietu'), 'no invented package placeholder')
  assert(!card.includes('Brak pakietu'), 'no missing-package copy')
  assert(cardCss.includes('grid-template-rows: auto auto auto minmax(0, 1fr) auto'), 'stable body zones')
  assert(cardCss.includes('min-height: calc(var(--text-lg) * 1.25 * 2)'), 'two-line couple reserve')
  assert(cardCss.includes('.locationSlot'), 'location slot geometry')
  assert(cardCss.includes('.packageSlot'), 'package slot geometry')
  assert(cardCss.includes('minmax(0, 1fr)'), 'value is pushed to the bottom zone')
  assert(!cardCss.includes('position: absolute'), 'no absolute offsets')
  assert(!cardCss.includes('ResizeObserver'), 'no measurement')
  assert(!page.includes('weddingService.getAll'), 'no new page query')
  assert(!workspace.includes('useWedding('), 'no per-row hydration')
  assert(!workspace.includes('weddingListLightService'), 'no forked list service')
  console.log('PASS  active season + previous seasons')
}

{
  const files = [
    'src/pages/WeddingsModernPage.tsx',
    'src/pages/WeddingsModernPage.module.css',
    'src/features/weddings/modern/ModernWeddingsWorkspace.tsx',
    'src/features/weddings/modern/ModernWeddingsWorkspace.module.css',
    'src/features/weddings/modern/ModernWeddingCard.tsx',
    'src/features/weddings/modern/ModernWeddingCard.module.css',
    'src/features/weddings/modern/ModernWeddingLedger.tsx',
    'src/features/weddings/modern/ModernWeddingLedger.module.css',
    'src/features/weddings/modern/ModernWeddingsViewSwitch.tsx',
    'src/features/weddings/modern/ModernWeddingsViewSwitch.module.css',
    'src/features/weddings/modern/ModernWeddingsDate.tsx',
    'src/features/weddings/modern/ModernWeddingsDate.module.css',
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
  const page = read('src/pages/WeddingsModernPage.tsx')
  assert(page.includes('useWeddings'), 'shared hook')
  assert(!page.includes('useWedding('), 'no per-row getById hook')
  console.log('PASS  glass / theme / performance source')
}

{
  const dash = read('src/pages/DashboardV3Page.tsx')
  const classicDash = read('src/pages/DashboardPage.tsx')
  const layout = read('src/layouts/AppLayout.tsx')
  const sidebar = read('src/layouts/Sidebar.tsx')
  assert(dash.includes('DashboardV3Hero'), 'modern dashboard untouched')
  assert(classicDash.includes('TodoTodayCard'), 'classic dashboard untouched')
  assert(layout.includes('resolveActiveShellPresentation(interfaceStyle)'), 'shell unchanged')
  assert(sidebar.includes("label: 'Śluby'"), 'sidebar IA unchanged')
  console.log('PASS  dashboard / shell regression')
}

{
  const page = read('src/pages/WeddingsModernPage.tsx')
  const pageCss = read('src/pages/WeddingsModernPage.module.css')
  const workspace = read('src/features/weddings/modern/ModernWeddingsWorkspace.tsx')
  const workspaceCss = read('src/features/weddings/modern/ModernWeddingsWorkspace.module.css')
  const ledgerCss = read('src/features/weddings/modern/ModernWeddingLedger.module.css')
  const cardCss = read('src/features/weddings/modern/ModernWeddingCard.module.css')
  const switchCss = read('src/features/weddings/modern/ModernWeddingsViewSwitch.module.css')
  const classic = read('src/pages/WeddingsPage.tsx')

  assert(pageCss.includes('--modern-motion-fast: 150ms'), 'fast token')
  assert(pageCss.includes('--modern-motion-base: 240ms'), 'base token')
  assert(pageCss.includes('--modern-motion-slow: 300ms'), 'slow token')
  assert(workspaceCss.includes('--modern-ease-out'), 'ease-out token')
  assert(pageCss.includes('modernWeddingsHeaderIn'), 'header entrance')
  assert(workspaceCss.includes('modernWeddingsEnter'), 'workspace entrance')
  assert(workspaceCss.includes('modernWeddingsSeasonEnter'), 'season block entrance')
  assert(workspaceCss.includes('animation-delay: 40ms') || workspaceCss.includes('40ms both'), 'controls delay')
  assert(workspaceCss.includes('grid-template-rows: 0fr'), 'accordion collapsed row')
  assert(workspaceCss.includes('grid-template-rows: 1fr'), 'accordion open row')
  assert(workspaceCss.includes('accordionInner'), 'accordion inner clip')
  assert(workspace.includes('styles.accordion'), 'year panels use accordion wrapper')
  assert(workspace.includes("data-open={expanded ? 'true' : 'false'}"), 'year accordion state attr')
  assert(workspace.includes("data-open={open ? 'true' : 'false'}"), 'previous accordion state attr')
  assert(workspaceCss.includes('modernWeddingsViewIn'), 'view-mode enter')
  assert(workspace.includes('key={viewMode}'), 'view switch remounts collection')
  assert(page.includes("isLoading ? 'soft' : 'full'"), 'loading uses short reveal')
  assert(!page.includes('setTimeout'), 'no artificial loading delay')
  assert(!workspace.includes("from 'framer-motion'"), 'no framer in modern weddings')
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
  console.log('PASS  modern weddings motion system')
}

{
  const page = read('src/pages/WeddingsModernPage.tsx')
  const pageCss = read('src/pages/WeddingsModernPage.module.css')
  const workspace = read('src/features/weddings/modern/ModernWeddingsWorkspace.tsx')
  const workspaceCss = read(
    'src/features/weddings/modern/ModernWeddingsWorkspace.module.css',
  )
  const switchCss = read(
    'src/features/weddings/modern/ModernWeddingsViewSwitch.module.css',
  )
  const cardCss = read('src/features/weddings/modern/ModernWeddingCard.module.css')
  const ledgerCss = read(
    'src/features/weddings/modern/ModernWeddingLedger.module.css',
  )
  const dash = read('src/pages/DashboardV3Page.tsx')
  const layout = read('src/layouts/AppLayout.tsx')
  const classic = read('src/pages/WeddingsPage.tsx')

  assert(page.includes('Nowy ślub'), 'primary create preserved')
  assert(page.includes('Importuj z pliku'), 'import preserved')
  assert(page.includes('styles.importAction'), 'import is a tertiary class')
  assert(page.includes('styles.createAction'), 'create is the primary class')
  assert(page.includes('variant="primary"'), 'create stays primary variant')
  assert(workspace.includes('id={searchId}'), 'search input preserved')
  assert(workspace.includes('placeholder="Szukaj pary, miejsca lub pakietu…"'), 'search copy preserved')
  assert(workspace.includes('ModernWeddingsViewSwitch'), 'view switch preserved')
  assert(workspace.includes('chipYears'), 'year chips preserved')
  assert(workspace.includes('Wszystkie'), 'all-years chip preserved')
  assert(workspace.includes('formatWeddingSeasonCount'), 'season count preserved')

  assert(pageCss.includes('@media (max-width: 767px)'), 'page mobile is 767')
  assert(!pageCss.includes('@media (max-width: 720px)'), 'page 720 migrated')
  assert(pageCss.includes('composes: textAction'), 'import uses Phase 0 text action')

  const pageMobile = pageCss.slice(pageCss.indexOf('@media (max-width: 767px)'))
  assert(pageMobile.includes('flex-wrap: nowrap'), 'title and create share one row')
  assert(pageMobile.includes('width: auto'), 'actions do not stack full-width')
  assert(pageMobile.includes('.importAction.importAction'), 'import loses button chrome on mobile')
  assert(pageMobile.includes('font-size: var(--text-xl)'), 'title is compact, not a second hero')

  const desktopPage = pageCss.slice(0, pageCss.indexOf('@media (max-width: 767px)'))
  assert(desktopPage.includes('flex-wrap: wrap'), 'desktop header may wrap')
  assert(desktopPage.includes('gap: var(--space-6)'), 'desktop page gap frozen')
  assert(desktopPage.includes('--type-page-title-size, 1.75rem'), 'desktop title size frozen')

  assert(workspaceCss.includes('@media (max-width: 767px)'), 'workspace mobile is 767')
  assert(!workspaceCss.includes('@media (max-width: 720px)'), 'workspace 720 migrated')
  const wsMobile = workspaceCss.slice(
    workspaceCss.indexOf('@media (max-width: 767px)'),
  )
  assert(wsMobile.includes('display: contents'), 'controls flatten into compact grid')
  assert(wsMobile.includes('grid-row: 2'), 'year chips and view switch share a row')
  assert(wsMobile.includes('font-size: 16px'), 'search is 16px on mobile')
  assert(wsMobile.includes('min-height: var(--touch-target)'), 'search/chip targets are 44px')
  assert(wsMobile.includes('overflow-x: auto'), 'year chips scroll horizontally')
  assert(wsMobile.includes('position: static'), 'year chips are not a second sticky bar')
  assert(wsMobile.includes('.seasonHeading'), 'season heading stays, compacted')
  assert(wsMobile.includes('grid-column: 1 / -1'), 'list follows chrome at full width')

  const desktopWs = workspaceCss.slice(
    0,
    workspaceCss.indexOf('@media (max-width: 767px)'),
  )
  assert(desktopWs.includes('max-width: 28rem'), 'desktop search max-width frozen')
  assert(desktopWs.includes('min-height: 40px'), 'desktop search height frozen')
  assert(desktopWs.includes('position: sticky'), 'desktop year nav stays sticky')
  assert(desktopWs.includes('min-height: 32px'), 'desktop chips stay 32px')
  assert(desktopWs.includes('gap: var(--space-5)'), 'desktop workspace gap frozen')
  assert(desktopWs.includes('font-size: var(--text-xl)'), 'desktop season year size frozen')

  assert(switchCss.includes('@media (max-width: 767px)'), 'view switch mobile is 767')
  const switchMobile = switchCss.slice(switchCss.indexOf('@media (max-width: 767px)'))
  assert(switchMobile.includes('min-height: var(--touch-target)'), 'view switch 44px on mobile')
  assert(switchCss.includes('min-height: 32px'), 'desktop view switch 32px frozen')

  assert(cardCss.includes('@media (max-width: 767px)'), 'card mobile is 767')
  assert(!cardCss.includes('@media (max-width: 720px)'), 'card 720 migrated')
  assert(ledgerCss.includes('@media (max-width: 767px)'), 'ledger mobile is 767')
  assert(!ledgerCss.includes('@media (max-width: 720px)'), 'ledger 720 migrated')
  assert(cardCss.includes('grid-template-rows: auto auto auto minmax(0, 1fr) auto'), 'card zones frozen')
  assert(!workspace.includes('useWedding('), 'no domain fork')
  assert(!page.includes('useInfiniteQuery'), 'no pagination rewrite')
  assert(dash.includes('DashboardV3Hero'), 'Phase 1A dashboard untouched')
  assert(!pageCss.includes('dashboard-v3'), 'does not reuse dashboard styles')
  assert(!workspaceCss.includes('DashboardV3'), 'workspace does not reuse dashboard')
  assert(layout.includes('styles.shellAccess'), 'Phase 0 shell preserved')
  assert(!classic.includes('importAction'), 'classic weddings untouched')
  console.log('PASS  mobile list chrome + desktop freeze')
}

{
  const ledgerCss = read(
    'src/features/weddings/modern/ModernWeddingLedger.module.css',
  )
  const ledgerMobile = ledgerCss.slice(
    ledgerCss.lastIndexOf('@media (max-width: 767px)'),
  )
  const desktopLedger = ledgerCss.slice(
    0,
    ledgerCss.lastIndexOf('@media (max-width: 767px)'),
  )
  assert(
    desktopLedger.includes('grid-template-columns:\n    8.75rem\n    minmax(0, 1fr)\n    7.5rem'),
    'desktop ledger columns frozen',
  )
  assert(!ledgerMobile.includes('order: 2'), 'mobile date is not pushed after identity')
  assert(
    ledgerMobile.includes("grid-template-areas:\n      'date booking'\n      'date value'"),
    'mobile ledger uses a left date rail',
  )
  assert(ledgerMobile.includes('flex-direction: column'), 'mobile date stacks day/month/year')
  console.log('PASS  mobile weddings DATE-FIRST ledger')
}

console.log('\nPASS  modern weddings dual-view season workspace')
