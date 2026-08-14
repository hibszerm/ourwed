/**
 * Wedding Workspace V2 — structural redesign acceptance (not card-grid V2).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildActivityFeed,
  getContactSections,
  getCoupleDisplayName,
  getHeaderStatusBadges,
  getReceptionDisplayName,
  getWeddingLocationItems,
  parseWorkspaceTab,
  WORKSPACE_TABS,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { buildWeddingProgressSummary } from '@/features/weddings/detail/v2/buildWeddingProgressSummary'
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
  const page = readFileSync(
    resolve(process.cwd(), 'src/pages/WeddingDetailPage.tsx'),
    'utf8',
  )
  assert(header.includes('data-testid="wedding-workspace-header"'), 'header')
  assert(tabs.includes('data-testid="wedding-workspace-tabs"'), 'tabs')
  assert(shell.includes('WeddingWorkspaceTabs'), 'tabs wired')
  assertEq(parseWorkspaceTab(null), 'overview', 'default tab')
  assertEq(parseWorkspaceTab('nope'), 'overview', 'invalid tab')
  assertEq(WORKSPACE_TABS[0].id, 'overview', 'first tab')
  // No cross-wedding tab persistence
  assert(!shell.includes('localStorage.getItem'), 'no tab localStorage read')
  assert(!shell.includes('localStorage.setItem'), 'no tab localStorage write')
  assert(!shell.includes('WEDDING_DETAIL_V2_TAB_KEY'), 'no global tab key usage')
  assert(shell.includes("return 'overview'"), 'defaults to overview')
  assert(shell.includes('searchParams.get(\'tab\')'), 'honors ?tab=')
  assert(page.includes('key={wedding.id}'), 'remount per wedding id')
})

run('5. Tab switch does not refetch wedding', () => {
  const shell = readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8')
  assert(!shell.includes('useWedding('), 'no wedding hook')
  assert(!shell.includes("queryFn: () => weddingService"), 'no wedding fetch in shell')
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

run('10–11. Overview shows Postęp zlecenia + full-width essentials (no sidebar)', () => {
  const overview = readFileSync(
    resolve(v2Root, 'WeddingOverviewWorkspace.tsx'),
    'utf8',
  )
  assert(overview.includes('WeddingProgressCard'), 'progress card')
  assert(overview.includes('WeddingOverviewEssentials'), 'essentials grid')
  assert(overview.includes('WeddingOverviewAttention'), 'optional attention')
  assert(!overview.includes('WeddingOverviewCurrentState'), 'no current-state cards')
  assert(!overview.includes('WeddingOverviewRecentActivity'), 'no recent activity')
  assert(!overview.includes('Ostatnia aktywność'), 'no activity title')
  assert(!overview.includes('WeddingMilestoneRail'), 'no milestone rail')
  assert(!overview.includes('WeddingAssignmentStatus'), 'no legacy status name')
  assert(!overview.includes('WeddingNextAction'), 'no next action')
  assert(!overview.includes('WeddingIssuesSummary'), 'no issues')
  assert(!overview.includes('Gotowość umowy'), 'no readiness title')

  const shell = readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8')
  assert(!shell.includes('WeddingContextSidebar'), 'sidebar removed from shell')
  assert(!shell.includes('WeddingManagementSection'), 'management removed from shell')
  assert(!shell.includes('overviewLayout'), 'no sidebar layout wrapper')
  assert(shell.includes('WeddingHeaderActions') || shell.includes('WeddingWorkspaceHeader'), 'header actions path')

  const progress = readFileSync(
    resolve(v2Root, 'WeddingProgressCard.tsx'),
    'utf8',
  )
  assert(progress.includes('Postęp zlecenia'), 'progress title')
  assert(progress.includes('buildWeddingProgressSummary'), 'selector')
  assert(!progress.includes('bez ręcznego ustawiania'), 'no intro copy')
  assert(!progress.includes('Przejdź do płatności'), 'no payment CTA')
  assert(!progress.includes("'Ukończone'"), 'no complete badge label')
  assert(progress.includes('activeToneLabel'), 'active badges only')
  assert(!progress.includes('type="checkbox"'), 'no manual toggles')

  const essentials = readFileSync(
    resolve(v2Root, 'WeddingOverviewEssentials.tsx'),
    'utf8',
  )
  assert(essentials.includes('overview-locations-card'), 'locations')
  assert(essentials.includes('overview-contact-card'), 'contact')
  assert(essentials.includes('overview-package-card'), 'package')
  assert(essentials.includes('overview-calendars-card'), 'calendars')
  assert(essentials.includes('essentialsGrid'), 'grid class')
  assert(essentials.includes('overview-contact-channels'), 'channels block')
  assert(essentials.includes('Zarządzaj integracjami'), 'calendar manage link')
  assert(
    !essentials.includes('Otwórz w Google Calendar'),
    'no open google on overview',
  )
  assert(!essentials.includes('overview-finance-link'), 'no finance CTA card')
  assert(!essentials.includes('Przejdź do płatności'), 'no finance CTA copy')

  const summary = buildWeddingProgressSummary(stubWedding(), [
    place('reception', 'Lwowska 78, 34-144 Izdebnik', 'Villa Love'),
  ])
  assertEq(summary.groups.length, 2, 'two domains only')
  assert(
    summary.groups.some((g) => g.id === 'contract'),
    'contract group',
  )
  assert(
    summary.groups.some((g) => g.id === 'preparation'),
    'preparation group',
  )
  assert(
    !summary.groups.map((g) => g.id as string).includes('payments'),
    'no payments group',
  )
  assert(
    summary.primaryAction == null ||
      (summary.primaryAction.id as string) !== 'open_finance',
    'no finance primary action',
  )
})

run('10a. Progress summary derives from canonical data only', () => {
  const signed = buildWeddingProgressSummary(
    stubWedding({
      contract: { status: 'signed' },
      questionnaires: {
        contractData: { status: 'completed', completedAt: '2026-06-01' },
        weddingQuestionnaire: { status: 'completed' },
      },
      payments: [
        {
          id: 'p1',
          label: 'Zaliczka',
          amount: 1000,
          type: 'deposit',
          paid: true,
          paidAt: '2026-06-01',
        },
      ],
    }),
    [
      place('ceremony', 'Kościół'),
      place('reception', 'Villa Love'),
    ],
  )
  const contract = signed.groups.find((g) => g.id === 'contract')!
  assert(
    contract.items.some(
      (i) => i.id === 'contract-signed' && i.tone === 'complete',
    ),
    'signed complete',
  )
  assert(
    !signed.groups.some((g) =>
      g.items.some((i) => i.label.toLowerCase().includes('toggle')),
    ),
    'no manual controls',
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
    shell.includes("setTab('activity')") || shell.includes("tab === 'activity'"),
    'history tab wiring',
  )
  assert(
    !shell.includes('WeddingOverviewCurrentState') &&
      !shell.includes('onAddNote={onAddNote}'),
    'notes/tasks not on overview',
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


run('10c. Header exposes entity + business badges only', () => {
  const header = readFileSync(resolve(v2Root, 'WeddingWorkspaceHeader.tsx'), 'utf8')
  assert(header.includes('getHeaderStatusBadges'), 'badges selector')
  assert(header.includes('wedding-header-status-badges'), 'testid')
  assert(!header.includes('WorkflowBadge'), 'no workflow stage badge')
  const signed = getHeaderStatusBadges(
    stubWedding({ contract: { status: 'signed' } }),
  )
  assertEq(signed.length, 2, 'two badges')
  assert(signed.some((b) => b.id === 'entity' && b.label === 'Ślub'), 'entity')
  assert(signed.some((b) => b.id === 'business' && b.label === 'Umowa'), 'signed')
  const waiting = getHeaderStatusBadges(
    stubWedding({ contract: { status: 'generated' } }),
  )
  assert(waiting.some((b) => b.label === 'Oczekuje'), 'waiting')
  const fresh = getHeaderStatusBadges(
    stubWedding({ contract: { status: 'none' } }),
  )
  assert(fresh.some((b) => b.label === 'Nowe'), 'new')
  assert(!signed.some((b) => b.label === 'Umowa podpisana'), 'no long signed label')
  assert(!signed.some((b) => b.id === 'countdown'), 'countdown not a badge')
  assert(!signed.some((b) => b.id === 'deposit'), 'no deposit badge')
})

run('10d. Overview essentials replace sidebar (locations, contact, package)', () => {
  const essentials = readFileSync(
    resolve(v2Root, 'WeddingOverviewEssentials.tsx'),
    'utf8',
  )
  assert(essentials.includes('Lokalizacje'), 'locations title')
  assert(essentials.includes('Para i kontakt'), 'couple title')
  assert(essentials.includes('Edytuj dane pary'), 'edit couple')
  assert(essentials.includes('Pokaż szczegóły'), 'package details')
  assert(essentials.includes('Edytuj pakiet'), 'edit package')
  assert(essentials.includes('getCorrespondenceDisplay'), 'channels use safe display')
  assert(essentials.includes('overview-contact-channels'), 'channels when populated')
  assert(!essentials.includes('sidebar-contract-address'), 'no contract address dump')
  assert(!essentials.includes('Otwórz w Google Calendar'), 'no google open link')

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
  assert(Boolean(sections[0].address), 'bride address still in selector')
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

run('12. Contract and Finance is commercial + collapsible questionnaire', () => {
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
  assert(
    src.includes('WeddingContractQuestionnaireSection'),
    'questionnaire section',
  )
  const contractsIdx = src.indexOf('contract-finance-contracts')
  const financeIdx = src.indexOf('contract-finance-finance')
  const packageIdx = src.indexOf('contract-finance-package')
  assert(contractsIdx >= 0 && financeIdx > contractsIdx, 'finance after contracts')
  assert(packageIdx > financeIdx, 'package after finance')
  assert(
    src.includes('Umowa nie została jeszcze wygenerowana'),
    'lifecycle status',
  )

  const qSection = readFileSync(
    resolve(v2Root, 'WeddingContractQuestionnaireSection.tsx'),
    'utf8',
  )
  assert(qSection.includes('Dane z ankiety do umowy'), 'title')
  assert(qSection.includes('useState(false)'), 'collapsed by default')
  assert(qSection.includes('aria-expanded'), 'a11y')
  assert(qSection.includes('Rozwiń dane'), 'expand label')
  assert(qSection.includes('WeddingContractQuestionnaireAnswers'), 'answers')
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
  assert(finance.includes('hasPaidDepositPayment'), 'contextual payment CTA')
  assert(finance.includes('Dodaj zadatek'), 'deposit CTA')
  assert(finance.includes('Dodaj wpłatę'), 'payment CTA')
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

run('20. Admin actions live in header menu (not Overview footer)', () => {
  const header = readFileSync(resolve(v2Root, 'WeddingWorkspaceHeader.tsx'), 'utf8')
  assert(header.includes('WeddingHeaderActions'), 'header actions')
  const actions = readFileSync(resolve(v2Root, 'WeddingHeaderActions.tsx'), 'utf8')
  assert(actions.includes('Tryb dnia ślubu'), 'day mode in menu')
  assert(actions.includes('wedding-menu-day-cockpit'), 'day mode test id')
  assert(actions.includes('/dzien-slubu'), 'day mode route')
  assert(actions.includes('Edytuj nazwę i datę'), 'identity edit')
  assert(actions.includes('Pobierz brief PDF'), 'brief')
  assert(actions.includes('Archiwizuj zlecenie'), 'archive')
  assert(actions.includes('Usuń zlecenie'), 'delete')
  assert(actions.includes('WeddingIdentityEditDialog'), 'identity dialog')
  const shell = readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8')
  assert(!shell.includes('WeddingManagementSection'), 'no management section')
  assert(!shell.includes('Zarządzanie zleceniem'), 'no management title')
  const css = readFileSync(resolve(v2Root, 'WeddingDetailV2.module.css'), 'utf8')
  assert(css.includes('.cockpitEntry'), 'desktop CTA class')
  assert(
    css.includes('max-width: 767px') &&
      css.includes('.cockpitEntry') &&
      css.includes('display: none'),
    'mobile hides standalone Day Mode CTA',
  )
  assert(header.includes('Otwórz tryb dnia ślubu'), 'desktop CTA copy kept')
  assert(header.includes('open-wedding-day-cockpit'), 'desktop CTA test id')
})

run('20b. Header has no contract/payment command buttons', () => {
  const header = readFileSync(resolve(v2Root, 'WeddingWorkspaceHeader.tsx'), 'utf8')
  assert(!header.includes('Generuj umowę'), 'no generate')
  assert(!header.includes('Dodaj wpłatę'), 'no payment')
  assert(!header.includes('onAction'), 'no hero actions')
  assert(header.includes('WeddingHeaderActions'), 'overflow menu present')
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
  assert(contracts.includes('WeddingContractSignedControls'), 'signed controls')
  const finance = readFileSync(
    resolve(v2Root, 'WeddingContractFinanceWorkspace.tsx'),
    'utf8',
  )
  assert(finance.includes('finance-add-payment'), 'payment testid')
})

run('20d. Correspondence editor remains; Overview renders populated channels', () => {
  const essentials = readFileSync(
    resolve(v2Root, 'WeddingOverviewEssentials.tsx'),
    'utf8',
  )
  assert(essentials.includes('getCorrespondenceDisplay'), 'safe display')
  assert(essentials.includes('CORRESPONDENCE_CHANNEL_LABELS'), 'labels')
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

run('21. Mobile CSS present; full-width overview grid', () => {
  const css = readFileSync(resolve(v2Root, 'WeddingDetailV2.module.css'), 'utf8')
  assert(css.includes('@media (max-width: 767px)'), 'mobile')
  assert(css.includes('commandHeader'), 'command header')
  assert(css.includes('tabsBar'), 'tabs')
  assert(css.includes('essentialsGrid'), 'essentials grid')
  assert(css.includes('progressGroups'), 'progress groups')
  const shell = readFileSync(resolve(v2Root, 'WeddingDetailV2.tsx'), 'utf8')
  assert(!shell.includes('WeddingMetricsV2'), 'no old metrics')
  assert(!shell.includes('WeddingHeroV2'), 'no old hero')
  assert(!shell.includes('WeddingContextSidebar'), 'no sidebar in shell')
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

run('23. Overview band is commercial summary only (no stage cell)', () => {
  const band = readFileSync(resolve(v2Root, 'WeddingOverviewBand.tsx'), 'utf8')
  assert(!band.includes('Gotowość umowy'), 'no readiness cell')
  assert(!band.includes('Aktualny etap'), 'no stage cell')
  assert(band.includes('Wartość umowy'), 'value')
  assert(band.includes('Wpłacono'), 'paid')
  assert(band.includes('Pozostało'), 'remaining')
  assert(band.includes('Termin płatności'), 'due')
})

console.log('\nwedding workspace v2: done')
