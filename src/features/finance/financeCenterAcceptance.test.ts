/**
 * Finance Center V1 — route / UI / UX polish acceptance.
 * Run: npm run test:finance-center
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

const router = read('src/routes/router.tsx')
const sidebar = read('src/layouts/Sidebar.tsx')
const page = read('src/pages/FinancePage.tsx')
const css = read('src/features/finance/FinanceCenter.module.css')
const list = read('src/features/finance/FinanceWeddingList.tsx')
const labels = read('src/features/finance/financeLabels.ts')
const kpi = read('src/features/finance/FinanceKpiStrip.tsx')
const chart = read('src/features/finance/FinanceMonthChart.tsx')
const health = read('src/features/finance/FinanceHealthChips.tsx')
const kind = read('src/features/finance/FinanceKindChips.tsx')
const chips = read('src/features/finance/FinanceMonthChips.tsx')
const tokens = read('src/styles/tokens.css')
const migration = read(
  'supabase/migrations/20260814160000_session_payments.sql',
)

{
  assertIncludes(router, "path: '/finanse'", 'route /finanse')
  assertIncludes(router, 'FinancePage', 'FinancePage wired')
  assertIncludes(sidebar, "to: '/finanse'", 'sidebar nav')
  assertIncludes(sidebar, "label: 'Finanse'", 'sidebar label')
  assertIncludes(sidebar, 'IconFinances', 'finance icon')
  console.log('PASS  route + sidebar')
}

{
  assertIncludes(page, 'AppLayout', 'AppLayout')
  assertIncludes(page, 'PageHeader', 'Finance-owned PageHeader')
  assertIncludes(page, 'title="Finanse"', 'title')
  assertIncludes(page, 'Sezon', 'Sezon tab')
  assertIncludes(page, 'Zlecenia', 'Zlecenia tab')
  assertIncludes(page, 'FinanceKpiStrip', 'KPIs')
  assertIncludes(page, 'FinanceMonthChart', 'month chart')
  assertIncludes(page, 'FinanceSummaryPanel', 'desktop summary panel')
  assertIncludes(page, 'FinanceHealthChips', 'health filters')
  assertIncludes(page, 'useResolvedFinanceSeasonYear', 'default season')
  assertIncludes(page, 'Brak zleceń w tym sezonie.', 'empty season')
  assertIncludes(
    page,
    'Brak zleceń spełniających wybrane kryteria.',
    'empty filter',
  )
  assertNotIncludes(page, 'Koszty', 'no Koszty tab')
  assertIncludes(page, 'width="full"', 'PageContainer full')
  assertIncludes(page, 'styles.pageShell', 'finance pageShell')
  assertIncludes(page, 'styles.financeHeader', 'finance title hierarchy')
  assertIncludes(page, 'styles.controlStack', 'tabs + kind filters stacked')
  assertIncludes(page, 'styles.controlTopRow', 'tabs + season share top row')
  assertIncludes(page, 'styles.seasonControl', 'season navigator')
  assertIncludes(page, 'styles.seasonControlHeader', 'desktop season in header')
  assertIncludes(page, 'styles.seasonControlStack', 'mobile season in control row')
  assertIncludes(page, 'renderSeasonNavigator', 'shared season navigator markup')
  assertNotIncludes(page, 'subtitle={', 'no Finanse season subtitle')
  assertNotIncludes(page, '`Sezon ${seasonYear}`', 'season not duplicated as subtitle')
  assertIncludes(
    css,
    '.controlTopRow',
    'mobile top toolbar row',
  )
  assertIncludes(
    css,
    'justify-content: space-between',
    'tabs left / season right',
  )
  assertIncludes(
    css,
    '.seasonControlStack',
    'mobile season stack placement styles',
  )
  assertIncludes(
    css,
    '.financeHeader > *:last-child:not(:only-child)',
    'mobile hides empty header action slot',
  )
  assertIncludes(css, 'analyticsSection', 'analytics layout')
  assertIncludes(
    css,
    'border-left: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent)',
    'unified analytics divider',
  )

  const pageShellBlock = css.slice(
    css.indexOf('.pageShell {'),
    css.indexOf('.workspace {'),
  )
  assertIncludes(pageShellBlock, 'max-width: 1360px', 'capped at 1360')
  assertIncludes(pageShellBlock, 'width: 100%', 'fluid under cap')
  assertIncludes(pageShellBlock, 'margin-inline: auto', 'centered shell')
  assertNotIncludes(pageShellBlock, 'max-width: none', 'not full-bleed')
  assertNotIncludes(
    pageShellBlock,
    '--content-max-wide',
    'no global wide token on Finance shell',
  )
  assertNotIncludes(
    tokens,
    '--content-max-wide: 1360px',
    'global token unchanged',
  )
  assertIncludes(tokens, '--content-max-wide: 1240px', 'global wide still 1240')
  console.log('PASS  page structure + desktop width hierarchy')
}

{
  assertIncludes(kpi, 'Wartość zleceń', 'KPI CV')
  assertIncludes(kpi, 'Wpłacono', 'KPI paid')
  assertIncludes(kpi, 'Pozostało', 'KPI remaining')
  assertIncludes(kpi, 'Otrzymane zaliczki', 'KPI deposits')
  assertNotIncludes(kpi, 'Liczba ślubów', 'count not primary KPI card')
  assertIncludes(kpi, 'assignmentCount', 'secondary assignment count')
  assertIncludes(kpi, 'weddingCount', 'secondary wedding count')
  assertIncludes(kpi, 'sessionCount', 'secondary session count')
  assertIncludes(kpi, 'averageContractValue', 'secondary average CV')
  assertIncludes(kpi, 'getFinanceSecondarySummaryParts', 'structured secondary summary')
  assertIncludes(kpi, 'kpiSecondaryAverage', 'average is a wrap unit')
  assertIncludes(kpi, 'kpiSecondaryCluster', 'count metrics clustered')
  assertIncludes(labels, 'Średnia wartość', 'average copy')
  assertIncludes(labels, 'getFinanceSecondarySummaryParts', 'parts helper')
  assertIncludes(labels, 'formatFinanceSecondarySummary', 'string helper retained')
  assertIncludes(css, 'kpiSecondaryAverage', 'average wrap styles')
  assertNotIncludes(css, 'kpiSecondaryAverage::before', 'no hanging orphan ·')
  assertIncludes(css, 'white-space: nowrap', 'secondary metrics nowrap')
  assertIncludes(css, 'repeat(2, minmax(0, 1fr))', 'mobile 2×2 KPI')
  assertIncludes(css, 'repeat(4, minmax(0, 1fr))', 'desktop 4 KPI')
  assertNotIncludes(kpi, '%', 'no percentages in KPI')
  assertNotIncludes(page, 'Zysk', 'no profit')
  assertNotIncludes(page, 'Koszty', 'no expenses')
  console.log('PASS  KPI hierarchy')
}

{
  assertIncludes(page, 'FinanceKindChips', 'kind filter wired')
  assertIncludes(page, 'kindFilter', 'kind filter state')
  assertIncludes(page, 'filterFinanceAssignments', 'mixed assignment filter')
  assertIncludes(kind, "label: 'Wszystkie'", 'all assignments chip')
  assertIncludes(kind, "label: 'Śluby'", 'weddings chip')
  assertIncludes(kind, "label: 'Sesje'", 'sessions chip')
  assertIncludes(kind, 'data-finance-kind-filter', 'kind filter marker')
  console.log('PASS  mixed assignment kind filter')
}

{
  assertIncludes(chart, 'data-finance-chart', 'chart marker')
  assertIncludes(chart, 'data-finance-chart-bars', 'bars marker')
  assertIncludes(chart, 'data-finance-month-detail', 'selected month detail')
  assertIncludes(chart, 'mobileOnly', 'month detail mobile-only')
  assertIncludes(chart, 'monthDetailHero', 'month detail hero value')
  assertIncludes(chart, 'Cały sezon', 'reset control')
  assertIncludes(chart, 'data-finance-chart-reset', 'chart owns Cały sezon')
  assertIncludes(chart, 'onSelectMonth', 'selectable months')
  assertIncludes(chart, 'disabled={empty}', 'empty months not selectable')
  assertIncludes(css, 'monthDetailHeroValue', 'hero money styling')
  assertIncludes(css, 'min-height: 44px', 'health filters touch target')
  assertIncludes(css, 'padding: 6px 10px', 'mobile health padding preserved')
  assertIncludes(css, 'padding: 8px 12px', 'desktop health padding')
  assertNotIncludes(css, 'min-height: 64px', 'no tall health KPI cards')
  assertIncludes(labels, 'FINANCE_SEASON_PREVIEW_LIMIT = 5', 'preview max 5')
  console.log('PASS  selected month + health density + preview')
}

{
  assertIncludes(page, 'data-finance-analytics', 'analytics section')
  assertIncludes(page, 'FinanceSummaryPanel', 'summary panel wired')
  const summary = read('src/features/finance/FinanceSummaryPanel.tsx')
  assertIncludes(summary, 'data-finance-summary-panel', 'summary panel marker')
  assertIncludes(summary, 'kpis.contractValue', 'season uses KPI model')
  assertIncludes(summary, 'month.contractValue', 'month uses month bucket')
  assertNotIncludes(summary, 'Cały sezon', 'reset lives on chart, not summary')
  assertIncludes(css, 'analyticsSection', 'analytics layout')
  assertIncludes(
    css,
    'grid-template-columns: minmax(0, 1fr) clamp(240px, 28%, 320px)',
    'chart+summary ratio ~72/28',
  )
  assertIncludes(css, '@media (min-width: 1024px)', 'side-by-side at 1024+')
  assertNotIncludes(page, 'sessionService', 'no session finance fetch')
  assertNotIncludes(page, 'financeSeasonService', 'no direct service in page')
  console.log('PASS  desktop chart + summary architecture')
}

{
  assertIncludes(
    chart,
    'Wartość zleceń według miesiąca realizacji',
    'concise chart subtitle',
  )
  assertNotIncludes(chart, 'z podziałem na wpłacono', 'no redundant legend copy')
  assertIncludes(chart, 'chartToolbar', 'composed chart toolbar')
  assertIncludes(chart, 'chartBarsFocused', 'focus dim when month selected')
  assertNotIncludes(chart, 'Wysokość = wartość zleceń', 'no redundant legend')
  assertIncludes(css, 'repeat(12, minmax(0, 1fr))', '12 equal columns')
  assertIncludes(css, '--finance-chart-plot-h', 'responsive plot height')
  assertIncludes(css, 'chartColEmpty', 'empty months quiet')
  assertIncludes(css, 'chartResetActive', 'season reset active state')
  assertIncludes(css, 'summaryMetricPrimary', 'summary value hierarchy')
  assertNotIncludes(css, 'recharts', 'no chart lib in css')
  const barsBlock = css.slice(
    css.indexOf('.chartBars {'),
    css.indexOf('.chartCol {'),
  )
  assertIncludes(barsBlock, 'minmax(0, 1fr)', 'equal fluid columns')
  assertIncludes(barsBlock, 'min-width: 0', 'allow shrink')
  assertNotIncludes(barsBlock, 'min-width: 640', 'no forced wide min-width')
  assertNotIncludes(barsBlock, 'overflow-x: auto', 'chartBars no h-scroll')
  const plotBlock = css.slice(
    css.indexOf('.chartPlot {'),
    css.indexOf('.chartBars {'),
  )
  assertNotIncludes(plotBlock, 'overflow-x: auto', 'plot no h-scroll')
  console.log('PASS  mobile chart no horizontal scroll')
}

{
  assertIncludes(page, 'desktopOnly', 'desktop chips gated')
  assertIncludes(chips, 'data-finance-month-chips-desktop', 'desktop chips marker')
  assertIncludes(chips, 'FinanceMonthSelect', 'mobile month select')
  assertIncludes(page, 'FinanceMonthSelect', 'zlecenia mobile select')
  assertIncludes(page, 'FinanceMonthChips', 'zlecenia desktop month chips')
  // Season tab: chart is the month selector — no duplicate 12-month chip row
  const seasonTabSlice = page.slice(
    page.indexOf("tab === 'season'"),
    page.indexOf("tab === 'season'") > -1
      ? page.indexOf(") : (", page.indexOf("tab === 'season'"))
      : 0,
  )
  assert(
    !seasonTabSlice.includes('FinanceMonthChips'),
    'season tab has no duplicate month chips under chart',
  )
  assertIncludes(page, 'selectedMonth={month}', 'canonical month state')
  assertNotIncludes(page, 'data-finance-month-chips-mobile', 'no mobile carousel marker')
  assertNotIncludes(page, 'recharts', 'no chart library')
  assertNotIncludes(page, 'chart.js', 'no chart.js')
  console.log('PASS  chart primary month selection / no season chip duplication')
}

{
  assertIncludes(labels, 'FINANCE_SEASON_PREVIEW_LIMIT = 5', 'preview limit 5')
  assertIncludes(page, 'FINANCE_SEASON_PREVIEW_LIMIT', 'uses preview limit')
  assertIncludes(page, 'Zobacz wszystkie zlecenia', 'CTA to Zlecenia')
  assertIncludes(page, "selectTab('weddings')", 'CTA switches tab')
  assertIncludes(page, 'openAllWeddings', 'preview CTA handler')
  assertIncludes(page, 'preview', 'preview slice')
  console.log('PASS  season preview limit + CTA')
}

{
  assertIncludes(health, 'missing_deposit', 'missing deposit filter')
  assertIncludes(health, 'Brak zaliczki', 'missing deposit copy')
  assertIncludes(health, 'Filtr listy zleceń', 'health is filter copy')
  assertIncludes(health, 'data-finance-health', 'health marker')
  assertIncludes(css, 'healthChip', 'compact health styles')
  assertNotIncludes(css, 'min-height: 64px', 'no oversized health cards')
  console.log('PASS  payment health filters')
}

{
  assertIncludes(labels, 'tab=contract_finance', 'deep link')
  assertIncludes(labels, 'financeSessionDetailHref', 'session deep link helper')
  assertIncludes(labels, '`/sesje/${sessionId}`', 'session detail route')
  assertIncludes(list, 'navigate(a.deepLink)', 'row uses assignment deep link')
  assertIncludes(list, 'FinanceWeddingTable', 'desktop table')
  assertIncludes(list, 'FinanceWeddingCards', 'mobile cards')
  assertIncludes(list, 'financeAssignmentKindLabel', 'kind badge label')
  assertIncludes(list, 'data-finance-type-cell', 'desktop type cell')
  assertIncludes(list, 'data-finance-name-cell', 'desktop name cell')
  assertIncludes(list, 'data-finance-card-kind', 'mobile card kind badge')
  assertIncludes(list, 'Typ', 'dedicated Typ header text')
  assertIncludes(list, 'colType', 'Typ column class')
  assertIncludes(list, 'Zlecenie', 'Zlecenie column')
  const thead = list.slice(list.indexOf('<thead>'), list.indexOf('</thead>'))
  const order = ['Typ', 'Data', 'Zlecenie', 'Wartość', 'Zaliczka', 'Wpłacono', 'Pozostało', 'Status']
  let cursor = -1
  for (const label of order) {
    const next = thead.indexOf(label, cursor + 1)
    assert(next > cursor, `thead order includes ${label} after previous`)
    cursor = next
  }
  assertNotIncludes(thead, 'Otrzymana zaliczka', 'no long deposit header')
  assertIncludes(thead, 'Zaliczka', 'concise Zaliczka header')
  const typeCellSlice = list.slice(
    list.indexOf('data-finance-type-cell'),
    list.indexOf('data-finance-name-cell'),
  )
  assertIncludes(typeCellSlice, 'kindBadge', 'type badge lives in Typ cell')
  assertIncludes(typeCellSlice, 'data-kind={a.kind}', 'kind badge marker in Typ')
  assertIncludes(typeCellSlice, 'colDate', 'Data sits between Typ and Zlecenie')
  const nameCellSlice = list.slice(
    list.indexOf('data-finance-name-cell'),
    list.indexOf('FinanceWeddingCards'),
  )
  assertNotIncludes(nameCellSlice, 'kindBadge', 'name cell has no type badge')
  assertIncludes(list, 'scope="col"', 'column scope on headers')
  assertIncludes(kpi, 'Otrzymane zaliczki', 'aggregate deposit KPI retained')
  assertIncludes(list, 'Nadpłata', 'overpayment hint')
  assertIncludes(list, 'compact: true', 'compact status labels')
  assertIncludes(list, 'colName', 'flexible name column')
  assertIncludes(css, '.num', 'money num class')
  assertIncludes(css, 'white-space: nowrap', 'money nowrap present')
  const dateCss = css.slice(css.indexOf('.colDate {'), css.indexOf('.colName {'))
  assertIncludes(dateCss, 'white-space: nowrap', 'date column nowrap')
  assertIncludes(dateCss, '9.75rem', 'date column wide enough for Polish long months')
  assertIncludes(dateCss, 'padding-inline: 8px 18px', 'Data trailing gutter')
  const nameCss = css.slice(css.indexOf('.colName {'), css.indexOf('.colMoney {'))
  assertIncludes(nameCss, 'padding-inline-start: 16px', 'Zlecenie leading gutter')
  assertIncludes(nameCss, 'width: auto', 'Zlecenie remains flexible')
  console.log('PASS  mixed list badges + deep links')
}

{
  assertIncludes(css, 'desktopOnly', 'desktop gate')
  assertIncludes(css, 'mobileOnly', 'mobile gate')
  assertIncludes(css, '@media (min-width: 768px)', 'breakpoint 768')
  assertIncludes(css, 'assignmentTableGate', 'table gate class')
  assertIncludes(css, 'assignmentCardsGate', 'cards gate class')
  assertIncludes(css, '@media (min-width: 1100px)', 'table only ≥1100')
  assertIncludes(page, 'assignmentTableGate', 'preview/full use table gate')
  assertIncludes(page, 'assignmentCardsGate', 'preview/full use cards gate')
  assert(
    (page.match(/assignmentTableGate/g) ?? []).length >= 2,
    'table gate on preview and full list',
  )
  assert(
    (page.match(/assignmentCardsGate/g) ?? []).length >= 2,
    'cards gate on preview and full list',
  )
  const tableWrapBlock = css.slice(
    css.indexOf('.tableWrap {'),
    css.indexOf('.table {'),
  )
  assertNotIncludes(
    tableWrapBlock,
    'overflow-x: auto',
    'no desktop table horizontal scroll wrapper',
  )
  assertIncludes(tableWrapBlock, 'overflow-x: clip', 'table wrap clips not scrolls')
  assertIncludes(css, 'safe-area-inset-bottom', 'safe area')
  assertIncludes(css, 'overflow-x: clip', 'page no horizontal scroll')
  assertNotIncludes(page, 'payment-date', 'no payment-date cash flow')
  assertNotIncludes(page, 'Po terminie', 'no overdue')
  console.log('PASS  responsive / scroll ownership')
}

{
  assertIncludes(page, 'date:asc', 'default sort date')
  assertIncludes(page, 'contract_value', 'sort by value')
  assertIncludes(page, 'total_paid', 'sort by paid')
  assertIncludes(page, 'remaining', 'sort by remaining')
  console.log('PASS  filters / sorting')
}

{
  assertNotIncludes(
    migration.toLowerCase(),
    'alter table public.payments',
    'session ledger migration leaves wedding payments schema unchanged',
  )
  assertIncludes(
    migration,
    'Does NOT modify public.payments',
    'migration documents wedding payment isolation',
  )
  console.log('PASS  wedding payment schema remains isolated')
}

{
  const hooks = read('src/features/finance/useFinanceSeason.ts')
  assertIncludes(hooks, 'placeholderData', 'season switch keep previous')
  const service = read('src/lib/api/financeSeasonService.ts')
  assertNotIncludes(service, 'weddingService.getAll', 'perf preserved')
  assertIncludes(service, 'listByWeddingIds', 'batch payments preserved')
  console.log('PASS  performance preservation')
}

{
  const animated = read('src/features/finance/AnimatedCurrencyValue.tsx')
  const revealHook = read('src/features/finance/useFinanceEntranceReveal.ts')
  const motion = read('src/features/finance/financeMotion.ts')
  const summary = read('src/features/finance/FinanceSummaryPanel.tsx')

  assertIncludes(page, 'useFinanceEntranceReveal', 'entrance reveal hook wired')
  assertIncludes(page, 'data-finance-reveal', 'reveal phase attribute')
  assertIncludes(page, 'data-finance-entrance-locked', 'entrance lock attribute')
  assertIncludes(page, 'completeEntrance', 'interaction completes entrance')
  assertIncludes(page, 'selectTab', 'tab helper for one-shot')
  assertIncludes(page, 'selectMonth', 'month helper for one-shot')
  assertIncludes(revealHook, 'useSyncExternalStore', 'reduced motion sync store')
  assertIncludes(revealHook, "phase: 'prep'", 'first-ready render is prep')
  assertIncludes(revealHook, 'entranceConsumed', 'once-per-route-visit lock')
  assertIncludes(
    revealHook,
    'Do not set entranceConsumed here',
    'Strict Mode abort must not permanently consume visit',
  )
  assertIncludes(revealHook, 'completeEntrance', 'force-complete API')
  assertIncludes(revealHook, 'FINANCE_ENTRANCE_DONE_MS', 'centralized done window')
  assertIncludes(revealHook, 'prefers-reduced-motion', 'reduced motion gate')
  assertIncludes(motion, 'financeSmoothstep', 'smoothstep counter curve')
  assertNotIncludes(motion, 'financeCounterProgress', 'no perceived-completion curve')
  assertNotIncludes(motion, '0.88', 'no mid-target perceived completion')
  assertIncludes(motion, 'FINANCE_COUNT_MS = 900', 'desktop count-up duration')
  assertIncludes(motion, 'FINANCE_ENTRANCE_DONE_MS = 1360', 'Final Rhythm ~1.36s window')
  assertIncludes(motion, 'FINANCE_BAR_STAGGER_DESKTOP_MS', 'deterministic bar stagger')
  assertIncludes(motion, '0, 28, 50, 72, 92, 110', 'compressed stagger spread')
  assertIncludes(motion, 'FINANCE_KPI_COUNT_DELAYS_MS', 'KPI micro offsets')
  assertIncludes(motion, '[50, 70, 90, 105]', 'KPI waits for surface then micro offset')
  assertIncludes(motion, 'primary: 260', 'summary synced after chart start')
  assertIncludes(animated, 'financeSmoothstep', 'count uses smoothstep')
  assertNotIncludes(animated, 'financeCounterProgress', 'no perceived-completion in counters')
  assertIncludes(animated, 'requestAnimationFrame', 'rAF count-up')
  assertIncludes(animated, 'aria-hidden="true"', 'visual count aria-hidden')
  assertIncludes(animated, 'countedRef', 'no replay count-up')
  assertIncludes(animated, 'delayMs', 'count delay support')
  assertIncludes(kpi, 'FINANCE_KPI_COUNT_DELAYS_MS', 'KPI stagger wired')
  assertIncludes(kpi, 'AnimatedCurrencyValue', 'KPI uses animated currency')
  assertIncludes(summary, 'AnimatedCurrencyValue', 'summary uses animated currency')
  assertIncludes(summary, 'summaryMetricPrimary', 'primary value hierarchy')
  assertIncludes(summary, 'summaryMetricSecondary', 'secondary value hierarchy')
  assertIncludes(summary, 'FINANCE_SUMMARY_COUNT_DELAYS_MS', 'summary offsets')
  assertIncludes(css, '--finance-motion-bars', 'motion token bars')
  assertIncludes(css, '--finance-motion-bars-delay-base: 220ms', 'chart start Final Rhythm')
  assertIncludes(css, '--finance-motion-bars: 940ms', 'chart duration Final Rhythm')
  assertIncludes(css, 'cubic-bezier(0.3, 0, 0.18, 1)', 'chart ease preserved')
  assertIncludes(css, 'financeChartBarRise', 'chart bar rise keyframes')
  assertIncludes(css, '--finance-bar-delay', 'active-month stagger var')
  assertIncludes(css, 'financeSectionIn', 'lower-section entrance keyframes')
  assertIncludes(css, '--finance-motion-health-delay: 620ms', 'health Final Rhythm start')
  assertIncludes(css, '--finance-motion-health: 450ms', 'health Final Rhythm duration')
  assertIncludes(css, '--finance-motion-preview-delay: 760ms', 'preview Final Rhythm start')
  assertIncludes(css, '--finance-motion-preview: 500ms', 'preview Final Rhythm duration')
  assertIncludes(css, 'financeSurfaceIn', 'KPI/analytics surface entrance')
  assertIncludes(css, 'financeFadeIn', 'label fade keyframes')
  assertIncludes(css, "--finance-motion-kpi-surface: 320ms", 'KPI surface duration')
  assertIncludes(css, "--finance-motion-analytics-delay: 80ms", 'analytics surface delay')
  assertNotIncludes(css, 'opacity: 0.42', 'no greyed L4 opacity experiment')
  assertIncludes(css, "[data-finance-reveal='prep'] .healthSection", 'health prep hide')
  assertIncludes(css, "[data-finance-reveal='play'] .healthSection", 'health play entrance')
  assertIncludes(css, "[data-finance-reveal='prep'] .listSection", 'preview prep hide')
  assertIncludes(css, "[data-finance-reveal='play'] .listSection", 'preview play entrance')
  assertIncludes(css, "data-finance-reveal='prep'", 'prep flash prevention')
  assertIncludes(css, 'scaleY(0)', 'bars rise from baseline')
  assertIncludes(css, 'transform-origin: bottom center', 'rise from baseline')
  assertIncludes(revealHook, 'Animation-tax rule', 'no artificial data delay')
  assertIncludes(
    css,
    "data-finance-reveal='done'] .chartBarStack",
    'done state kills remount replay',
  )
  assertIncludes(chart, '--finance-bar-delay', 'stagger wired on stacks')
  assertIncludes(chart, 'financeActiveBarDelayMs', 'stagger helper used')
  assertIncludes(chart, '* 84', 'plot fill ~84%')
  assertIncludes(css, 'prefers-reduced-motion: reduce', 'reduced motion CSS')
  assertIncludes(css, 'animation: none !important', 'reduced motion disables entrance')
  assertIncludes(
    css,
    "[data-finance-reveal='prep'] .kpiSection",
    'reduced-motion covers KPI prep',
  )
  assertNotIncludes(page, "from 'framer-motion'", 'Finance page does not import framer')
  assertNotIncludes(animated, 'framer-motion', 'currency helper has no framer')
  assertNotIncludes(revealHook, 'framer-motion', 'reveal hook has no framer')
  assertNotIncludes(kpi, 'framer-motion', 'KPI has no framer')
  assertNotIncludes(chart, 'framer-motion', 'chart has no framer')
  assertNotIncludes(summary, 'framer-motion', 'summary has no framer')
  assertNotIncludes(page, 'financeSeasonQueryKey', 'no new query keys on page')
  assertNotIncludes(chart, 'recharts', 'still no chart lib')
  assertNotIncludes(animated, 'easeOutCubic', 'no aggressive easeOutCubic')
  console.log('PASS  finance entrance motion + Final Rhythm')
}

{
  // No visible Finance loading copy — chrome + quiet empty body until dataReady.
  assertNotIncludes(page, 'Ładowanie finansów sezonu', 'no Finance loading copy')
  assertNotIncludes(page, 'DelayedFinanceLoadingCopy', 'no delayed loader component')
  assertNotIncludes(page, 'FINANCE_LOADING_COPY_DELAY_MS', 'no loader delay constant')
  assertNotIncludes(page, 'pendingWithoutModel', 'no pending-without-model loader gate')
  assertNotIncludes(
    page,
    'seasonQuery.isLoading && !model',
    'pending season does not drive a loading UI branch',
  )
  assertIncludes(page, 'useFinanceEntranceReveal(dataReady)', 'entrance still owns dataReady')
  assertIncludes(page, 'const dataReady = Boolean(model) && !seasonEmpty', 'dataReady unchanged')
  const hooks = read('src/features/finance/useFinanceSeason.ts')
  assertIncludes(hooks, 'placeholderData', 'warm season switch placeholder untouched')
  assertIncludes(hooks, 'staleTime: FINANCE_STALE_MS', 'staleTime untouched')
  console.log('PASS  finance no loading-copy first-paint')
}

console.log('\nAll finance UI acceptance tests passed.')
