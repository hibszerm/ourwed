/**
 * Wedding Workspace V2 — structural redesign acceptance (not card-grid V2).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildActivityFeed,
  getAssignmentStatusItems,
  getContactSections,
  getCoupleDisplayName,
  getHeaderStatusBadges,
  getReceptionDisplayName,
  getWeddingLocationItems,
  parseWorkspaceTab,
  WORKSPACE_TABS,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { WEDDING_DETAIL_V2_TAB_KEY } from '@/features/weddings/detail/v2/weddingDetailV2Types'
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

run('1. Canonical Wedding Details is V2 only (no V1 shell)', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'src/pages/WeddingDetailPage.tsx'),
    'utf8',
  )
  assert(page.includes('WeddingDetailV2'), 'v2 mounted')
  assert(!page.includes('WeddingDetailV1'), 'no v1')
  assert(!page.includes('WeddingDetailViewSwitch'), 'no switch')
  assert(!page.includes('useWeddingDetailViewMode'), 'no view mode hook')
  assert(!page.includes('Edytuj ślub'), 'no header edit button')
  try {
    readFileSync(
      resolve(process.cwd(), 'src/features/weddings/detail/v1/WeddingDetailV1.tsx'),
      'utf8',
    )
    throw new Error('WeddingDetailV1.tsx should be deleted')
  } catch (err) {
    if (err instanceof Error && err.message.includes('should be deleted')) {
      throw err
    }
  }
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

run('6–9. Header reception venue + locality; no prep/ceremony preference', () => {
  const header = readFileSync(resolve(v2Root, 'WeddingWorkspaceHeader.tsx'), 'utf8')
  assert(header.includes('getWeddingPrimaryLocationSummary'), 'primary location')
  assert(!header.includes('bridePreparation'), 'no bride')
  assert(!header.includes('groomPreparation'), 'no groom')
  assert(!header.includes('ceremonyLocation'), 'no ceremony')
  assert(!header.includes('Przygotowania'), 'no prep labels')
  assert(!header.includes("'Ceremonia'"), 'no ceremony label')
  const wedding = stubWedding()
  const places = [
    place('reception', 'Lwowska 78, 34-144 Izdebnik', 'Villa Love'),
    place('bride_preparation', 'Zabrze'),
    place('ceremony', 'Kościół'),
  ]
  assertEq(
    getReceptionDisplayName(wedding, places),
    'Villa Love, Izdebnik',
    'reception compact',
  )
  assertEq(
    getCoupleDisplayName(wedding.couple),
    'Iza Karczewska i Jan Kulewski',
    'names',
  )
})

run('10–11. Overview shows assignment status + current-state panels (no timeline)', () => {
  const overview = readFileSync(
    resolve(v2Root, 'WeddingOverviewWorkspace.tsx'),
    'utf8',
  )
  assert(overview.includes('WeddingAssignmentStatus'), 'assignment status')
  assert(overview.includes('WeddingOverviewCurrentState'), 'current state')
  assert(!overview.includes('WeddingMilestoneRail'), 'no milestone rail')
  assert(!overview.includes('WeddingRecentActivity'), 'no recent activity')
  assert(!overview.includes('Przebieg'), 'no przebieg')
  assert(!overview.includes('Ostatnia aktywność'), 'no recent activity copy')
  assert(!overview.includes('WeddingNextAction'), 'no next action')
  assert(!overview.includes('WeddingIssuesSummary'), 'no issues')
  assert(!overview.includes('Gotowość umowy'), 'no readiness title')
  assert(!overview.includes('Do uzupełnienia'), 'no unresolved block')

  const status = readFileSync(
    resolve(v2Root, 'WeddingAssignmentStatus.tsx'),
    'utf8',
  )
  assert(status.includes('Stan zlecenia'), 'status title')
  assert(status.includes('getAssignmentStatusItems'), 'selector')

  const current = readFileSync(
    resolve(v2Root, 'WeddingOverviewCurrentState.tsx'),
    'utf8',
  )
  assert(current.includes('overview-questionnaire'), 'questionnaire panel')
  assert(current.includes('overview-tasks'), 'tasks panel')
  assert(current.includes('overview-notes'), 'notes panel')
  assert(current.includes('Dodaj notatkę'), 'add note')
  assert(current.includes('Edytuj notatki'), 'edit notes')
  assert(current.includes('Edytuj zadania'), 'edit tasks')
  assert(current.includes('Wyślij ankietę'), 'send questionnaire')

  const items = getAssignmentStatusItems(stubWedding(), [
    place('reception', 'Lwowska 78, 34-144 Izdebnik', 'Villa Love'),
  ])
  assert(
    items.some((i) => i.id === 'contract'),
    'contract item',
  )
  assert(
    items.some((i) => i.id === 'deposit' && i.tone === 'warn'),
    'deposit pending',
  )
  assert(
    items.some((i) => i.id === 'locations' && i.tone === 'ok'),
    'locations ok',
  )
  assert(
    items.some((i) => i.id === 'package' && i.tone === 'ok'),
    'package ok',
  )
})

run('10b. History tab is a pure chronological event log', () => {
  assertEq(
    WORKSPACE_TABS.find((t) => t.id === 'activity')?.label,
    'Historia',
    'tab label',
  )
  assert(!WORKSPACE_TABS.some((t) => t.label === 'Aktywność'), 'no old label')
  const shell = readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8')
  assert(shell.includes('WeddingActivityWorkspace'), 'history workspace')
  assert(
    !shell.includes('onOpenActivityTab'),
    'overview does not deep-link activity',
  )
  assert(
    shell.includes('WeddingOverviewCurrentState') ||
      shell.includes('onAddNote={onAddNote}'),
    'note actions on overview wiring',
  )

  const activity = readFileSync(
    resolve(v2Root, 'WeddingActivityWorkspace.tsx'),
    'utf8',
  )
  assert(activity.includes('history-filters'), 'filters')
  assert(activity.includes('history-event-list'), 'event list')
  assert(activity.includes('Wszystko'), 'filter all')
  assert(activity.includes('Notatki'), 'filter notes')
  assert(activity.includes('Zadania'), 'filter tasks')
  assert(activity.includes('Ankiety'), 'filter questionnaires')
  assert(activity.includes('Zmiany systemowe'), 'filter system')
  assert(!activity.includes('Dodaj notatkę'), 'no add note')
  assert(!activity.includes('Edytuj notatki'), 'no edit notes')
  assert(!activity.includes('Edytuj zadania'), 'no edit tasks')
  assert(!activity.includes('Wyślij ankietę'), 'no send questionnaire')
  assert(!activity.includes('activitySummaries'), 'no summaries')
  assert(!activity.includes('Ankieta do umowy'), 'no questionnaire summary')
  assert(!activity.includes('Brak zadań'), 'no task summary')
  assert(!activity.includes('onAddNote'), 'no note prop')
  assert(!activity.includes('onEditTasks'), 'no task prop')
  assert(!activity.includes('onSendQuestionnaire'), 'no questionnaire prop')
})


run('10c. Header exposes compact status badges', () => {
  const header = readFileSync(resolve(v2Root, 'WeddingWorkspaceHeader.tsx'), 'utf8')
  assert(header.includes('getHeaderStatusBadges'), 'badges selector')
  assert(header.includes('wedding-header-status-badges'), 'testid')
  const badges = getHeaderStatusBadges(
    stubWedding({ contract: { status: 'signed' } }),
  )
  assert(
    badges.some((b) => b.label === 'Umowa podpisana'),
    'signed badge',
  )
  assert(
    badges.some((b) => b.label === 'Zaliczka oczekuje'),
    'deposit badge',
  )
})

run('10d. Sidebar order Location → Couple → Finance → Package + address', () => {
  const sidebar = readFileSync(
    resolve(v2Root, 'WeddingContextSidebar.tsx'),
    'utf8',
  )
  const loc = sidebar.indexOf('data-testid="sidebar-location"')
  const couple = sidebar.indexOf('data-testid="sidebar-couple"')
  const finance = sidebar.indexOf('data-testid="sidebar-finance"')
  const pkg = sidebar.indexOf('data-testid="sidebar-package"')
  assert(loc >= 0 && couple > loc, 'couple after location')
  assert(finance > couple, 'finance after couple')
  assert(pkg > finance, 'package after finance')
  assert(sidebar.includes('Para'), 'couple title')
  assert(sidebar.includes('sidebar-contract-address'), 'address testid')
  assert(sidebar.includes('p.address'), 'renders address')

  const sections = getContactSections(
    stubWedding({
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
        partner1Address: 'Grabowa 8A',
        partner1PostalCode: '44-100',
        partner1City: 'Gliwice',
      },
    }).couple,
  )
  assert(Boolean(sections[0].address), 'bride address present')
  assert(
    sections[0].address!.includes('Gliwice') ||
      sections[0].address!.includes('Grabowa'),
    'address content',
  )
})

run('10e. Contracts module shows latest first; older behind history toggle', () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/components/detail/WeddingContractsModule.tsx',
    ),
    'utf8',
  )
  assert(src.includes('Aktualna umowa'), 'current title')
  assert(src.includes('Historia wersji'), 'history control')
  assert(src.includes('wedding-current-contract'), 'current testid')
  assert(src.includes('wedding-version-history-toggle'), 'toggle')
  assert(src.includes('historyOpen'), 'collapsed by default')
  assert(src.includes('older.map'), 'older only in history')
})

run('12. Contract and Finance is commercial (no readiness checklist)', () => {
  const src = readFileSync(
    resolve(v2Root, 'WeddingContractFinanceWorkspace.tsx'),
    'utf8',
  )
  assert(!src.includes('Gotowość umowy'), 'no readiness title')
  assert(!src.includes('getReadinessGroups'), 'no groups')
  assert(src.includes('data-testid="wedding-contract-finance"'), 'testid')
  assert(src.includes('Pakiet i usługi'), 'package')
  assert(src.includes('Płatności'), 'payments')
  assert(src.includes('contract-finance-contracts'), 'contracts group')
  assert(src.includes('contract-finance-finance'), 'finance group')
  assert(src.includes('contract-finance-package'), 'package group')
  const contractsIdx = src.indexOf('contract-finance-contracts')
  const financeIdx = src.indexOf('contract-finance-finance')
  const packageIdx = src.indexOf('contract-finance-package')
  assert(contractsIdx >= 0 && financeIdx > contractsIdx, 'finance after contracts')
  assert(packageIdx > financeIdx, 'package after finance')
  assert(
    src.includes('Umowa nie została jeszcze wygenerowana'),
    'lifecycle status',
  )
})

run('13–16. Wedding Day itinerary + map + nav; no duplicate locations card', () => {
  const day = readFileSync(resolve(v2Root, 'WeddingDayWorkspace.tsx'), 'utf8')
  assert(day.includes('data-testid="wedding-itinerary"'), 'itinerary')
  assert(day.includes('data-testid="travel-base-stop"'), 'base stop')
  assert(day.includes('TRAVEL_SETTINGS_PATH'), 'settings link')
  assert(day.includes('TravelMap'), 'map')
  assert(day.includes('buildGoogleMapsNavigationUrl'), 'nav')
  assert(day.includes('travel-nav-'), 'nav testids')
  assert(day.includes('itineraryLegRoute'), 'leg origin→destination')
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

run('20. Danger zone collapsed; edit action in management', () => {
  const src = readFileSync(
    resolve(v2Root, 'WeddingManagementSection.tsx'),
    'utf8',
  )
  assert(src.includes('useState(false)'), 'danger collapsed')
  assert(src.includes('Zarządzanie zleceniem'), 'label')
  assert(src.includes('Edytuj dane ślubu'), 'edit action')
  assert(src.includes('wedding-edit-from-management'), 'edit testid')
  assert(src.includes('aria-expanded'), 'a11y')
})

run('20b. Header has no operational command buttons', () => {
  const header = readFileSync(resolve(v2Root, 'WeddingWorkspaceHeader.tsx'), 'utf8')
  assert(!header.includes('Generuj umowę'), 'no generate')
  assert(!header.includes('Dodaj wpłatę'), 'no payment')
  assert(!header.includes('Więcej'), 'no more menu')
  assert(!header.includes('onAction'), 'no hero actions')
})

run('20c. Generate / payment live in Contract & Finance', () => {
  const contracts = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/components/detail/WeddingContractsModule.tsx',
    ),
    'utf8',
  )
  assert(contracts.includes('contracts-generate'), 'generate testid')
  const finance = readFileSync(
    resolve(v2Root, 'WeddingContractFinanceWorkspace.tsx'),
    'utf8',
  )
  assert(finance.includes('finance-add-payment'), 'payment testid')
})

run('20d. Correspondence block shows all entries in Para sidebar', () => {
  const sidebar = readFileSync(
    resolve(v2Root, 'WeddingContextSidebar.tsx'),
    'utf8',
  )
  assert(sidebar.includes('WeddingCorrespondenceBlock'), 'block')
  assert(sidebar.includes('sidebar-correspondence') || sidebar.includes('WeddingCorrespondenceBlock'), 'wired')
  const block = readFileSync(
    resolve(v2Root, 'WeddingCorrespondenceBlock.tsx'),
    'utf8',
  )
  assert(block.includes('sidebar-correspondence-entry'), 'per-entry')
  assert(block.includes('Nie ustawiono'), 'empty state')
  assert(!block.includes('correspondence[0]'), 'no first-only')
  const fields = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/editing/fields/CorrespondenceFields.tsx',
    ),
    'utf8',
  )
  assert(fields.includes('correspondence-add'), 'add row')
  assert(fields.includes('correspondence-remove'), 'remove row')
  assert(fields.includes('Dodaj kanał kontaktu'), 'add label')
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

run('23. Overview band is commercial / stage summary (no readiness cell)', () => {
  const band = readFileSync(resolve(v2Root, 'WeddingOverviewBand.tsx'), 'utf8')
  assert(!band.includes('Gotowość umowy'), 'no readiness cell')
  assert(band.includes('Wartość umowy'), 'value')
  assert(band.includes('Aktualny etap'), 'stage')
})

console.log('\nwedding workspace v2: done')
