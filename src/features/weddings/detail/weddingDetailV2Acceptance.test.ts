/**
 * Wedding Workspace V2 — structural redesign acceptance (not card-grid V2).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildActivityFeed,
  getCoupleDisplayName,
  getMissingReadinessItems,
  getNextAction,
  getReceptionDisplayName,
  getWeddingLocationItems,
  parseWorkspaceTab,
  WORKSPACE_TABS,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { WEDDING_DETAIL_V2_TAB_KEY } from '@/features/weddings/detail/v2/weddingDetailV2Types'
import { evaluateWeddingContractReadiness } from '@/lib/utils/weddingContractReadiness'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { formatCurrency } from '@/lib/utils/currency'
import type { WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

function stubWedding(overrides: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w1',
    couple: {
      partner1: 'Iza Karczewska',
      partner2: 'Jan Kulewski',
      partner1FirstName: 'Iza',
      partner1LastName: 'Karczewska',
      partner2FirstName: 'Jan',
      partner2LastName: 'Kulewski',
      email: 'iza@example.com',
      phone: '500100200',
      venue: 'Villa Love',
      city: 'Izdebnik',
    },
    date: '2026-07-29',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Video Mini',
    packageId: null,
    price: 9500,
    depositAmount: 1000,
    currency: 'PLN',
    packageItems: [{ title: 'Video', sortOrder: 0, enabled: true }],
    finalPaymentDueDate: '2026-07-15',
    bridePreparationLocation: 'Zabrze prep',
    groomPreparationLocation: 'Ruda prep',
    ceremonyLocation: 'Kościół',
    receptionLocation: 'Villa Love',
    accentColor: '#0a0a0a',
    createdAt: '2026-01-01',
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [
      {
        id: 'n1',
        content: 'drona chcemy',
        createdAt: '2026-07-20',
        author: 'Para',
      },
    ],
    deliverables: [],
    timeline: [
      {
        id: 't1',
        title: 'Utworzono zlecenie',
        date: '2026-01-01',
        type: 'created',
      },
    ],
    ...overrides,
  }
}

function place(
  role: WeddingPlace['role'],
  address: string,
  label?: string,
): WeddingPlace {
  return {
    id: role,
    weddingId: 'w1',
    role,
    label: label ?? null,
    placeId: `pid-${role}`,
    formattedAddress: address,
    latitude: 50,
    longitude: 19,
    sortOrder: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const v2Root = resolve(process.cwd(), 'src/features/weddings/detail/v2')

run('1. V1 remains unchanged extraction', () => {
  const v1 = readFileSync(
    resolve(process.cwd(), 'src/features/weddings/detail/v1/WeddingDetailV1.tsx'),
    'utf8',
  )
  assert(v1.includes('WeddingDetailHero'), 'v1 hero')
  assert(v1.includes('WeddingDetailWorkflow'), 'v1 workflow')
  assert(v1.includes('WeddingContractReadinessPanel'), 'v1 readiness')
})

run('2–4. Workspace header + tabs; default overview', () => {
  const shell = readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8')
  const header = readFileSync(resolve(v2Root, 'WeddingWorkspaceHeader.tsx'), 'utf8')
  const tabs = readFileSync(resolve(v2Root, 'WeddingWorkspaceTabs.tsx'), 'utf8')
  assert(header.includes('data-testid="wedding-workspace-header"'), 'header')
  assert(tabs.includes('data-testid="wedding-workspace-tabs"'), 'tabs')
  assert(shell.includes('WeddingWorkspaceTabs'), 'tabs wired')
  assertEq(parseWorkspaceTab(null), 'overview', 'default tab')
  assertEq(parseWorkspaceTab('nope'), 'overview', 'invalid tab')
  assertEq(WORKSPACE_TABS[0].id, 'overview', 'first tab')
  assertEq(WEDDING_DETAIL_V2_TAB_KEY, 'ourwed:wedding-detail-v2-tab', 'tab key')
})

run('5. Tab switch does not refetch wedding', () => {
  const shell = readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8')
  assert(!shell.includes('useWedding('), 'no wedding hook')
  assert(!shell.includes("queryKey: ['weddings'"), 'no weddings query')
  const page = readFileSync(
    resolve(process.cwd(), 'src/pages/WeddingDetailPage.tsx'),
    'utf8',
  )
  assert(page.includes('useWedding(id'), 'page owns wedding query')
})

run('6–9. Header reception only; no prep/ceremony', () => {
  const header = readFileSync(resolve(v2Root, 'WeddingWorkspaceHeader.tsx'), 'utf8')
  assert(header.includes('getReceptionDisplayName'), 'reception')
  assert(!header.includes('bridePreparation'), 'no bride')
  assert(!header.includes('groomPreparation'), 'no groom')
  assert(!header.includes('ceremonyLocation'), 'no ceremony')
  assert(!header.includes('Przygotowania'), 'no prep labels')
  assert(!header.includes("'Ceremonia'"), 'no ceremony label')
  const wedding = stubWedding()
  const places = [
    place('reception', 'Lwowska 34, Izdebnik', 'Villa Love'),
    place('bride_preparation', 'Zabrze'),
    place('ceremony', 'Kościół'),
  ]
  assertEq(getReceptionDisplayName(wedding, places), 'Villa Love', 'label')
  assertEq(
    getCoupleDisplayName(wedding.couple),
    'Iza Karczewska & Jan Kulewski',
    'names',
  )
})

run('10–11. Overview next action + unresolved readiness only', () => {
  const overview = readFileSync(
    resolve(v2Root, 'WeddingOverviewWorkspace.tsx'),
    'utf8',
  )
  assert(overview.includes('WeddingNextAction'), 'next action')
  assert(overview.includes('WeddingIssuesSummary'), 'issues')
  const issues = readFileSync(resolve(v2Root, 'WeddingIssuesSummary.tsx'), 'utf8')
  assert(issues.includes('missing'), 'missing items')
  const readiness = evaluateWeddingContractReadiness(stubWedding(), null)
  const missing = getMissingReadinessItems(readiness)
  assert(missing.every((m) => m.status === 'missing'), 'only missing')
  assert(getNextAction(stubWedding(), readiness).title.length > 0, 'next title')
})

run('12. Full readiness in Contract and Finance', () => {
  const src = readFileSync(
    resolve(v2Root, 'WeddingContractFinanceWorkspace.tsx'),
    'utf8',
  )
  assert(src.includes('Gotowość umowy'), 'title')
  assert(src.includes('getReadinessGroups'), 'groups')
  assert(src.includes('data-testid="wedding-contract-finance"'), 'testid')
})

run('13–16. Wedding Day itinerary + map + nav; no duplicate locations card', () => {
  const day = readFileSync(resolve(v2Root, 'WeddingDayWorkspace.tsx'), 'utf8')
  assert(day.includes('data-testid="wedding-itinerary"'), 'itinerary')
  assert(day.includes('TravelMap'), 'map')
  assert(day.includes('buildGoogleMapsNavigationUrl'), 'nav')
  assert(day.includes('travel-nav-'), 'nav testids')
  assert(!day.includes('Lokalizacje'), 'no separate locations card title')
  const items = getWeddingLocationItems(stubWedding(), [
    place('bride_preparation', 'A'),
    place('groom_preparation', 'B'),
    place('ceremony', 'C'),
    place('reception', 'D'),
  ])
  assertEq(items.length, 4, 'four stops')
})

run('17–18. Commercial + payment math unchanged', () => {
  const wedding = stubWedding()
  const summary = getWeddingCommercialSummary(wedding)
  assertEq(summary.contractValue, 9500, 'value')
  assertEq(summary.remainingToPay, 9500, 'remaining')
  assertEq(formatCurrency(summary.contractValue), '9 500 zł', 'fmt')
  const finance = readFileSync(
    resolve(v2Root, 'WeddingContractFinanceWorkspace.tsx'),
    'utf8',
  )
  assert(finance.includes('getPackageSummary'), 'package summary')
  assert(finance.includes('Dodaj wpłatę'), 'payment action')
})

run('19. Activity feed combines without mutating source', () => {
  const wedding = stubWedding()
  const notes = [...wedding.notes]
  const feed = buildActivityFeed({
    timeline: wedding.timeline,
    notes: wedding.notes,
    tasks: [],
    wedding,
  })
  assert(feed.length >= 2, 'feed items')
  assertEq(wedding.notes.length, notes.length, 'notes untouched')
  assertEq(wedding.notes[0].content, notes[0].content, 'content same')
})

run('20. Danger zone collapsed by default', () => {
  const src = readFileSync(
    resolve(v2Root, 'WeddingManagementSection.tsx'),
    'utf8',
  )
  assert(src.includes('useState(false)'), 'collapsed')
  assert(src.includes('Zarządzanie zleceniem'), 'label')
  assert(src.includes('aria-expanded'), 'a11y')
})

run('21. Mobile CSS present; no card-grid composition', () => {
  const css = readFileSync(resolve(v2Root, 'WeddingDetailV2.module.css'), 'utf8')
  assert(css.includes('@media (max-width: 767px)'), 'mobile')
  assert(css.includes('commandHeader'), 'command header')
  assert(css.includes('tabsBar'), 'tabs')
  assert(css.includes('contextSidebar'), 'sidebar')
  assert(css.includes('position: sticky'), 'sticky')
  const shell = readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8')
  assert(!shell.includes('WeddingMetricsV2'), 'no old metrics')
  assert(!shell.includes('WeddingHeroV2'), 'no old hero')
  assert(shell.includes('WeddingWorkspaceHeader'), 'new header')
})

run('22. Rejected card-grid files deleted', () => {
  const dead = [
    'WeddingHeroV2.tsx',
    'WeddingMetricsV2.tsx',
    'WeddingPrimaryActionsV2.tsx',
    'WeddingTravelV2.tsx',
    'WeddingLocationsV2.tsx',
    'WeddingContactV2.tsx',
    'WeddingPackageV2.tsx',
  ]
  for (const file of dead) {
    try {
      readFileSync(resolve(v2Root, file), 'utf8')
      throw new Error(`${file} should be deleted`)
    } catch (err) {
      if (err instanceof Error && err.message.includes('should be deleted')) {
        throw err
      }
    }
  }
})

run('23. Overview band exists', () => {
  const band = readFileSync(resolve(v2Root, 'WeddingOverviewBand.tsx'), 'utf8')
  assert(band.includes('Gotowość umowy'), 'readiness cell')
  assert(band.includes('Wartość umowy'), 'value')
})

console.log('\nwedding workspace v2: done')
