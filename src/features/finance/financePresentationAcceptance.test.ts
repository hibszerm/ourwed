/**
 * Finances V1 — conservative Modern presentation lift.
 * Run: npm run test:finance-presentation
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  FINANCE_HEALTH_MISSING_DEPOSIT_LABEL,
  FINANCE_KPI_DEPOSITS_LABEL,
  FINANCE_TABLE_DEPOSIT_PAID_LABEL,
} from './financeLabels'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertIncludes(src: string, needle: string, message: string) {
  assert(src.includes(needle), `${message}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, message: string) {
  assert(!src.includes(needle), `${message}: must not include ${JSON.stringify(needle)}`)
}

let failed = 0

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    failed += 1
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
  }
}

const page = read('src/pages/FinancePage.tsx')
const css = read('src/features/finance/FinanceCenter.module.css')
const kpi = read('src/features/finance/FinanceKpiStrip.tsx')
const health = read('src/features/finance/FinanceHealthChips.tsx')
const list = read('src/features/finance/FinanceWeddingList.tsx')
const chart = read('src/features/finance/FinanceMonthChart.tsx')
const summary = read('src/features/finance/FinanceSummaryPanel.tsx')
const hooks = read('src/features/finance/useFinanceSeason.ts')
const keys = read('src/features/finance/financeQueryKeys.ts')
const motion = read('src/features/finance/financeMotion.ts')
const reveal = read('src/features/finance/useFinanceEntranceReveal.ts')
const commercial = read('src/lib/utils/commercial.ts')
const extrasPricing = read('src/lib/forms/weddingExtraPricing.ts')
const travel = read('src/lib/utils/travelFeeCommercial.ts')
const packagesPage = read('src/pages/PackagesPage.tsx')
const extrasPage = read('src/pages/ExtraServicesPage.tsx')
const packagesWorkspace = read(
  'src/features/studio/packages/modern/ModernPackagesWorkspace.tsx',
)
const extrasWorkspace = read(
  'src/features/studio/extras/ModernExtraServicesWorkspace.tsx',
)

run('1. in-page H1 / AppLayout without Classic title', () => {
  assertIncludes(page, '<AppLayout>', 'AppLayout without title prop')
  assertNotIncludes(page, '<AppLayout title', 'no Classic AppLayout-owned title')
  assertIncludes(page, 'PageHeader', 'Finance-owned header')
  assertIncludes(page, 'title="Finanse"', 'in-page Finanse H1')
  assertIncludes(page, 'width="wide"', 'accepted Modern wide shell')
})

run('2. architecture preserved — not a new dashboard', () => {
  assertIncludes(page, 'Sezon', 'Sezon tab')
  assertIncludes(page, 'Zlecenia', 'Zlecenia tab')
  assertIncludes(page, 'FinanceKpiStrip', 'four KPI strip')
  assertIncludes(page, 'FinanceMonthChart', 'monthly chart')
  assertIncludes(page, 'FinanceSummaryPanel', 'chart-side summary')
  assertIncludes(page, 'FinanceHealthChips', 'payment-health filters')
  assertIncludes(page, 'FinanceWeddingTable', 'desktop table')
  assertIncludes(page, 'FinanceWeddingCards', 'responsive cards')
  assertIncludes(page, 'FinanceKindChips', 'Wszystkie / Śluby / Sesje')
  assertNotIncludes(page, 'Zysk', 'no profit fiction')
  assertNotIncludes(page, 'Koszty', 'no expense fiction')
  assertNotIncludes(page, 'Przepływ', 'no cash-flow fiction')
  assertNotIncludes(css, 'recharts', 'no chart library')
  assertNotIncludes(page, 'recharts', 'no chart library on page')
})

run('3. canonical Zadatek UI copy; calculations untouched', () => {
  assert(FINANCE_KPI_DEPOSITS_LABEL === 'Otrzymane zadatki', 'KPI copy')
  assert(FINANCE_HEALTH_MISSING_DEPOSIT_LABEL === 'Brak zadatku', 'health copy')
  assert(FINANCE_TABLE_DEPOSIT_PAID_LABEL === 'Wpłacony zadatek', 'table copy')
  assertIncludes(kpi, 'FINANCE_KPI_DEPOSITS_LABEL', 'KPI uses canonical label')
  assertIncludes(kpi, 'kpis.depositsReceived', 'KPI still received deposits')
  assertIncludes(health, 'FINANCE_HEALTH_MISSING_DEPOSIT_LABEL', 'health uses canonical label')
  assertIncludes(list, 'FINANCE_TABLE_DEPOSIT_PAID_LABEL', 'table uses received-deposit label')
  assertIncludes(list, 'a.depositPaid', 'table still renders received money')
  assertNotIncludes(kpi, 'zaliczk', 'no zaliczka in KPI strip')
  assertNotIncludes(health, 'zaliczk', 'no zaliczka in health chips')
  assertNotIncludes(list, 'Zaliczka', 'no zaliczka table header')
})

run('4. chart + summary + health preserved', () => {
  assertIncludes(chart, 'data-finance-chart', 'chart marker')
  assertIncludes(chart, 'Wartość zleceń według miesiąca realizacji', 'execution-date chart')
  assertIncludes(summary, 'data-finance-summary-panel', 'summary remains')
  assertIncludes(summary, 'kpis.contractValue', 'summary season CV')
  assertIncludes(health, 'missing_deposit', 'missing deposit filter')
  assertIncludes(health, 'aria-pressed', 'pressed semantics')
})

run('5. loading skeleton without query redesign', () => {
  assertIncludes(page, 'data-testid="finance-loading"', 'skeleton')
  assertIncludes(page, 'FinanceLoadingSkeleton', 'dedicated loading presentation')
  assertNotIncludes(page, 'Ładowanie finansów sezonu', 'no retired loading copy')
  assertNotIncludes(page, '12 000', 'no fake money in page')
  assertIncludes(hooks, "queryKey: financeSeasonQueryKey(userId, year)", 'season key helper')
  assertIncludes(hooks, 'staleTime: FINANCE_STALE_MS', 'staleTime frozen')
  assertIncludes(hooks, 'placeholderData: (previous) => previous', 'placeholder frozen')
  assertIncludes(keys, "'season'", 'season key segment')
  assertIncludes(keys, "'season-years'", 'years key segment')
})

run('6. no commercial helper fork', () => {
  assertNotIncludes(page, 'computeWeddingContractValue', 'page does not recompute CV')
  assertNotIncludes(page, 'resolvePackageBasePrice', 'page does not resolve live package base')
  assertNotIncludes(page, 'getEffectiveTravelFeeAmount', 'page does not fork travel')
  assertNotIncludes(page, 'getWeddingCommercialSummary', 'page does not fork commercial summary')
  assertIncludes(extrasPricing, 'export function computeWeddingContractValue', 'CV helper remains')
  assertIncludes(travel, 'export function getEffectiveTravelFeeAmount', 'travel helper remains')
  assertIncludes(commercial, 'export function getContractValue', 'commercial remains')
  assertIncludes(commercial, 'export function getAgreedDeposit', 'agreed deposit remains')
  assertIncludes(commercial, 'export function getWeddingCommercialSummary', 'summary remains')
})

run('7. no accidental Packages / Extras Modern imports', () => {
  assertNotIncludes(page, 'ModernPackagesWorkspace', 'no packages workspace import')
  assertNotIncludes(page, 'ModernExtraServicesWorkspace', 'no extras workspace import')
  assertNotIncludes(page, "from '@/features/studio/packages", 'no packages feature import')
  assertNotIncludes(page, "from '@/features/studio/extras", 'no extras feature import')
  assertIncludes(packagesPage, 'ModernPackagesWorkspace', 'packages page untouched')
  assertIncludes(extrasPage, 'ModernExtraServicesWorkspace', 'extras page untouched')
  assertIncludes(packagesWorkspace, 'PACKAGES_TITLE', 'packages workspace untouched')
  assertIncludes(extrasWorkspace, 'data-testid="extras-modern"', 'extras workspace untouched')
})

run('8. animation implementation frozen', () => {
  assertIncludes(motion, 'FINANCE_COUNT_MS = 900', 'count duration')
  assertIncludes(motion, 'FINANCE_ENTRANCE_DONE_MS = 1360', 'entrance window')
  assertIncludes(css, '--finance-motion-bars: 940ms', 'bar duration')
  assertIncludes(css, '--finance-motion-bars-delay-base: 220ms', 'bar delay')
  assertIncludes(css, 'cubic-bezier(0.3, 0, 0.18, 1)', 'bar ease')
  assertIncludes(reveal, 'useSyncExternalStore', 'reveal implementation')
  assertIncludes(page, 'useFinanceEntranceReveal', 'page still uses reveal hook')
})

run('9. CSS isolation — wide shell, not a centered island', () => {
  const pageShellBlock = css.slice(
    css.indexOf('.pageShell {'),
    css.indexOf('.workspace {'),
  )
  assertNotIncludes(pageShellBlock, 'max-width: 1360px', 'no 1360 island')
  assertNotIncludes(pageShellBlock, 'margin-inline: auto', 'not independently centered')
  assertNotIncludes(css, 'max-width: 800px', 'not a thin editorial column')
  assertNotIncludes(css, 'max-width: 920px', 'not a 920 column')
  assertIncludes(css, '@media (min-width: 1100px)', 'table/card breakpoint frozen')
  assertIncludes(css, 'assignmentTableGate', 'table gate preserved')
  assertIncludes(css, 'assignmentCardsGate', 'cards gate preserved')
})

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('\nfinance-presentation: all passed\n')
}
