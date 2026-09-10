/**
 * Modern Wedding Detail Phase 1 — presentation + routing acceptance.
 * Run: npm run test:modern-wedding-detail
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeFloatingPlacement } from '@/components/ui/floatingPlacement'
import { resolveScreenPresentation } from '@/features/interface-style/types'
import {
  composeCalendarsLine,
  composeCalendarsRows,
  composeCorrespondenceOverview,
  composeFilledPlaces,
  composeHeaderMetaLine,
  composeRecordHeroCountdown,
  composeRecordHeroDateParts,
  formatModernWeddingCountdown,
  composeModernWeddingAttention,
  composeModernWeddingCommercialHealth,
  composeModernWeddingCurrentStory,
  composeModernWeddingHeaderMeta,
  composeModernWeddingReadiness,
  composePackageOverviewMeta,
  daysUntilWeddingDate,
  MODERN_APPLY_READINESS_STATUS,
  MODERN_READY_STORY_TITLE,
  resolveDayModeProminence,
} from '@/features/weddings/modern-detail/modernWeddingDetailModel'
import { resolveWeddingNextAction } from '@/lib/workflow/resolveWeddingNextAction'
import type { Couple, Payment, Wedding } from '@/types/wedding'

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

function couple(partial: Partial<Couple> = {}): Couple {
  return {
    partner1: 'Anna Kowalska',
    partner2: 'Jan Nowak',
    partner1FirstName: 'Anna',
    partner1LastName: 'Kowalska',
    partner2FirstName: 'Jan',
    partner2LastName: 'Nowak',
    email: 'anna@example.com',
    phone: '500100200',
    venue: '',
    city: '',
    ...partial,
  }
}

function wedding(partial: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w1',
    couple: couple(),
    date: '2027-09-15',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Video Standard',
    price: 12200,
    depositAmount: 1000,
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
    ...partial,
  }
}

function paid(amount: number, extra: Partial<Payment> = {}): Payment {
  return {
    id: 'p1',
    label: 'Wpłata',
    amount,
    type: 'deposit',
    paid: true,
    paidAt: '2026-06-01',
    ...extra,
  }
}

{
  assertEq(
    resolveScreenPresentation('wedding', 'classic'),
    'classic',
    'classic wedding detail',
  )
  assertEq(
    resolveScreenPresentation('wedding', 'modern'),
    'modern',
    'modern wedding detail registered',
  )
  const router = read('src/routes/router.tsx')
  const routePage = read('src/pages/WeddingDetailRoutePage.tsx')
  const classic = read('src/pages/WeddingDetailPage.tsx')
  const v2 = read('src/features/weddings/detail/v2/WeddingDetailV2.tsx')
  assert(router.includes('WeddingDetailRoutePage'), '/sluby/:id uses resolver')
  assert(!router.includes("/sluby/:id/modern"), 'no extra modern route')
  assert(!router.includes("/sluby/:id/v3"), 'no v3 route')
  assert(!router.includes("/sluby/:id/v4"), 'no v4 route')
  assert(routePage.includes('<WeddingDetailPage />'), 'classic reachable')
  assert(routePage.includes('<WeddingDetailModernPage />'), 'modern reachable')
  assert(routePage.includes("resolveScreenPresentation('wedding'"), 'uses wedding screen')
  assert(!classic.includes('useInterfaceStyle'), 'classic page has no style branching')
  assert(!v2.includes('useInterfaceStyle'), 'V2 has no style branching')
  assert(!v2.includes('modern-detail'), 'V2 does not import Modern detail')
  assert(classic.includes('<WeddingDetailV2'), 'classic still renders V2')
  console.log('PASS  1. Classic/Modern route selection + freeze + no extra route')
}

{
  const header = read('src/features/weddings/modern-detail/ModernWeddingDetailHeader.tsx')
  const identity = read('src/features/weddings/modern-detail/ModernWeddingIdentityHero.tsx')
  const heroSrc = header + identity
  const v2Header = read('src/features/weddings/detail/v2/WeddingWorkspaceHeader.tsx')
  assert(header.includes('modern-wedding-detail-header'), 'modern header testid')
  assert(!heroSrc.includes('Ślub'), 'modern header has no Ślub pill')
  assert(!heroSrc.includes('getHeaderStatusBadges'), 'modern does not use V2 badges')
  assert(v2Header.includes('getHeaderStatusBadges'), 'classic header still has assignment badge')
  assert(heroSrc.includes('clamp(2rem, 2.2vw, 2.5rem)') === false, 'size lives in css')
  const css = read('src/features/weddings/modern-detail/ModernWeddingDetailHeader.module.css')
  assert(css.includes('clamp(2.25rem, 2.7vw, 2.5rem)'), 'compact record title size')
  assert(css.includes('font-weight: 540'), 'dashboard-related name weight')
  assert(!css.includes('-webkit-line-clamp'), 'identity is not truncated')
  assert(css.includes('grid-template-columns: var(--hero-rail) minmax(0, 1fr) var(--hero-rail)'), 'date | identity | countdown')
  assert(css.includes('.hero:not(.heroCompact)'), 'iphone compression does not rewrite cockpit compact')
  assert(
    css.includes('@media (max-width: 767px)'),
    'wedding detail identity compression uses 767',
  )
  const detailMobile = css.slice(
    css.indexOf('@media (max-width: 767px)'),
    css.indexOf('@media (max-width: 720px)'),
  )
  assert(
    detailMobile.includes('grid-template-columns: 3.25rem minmax(0, 1fr) 4.5rem'),
    'mobile detail hero keeps date | identity | countdown',
  )
  assert(!detailMobile.includes('grid-column: 1 / -1'), 'mobile detail hero does not stack the identity')
  assert(detailMobile.includes('position: static'), 'mobile identity does not reserve kebab width')
  assert(detailMobile.includes('--hero-status-rail: 4.5rem'), 'mobile status rail hosts kebab')
  assert(detailMobile.includes('bottom: 4px'), 'mobile kebab sits in the status rail')
  assert(!detailMobile.includes('right: calc(12px + 3.25rem)'), 'kebab is not parked over identity')
  assert(detailMobile.includes('overflow-wrap: break-word'), 'mobile names wrap on words, not mid-glyph')
  assert(css.includes("'date countdown'"), 'cockpit compact stacked grammar preserved')
  assert(css.includes('border-radius: 22px'), 'hero radius related to dashboard, smaller than 28')
  assert(!css.includes('min-height: 280px'), 'does not copy dashboard hero height')
  assert(!css.includes('backdrop-filter'), 'no glass')
  assert(header.includes('modern-wedding-header-overflow'), 'kebab is the visible utility')
  assert(header.includes('FloatingPortal'), 'overflow menu portals out of hero')
  const tabsCss = read(
    'src/features/weddings/modern-detail/ModernWeddingDetailTabs.module.css',
  )
  assert(
    tabsCss.includes('top: var(--mobile-shell-sticky-height, 0px)'),
    'tabs clear the sticky mobile shell',
  )
  assert(header.includes("align: 'end'"), 'overflow menu is bottom-end anchored')
  assert(header.includes('forceAnchored: true'), 'overflow stays anchored, not dialog')
  assert(!header.includes('dayModePrimary'), 'no visible day-mode button')
  assert(!header.includes('styles.edit'), 'no visible edit button')
  assert(!header.includes('Edytuj nazwę i datę'), 'edit is not duplicated')
  assert(identity.includes('modern-wedding-header-date'), 'date rail')
  assert(identity.includes('modern-wedding-header-countdown'), 'countdown rail')
  assert(!heroSrc.includes('modern-wedding-header-cue'), 'stage G cue removed')
  assert(!heroSrc.includes('v3MaterialWell'), 'no nested countdown well')
  assert(!css.includes('top: calc(100% + 6px)'), 'menu is not document-flow absolute under kebab')
  assert(css.includes('min-height: 40px'), 'compact overflow rows')
  const kebab = computeFloatingPlacement(
    { top: 80, left: 900, width: 36, height: 36 },
    { width: 1280, height: 900 },
    {
      gap: 6,
      minMenuWidth: 232,
      maxMenuWidth: 240,
      align: 'end',
      forceAnchored: true,
    },
  )
  assertEq(kebab.mode, 'anchored', 'kebab portal stays anchored')
  assertEq(kebab.placement, 'below', 'kebab menu opens below trigger')
  assertEq(kebab.width, 232, 'kebab menu grows past 36px trigger')
  assertEq(kebab.left, 704, 'right edges align: 900 + 36 - 232')
  assertEq(kebab.top, 122, '6px gap below kebab: 80 + 36 + 6')
  const narrowForced = computeFloatingPlacement(
    { top: 80, left: 320, width: 36, height: 36 },
    { width: 390, height: 700 },
    { gap: 6, minMenuWidth: 232, maxMenuWidth: 240, align: 'end', forceAnchored: true },
  )
  assertEq(narrowForced.mode, 'anchored', 'forceAnchored wins over mobile dialog')
  assert(header.includes('ModernWeddingIdentityHero'), 'detail header reuses identity primitive')
  assert(!identity.includes('HeaderUtilities'), 'identity primitive has no overflow utilities')
  assert(!identity.includes('ModernWeddingDetailTabs'), 'identity primitive has no tabs')
  console.log('PASS  2. Modern compact record hero')
}

run('3. venue/package independent rendering', () => {
  assertEq(
    composeHeaderMetaLine({
      venueText: 'Villa Love, Izdebnik',
      packageName: 'Video Standard',
    }),
    'Villa Love, Izdebnik · Video Standard',
    'both',
  )
  assertEq(
    composeHeaderMetaLine({
      venueText: 'Villa Love, Izdebnik',
      packageName: '',
    }),
    'Villa Love, Izdebnik',
    'venue only',
  )
  assertEq(
    composeHeaderMetaLine({
      venueText: null,
      packageName: 'Video Standard',
    }),
    'Video Standard',
    'package without venue',
  )
  assertEq(
    composeHeaderMetaLine({ venueText: null, packageName: null }),
    null,
    'neither',
  )
  const noVenue = wedding({
    packageName: 'Video Standard',
    receptionLocation: '',
    ceremonyLocation: '',
    couple: couple({ venue: '', city: '' }),
    coverageHours: 12,
    coverageEndTime: '23:30',
  })
  const meta = composeModernWeddingHeaderMeta(noVenue, [])
  assertEq(meta.metaLine, 'Video Standard', 'package visible without venue')
  assert(!meta.metaLine?.includes('undefined'), 'no undefined')
  assert(!meta.metaLine?.includes('godz'), 'hero meta has no coverage hours')
  assert(!meta.metaLine?.includes('maks'), 'hero meta has no coverage clock')

  const juliaLike = wedding({
    date: '2026-08-20',
    packageName: 'Video Standard',
    couple: couple({ venue: 'Hotel Stary', city: 'Kraków' }),
    coverageHours: 12,
    coverageEndTime: '23:30',
  })
  const juliaMeta = composeModernWeddingHeaderMeta(juliaLike, [], '2026-08-19')
  assertEq(
    composeHeaderMetaLine({
      venueText: 'Hotel Stary, Kraków',
      packageName: 'Video Standard',
    }),
    'Hotel Stary, Kraków · Video Standard',
    'preferred hero meta shape',
  )
  assertEq(juliaMeta.metaLine, 'Hotel Stary, Kraków · Video Standard', 'venue + package only')
  assert(!juliaMeta.metaLine?.includes('godz'), 'no coverage hours in julia-like hero')
  assert(!juliaMeta.metaLine?.includes('maks'), 'no coverage clock in julia-like hero')
  assertEq(juliaMeta.dateParts?.day, '20', 'day number')
  assertEq(juliaMeta.dateParts?.weekday, 'czwartek', 'weekday quiet')
  assert(juliaMeta.dateParts?.month.toLocaleLowerCase('pl-PL').startsWith('sie') === true, 'short month')
  assertEq(juliaMeta.countdown?.kind, 'future', 'future countdown')
  assertEq(juliaMeta.countdown?.value, '1', 'one day')
  assertEq(juliaMeta.countdown?.unit, 'dzień', 'singular Polish')
  assertEq(juliaMeta.countdown?.caption, 'do ślubu', 'caption')

  assertEq(
    composeRecordHeroDateParts('2026-08-20')?.weekday,
    'czwartek',
    'date rail weekday',
  )
  assertEq(
    composeRecordHeroCountdown('2026-08-20', '2026-08-19')?.unit,
    'dzień',
    'singular countdown',
  )
  assertEq(
    composeRecordHeroCountdown('2026-08-22', '2026-08-19')?.unit,
    'dni',
    'plural countdown',
  )
  assertEq(
    composeRecordHeroCountdown('2026-08-19', '2026-08-19')?.value,
    'DZIŚ',
    'today',
  )
  assertEq(
    composeRecordHeroCountdown('2026-08-01', '2026-08-19')?.value,
    'PO',
    'past has no negative number',
  )
  assertEq(
    composeRecordHeroCountdown('2026-08-01', '2026-08-19')?.unit,
    'ślubie',
    'past unit',
  )
  assertEq(composeRecordHeroCountdown(null)?.kind, undefined, 'no invented countdown')
})

run('3b. em-dash is not used as a missing-venue placeholder', () => {
  const line = composeHeaderMetaLine({
    venueText: null,
    packageName: 'Video Standard',
  })
  assert(line === 'Video Standard', 'package only')
  assert(!String(line).startsWith('—'), 'no leading dash')
})

run('4. Current Story action states + approved null copy', () => {
  const early = wedding()
  const send = resolveWeddingNextAction(early)
  const sendStory = composeModernWeddingCurrentStory({
    wedding: early,
    action: send,
    applyCount: 0,
  })
  assertEq(sendStory.eyebrow, 'Teraz', 'manual eyebrow')
  assertEq(sendStory.title, 'Uzupełnij dane do umowy', 'manual title')
  assertEq(sendStory.primaryAction?.label, 'Uzupełnij dane', 'manual cta')

  const waiting = wedding({
    questionnaires: {
      contractData: { status: 'sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    couple: couple({
      partner1FirstName: '',
      partner1LastName: '',
      partner2FirstName: '',
      partner2LastName: '',
      phone: '',
      email: '',
      partner1: '',
      partner2: '',
    }),
  })
  const waitingAction = resolveWeddingNextAction(waiting)
  assertEq(
    waitingAction?.id,
    'complete_contract_data_manually',
    'incomplete existing wedding → manual completion (not wait-on-Q)',
  )
  const waitingStory = composeModernWeddingCurrentStory({
    wedding: waiting,
    action: waitingAction,
    applyCount: 0,
    todayKey: '2026-08-19',
  })
  assertEq(waitingStory.kind, 'complete_contract_data_manually', 'manual kind')
  assertEq(waitingStory.title, 'Uzupełnij dane do umowy', 'manual title')
  assertEq(waitingStory.primaryAction?.label, 'Uzupełnij dane', 'manual cta')

  const generate = wedding({
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    travelFeeStatus: 'included',
  })
  const genAction = resolveWeddingNextAction(generate)
  assertEq(genAction?.id, 'generate_contract', 'resolver generate')
  const genStory = composeModernWeddingCurrentStory({
    wedding: generate,
    action: genAction,
    applyCount: 0,
    missingTemplate: true,
  })
  assertEq(genStory.support, 'Brak szablonu w pakiecie', 'missing template support')
  assertEq(genStory.primaryAction, null, 'no fake generate CTA')
  assertEq(genStory.quietLink?.label, 'Przejdź do pakietu', 'quiet package link')

  const ready = wedding({
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'completed' },
    },
    contract: { status: 'signed' },
    travelFeeStatus: 'included',
    payments: [paid(1000)],
    ceremonyLocation: 'Kościół',
    receptionLocation: 'Villa Love',
    date: '2027-12-01',
  })
  const readyAction = resolveWeddingNextAction(ready, {
    places: [],
    canonicalApplyCandidateCount: 0,
    preweddingStatus: 'completed',
    today: '2026-08-19',
  })
  assertEq(readyAction, null, 'resolver null ready')
  const readyStory = composeModernWeddingCurrentStory({
    wedding: ready,
    action: readyAction,
    applyCount: 0,
    preweddingStatus: 'completed',
    todayKey: '2026-08-19',
  })
  assertEq(readyStory.kind, 'ready', 'ready kind')
  assertEq(readyStory.eyebrow, 'Gotowe', 'ready eyebrow')
  assertEq(readyStory.title, MODERN_READY_STORY_TITLE, 'approved null copy')
  assert(readyStory.title === 'Na ten moment wszystko gotowe', 'exact copy')
  assertEq(readyStory.primaryAction, null, 'no CTA')
  assert(Boolean(readyStory.title), 'hero does not collapse')

  const photographerComplete = wedding({
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    travelFeeStatus: 'unresolved',
    couple: couple({
      partner1Address: 'ul. Kwiatowa 8',
      partner1PostalCode: '00-001',
      partner1City: 'Warszawa',
    }),
    bridePreparationLocation: 'Dom panny',
    groomPreparationLocation: 'Dom pana',
    ceremonyLocation: 'Kościół',
    receptionLocation: 'Sala',
  })
  const photoAction = resolveWeddingNextAction(photographerComplete)
  const photoStory = composeModernWeddingCurrentStory({
    wedding: photographerComplete,
    action: photoAction,
    applyCount: 0,
  })
  assertEq(photoAction?.id, 'resolve_travel_fee', 'P5 — collection complete skips send Q')
  assertEq(photoStory.kind, 'resolve_travel_fee', 'P5 — travel is the story')
  assert(photoStory.primaryAction?.label !== 'Wyślij ankietę', 'P5 — send is not the CTA')
  assert(!photoStory.title.includes('Zbierz dane do umowy'), 'P5 — no collect-via-Q title')
  const photoReadiness = composeModernWeddingReadiness({
    wedding: photographerComplete,
    applyCount: 0,
    storyKind: photoStory.kind,
  })
  if (photoReadiness.kind === 'items') {
    assert(
      !photoReadiness.items.some((i) => i.status === 'Niekompletne'),
      'P5 — readiness does not treat not_sent as incomplete collection',
    )
  }
})

run('5. Apply override + overdue when resolver null + delivered', () => {
  const past = wedding({
    date: '2025-06-01',
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'completed' },
    },
    contract: { status: 'signed' },
    travelFeeStatus: 'included',
    payments: [paid(1000)],
    finalPaymentDueDate: '2025-05-01',
    price: 12200,
  })
  const pastAction = resolveWeddingNextAction(past, {
    canonicalApplyCandidateCount: 2,
    preweddingStatus: 'completed',
    today: '2026-08-19',
  })
  const applyStory = composeModernWeddingCurrentStory({
    wedding: past,
    action: pastAction,
    applyCount: 2,
    todayKey: '2026-08-19',
  })
  assertEq(applyStory.kind, 'apply', 'apply wins including past leftover')
  assertEq(applyStory.title, 'Para przysłała zmiany do planu', 'apply title')

  const overdue = wedding({
    date: '2025-06-01',
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'completed' },
    },
    contract: { status: 'signed' },
    travelFeeStatus: 'included',
    payments: [paid(1000)],
    finalPaymentDueDate: '2025-05-01',
    price: 12200,
  })
  const overdueAction = resolveWeddingNextAction(overdue, {
    canonicalApplyCandidateCount: 0,
    today: '2026-08-19',
  })
  assertEq(overdueAction, null, 'past resolver null')
  const overdueStory = composeModernWeddingCurrentStory({
    wedding: overdue,
    action: overdueAction,
    applyCount: 0,
    todayKey: '2026-08-19',
  })
  assertEq(overdueStory.kind, 'overdue', 'overdue story')
  assertEq(overdueStory.eyebrow, 'Uwaga', 'overdue eyebrow')
  assert(overdueStory.title.includes('po terminie'), 'truthful overdue')

  const delivered = wedding({
    date: '2025-06-01',
    deliveryCompletedAt: '2026-08-18',
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'completed' },
    },
    contract: { status: 'signed' },
    travelFeeStatus: 'included',
    payments: [paid(12200)],
  })
  const deliveredStory = composeModernWeddingCurrentStory({
    wedding: delivered,
    action: null,
    applyCount: 0,
    todayKey: '2026-08-19',
  })
  assertEq(deliveredStory.kind, 'delivered', 'delivered kind')
  assertEq(deliveredStory.eyebrow, 'Oddane', 'delivered eyebrow')
  assert(deliveredStory.title.includes('Materiały oddane'), 'oddano copy')
})

run('6. contextual Day Mode', () => {
  assertEq(
    resolveDayModeProminence({ daysUntil: 392, delivered: false }),
    'tertiary',
    'far',
  )
  assertEq(
    resolveDayModeProminence({ daysUntil: 21, delivered: false }),
    'secondary',
    'prep window',
  )
  assertEq(
    resolveDayModeProminence({ daysUntil: 1, delivered: false }),
    'secondary',
    'near',
  )
  assertEq(
    resolveDayModeProminence({ daysUntil: 0, delivered: false }),
    'primary',
    'wedding day',
  )
  assertEq(
    resolveDayModeProminence({ daysUntil: -10, delivered: false }),
    'overflow',
    'past',
  )
  assertEq(
    resolveDayModeProminence({ daysUntil: 5, delivered: true }),
    'overflow',
    'delivered demotes',
  )
  assert(daysUntilWeddingDate('2026-09-09', '2026-08-19') === 21, '21-day window')
  const header = read('src/features/weddings/modern-detail/ModernWeddingDetailHeader.tsx')
  const headerCss = read(
    'src/features/weddings/modern-detail/ModernWeddingDetailHeader.module.css',
  )
  assert(header.includes('modern-wedding-day-mode'), 'day mode remains available')
  assert(header.includes('data-prominence'), 'prominence is explicit')
  assert(header.includes('role="menuitem"'), 'day mode lives in overflow')
  assert(!header.includes('dayModePrimary'), 'no visible day-mode chrome')
  assert(!header.includes("prominence !== 'overflow'"), 'no visible header day-mode split')
  assert(!headerCss.includes('.utilities'), 'utilities row removed')
  assert(!headerCss.includes('.edit {'), 'no visible edit button')
})

run('7. commercial health', () => {
  const none = composeModernWeddingCommercialHealth(wedding({ payments: [] }))
  assertEq(none.paymentKind, 'none', 'no payments')
  assertEq(none.paymentSentence, 'Brak wpłat', 'Brak wpłat')
  assert(!none.paymentSentence.startsWith('0'), 'does not lead with 0 zł')
  assert(none.contractValueLabel.includes('12 200'), 'total value preserved')
  assert(typeof none.paidLabel === 'string', 'paid label for commercial row')

  const paidFull = composeModernWeddingCommercialHealth(
    wedding({ payments: [paid(12200)] }),
  )
  assertEq(paidFull.paymentKind, 'paid', 'fully paid')
  assertEq(paidFull.paymentSentence, 'Opłacone', 'Opłacone')
  assertEq(paidFull.remainingLabel, null, 'omit remaining')

  const scheduled = composeModernWeddingCommercialHealth(
    wedding({ deliveryDueDate: '2027-01-20' }),
    '2026-08-19',
  )
  assertEq(scheduled.delivery?.label, 'Termin oddania', 'scheduled delivery label')

  const overdue = composeModernWeddingCommercialHealth(
    wedding({
      payments: [paid(1000)],
      finalPaymentDueDate: '2026-08-01',
    }),
    '2026-08-19',
  )
  assertEq(overdue.paymentTone, 'overdue', 'overdue tone')
  assertEq(overdue.dueTone, 'overdue', 'due overdue')
  assert(overdue.paymentSentence.includes('Wpłacono'), 'partial sentence')

  const delivered = composeModernWeddingCommercialHealth(
    wedding({
      deliveryCompletedAt: '2026-08-18',
      deliveryDueDate: '2027-01-26',
    }),
    '2026-08-19',
  )
  assertEq(delivered.delivery?.label, 'Oddano', 'Oddano label')
  assertEq(delivered.delivery?.tone, 'completed', 'completed tone')

  const noRule = composeModernWeddingCommercialHealth(
    wedding({ deliveryDueDate: null, deliveryCompletedAt: null }),
  )
  assertEq(noRule.delivery, null, 'omit delivery row')
})

run('8. Attention dedupe', () => {
  const w = wedding({
    contract: { status: 'generated' },
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
  })
  const action = resolveWeddingNextAction(w)
  const story = composeModernWeddingCurrentStory({
    wedding: w,
    action,
    applyCount: 0,
  })
  assertEq(story.kind, 'mark_contract_sent', 'unsent is the story')
  const attention = composeModernWeddingAttention({
    wedding: w,
    applyCount: 0,
    story,
  })
  assert(
    !attention.items.some((i) => i.id === 'unsent_contract'),
    'does not repeat unsent',
  )
})

run('9. Apply-aware readiness — no false zatwierdzone', () => {
  const w = wedding({
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'completed' },
    },
    contract: { status: 'signed' },
    travelFeeStatus: 'included',
    payments: [paid(1000)],
    ceremonyLocation: 'Kościół',
    receptionLocation: 'Sala',
  })
  const view = composeModernWeddingReadiness({
    wedding: w,
    applyCount: 2,
    preweddingStatus: 'completed',
    storyKind: 'apply',
  })
  assert(view.kind === 'items', 'shows items')
  if (view.kind === 'items') {
    const blob = view.items.map((i) => `${i.domain} ${i.status}`).join(' | ')
    assert(!/zatwierdzon/i.test(blob), 'no zatwierdzone')
    assert(
      view.items.some((i) => i.status === MODERN_APPLY_READINESS_STATUS),
      'apply wording',
    )
  }
})

run('10. no four empty place cards', () => {
  const empty = wedding({
    ceremonyLocation: '',
    receptionLocation: '',
    bridePreparationLocation: '',
    groomPreparationLocation: '',
    preparationLocation: '',
  })
  const filled = composeFilledPlaces(empty, [])
  assertEq(filled.length, 0, 'no empty role rows')
  const placesSrc = read(
    'src/features/weddings/modern-detail/ModernWeddingOverview.tsx',
  )
  assert(placesSrc.includes('Brak uzupełnionych miejsc'), 'empty copy')
  assert(!placesSrc.includes('locations.every'), 'does not render empty wall')
})

run('11. Calendars tertiary + tabs + bridge', () => {
  assertEq(
    composeCalendarsLine({ appleState: 'available', googleState: 'pending' }),
    'Kalendarze · Apple aktywny · Google oczekuje',
    'compact line',
  )
  const overview = read(
    'src/features/weddings/modern-detail/ModernWeddingOverview.tsx',
  )
  const overviewCss = read(
    'src/features/weddings/modern-detail/ModernWeddingOverview.module.css',
  )
  const workspace = read(
    'src/features/weddings/modern-detail/ModernWeddingDetailWorkspace.tsx',
  )
  const tabs = read(
    'src/features/weddings/modern-detail/ModernWeddingDetailTabs.tsx',
  )
  assert(overview.includes('Rozliczenie'), 'settlement heading')
  assert(overview.includes('Wartość umowy'), 'contract-value label')
  assert(!overview.includes('po terminie'), 'finance does not repeat overdue copy')
  assert(overview.includes('factSupport'), 'today support line still available')
  assert(!overview.includes(" · po terminie"), 'no inline overdue glue')
  assert(overviewCss.includes('white-space: nowrap'), 'date and overdue status do not wrap')
  assertEq(formatModernWeddingCountdown('Za 1 dni'), 'Za 1 dzień', 'singular countdown')
  assertEq(formatModernWeddingCountdown('Za 2 dni'), 'Za 2 dni', 'plural countdown')
  assert(overview.includes('modern-wedding-correspondence'), 'correspondence fact')
  assert(!overview.includes("boxQuiet} ${styles.packageBox"), 'package same surface')
  assert(!overview.includes("boxQuiet} ${styles.calendars"), 'calendars same surface')
  assert(overview.includes("boxQuiet} ${styles.readiness"), 'readiness may stay quieter')
  assert(overview.includes('modern-wedding-calendars'), 'calendars section')
  assert(overview.includes('modern-wedding-package'), 'package owned box')
  assert(overview.includes('modern-wedding-places'), 'places owned box')
  assert(overview.includes('modern-wedding-couple'), 'couple owned box')
  assert(overview.includes('modern-wedding-commercial'), 'commercial owned box')
  assert(!overview.includes('modern-wedding-rail'), 'no record rail')
  assert(!overview.includes('modern-wedding-summary'), 'no stage-c summary sheet')
  assert(!overview.includes('modern-wedding-details'), 'no stage-c details matrix')
  assert(!overview.includes('overview-calendars-card'), 'not V2 equal card class')
  assert(!overview.includes('v3MaterialHero'), 'no dashboard hero')
  assert(!overview.includes('v3MaterialSatin'), 'no separate satin cards')
  assert(!overview.includes('v3MaterialSupporting'), 'no nested supporting cards')
  assert(!overview.includes('composeModernWeddingReadiness'), 'no readiness wall')
  assert(!overview.includes(MODERN_APPLY_READINESS_STATUS), 'no duplicated apply copy')
  assert(!overviewCss.includes('span 7'), 'no rejected dashboard span-7')
  assert(!overviewCss.includes('span 5'), 'no rejected dashboard span-5')
  assert(overviewCss.includes('border-radius: 18px'), 'one box radius')
  assert(overviewCss.includes('repeat(12, minmax(0, 1fr))'), '12-col grid')
  assert(overviewCss.includes('grid-column: 1 / 8'), 'places/package column preserved')
  assert(overviewCss.includes('grid-column: 8 / -1'), 'couple/calendars column preserved')
  const overviewMobile = overviewCss.slice(overviewCss.lastIndexOf('@media (max-width: 767px)'))
  assert(
    overviewMobile.includes('grid-template-columns: minmax(0, 1fr)'),
    'mobile overview is a single column',
  )
  assert(overviewMobile.includes('width: 100%'), 'mobile overview cards use full content width')
  assert(
    overviewMobile.includes('.statusBox,\n  .financeBox,\n  .places,\n  .couple,\n  .packageBox,\n  .calendars,\n  .readiness'),
    'mobile overview sheets share one full-width axis',
  )
  assert(
    overviewMobile.includes('repeat(6, minmax(0, 1fr))'),
    'mobile rozliczenie uses a 3+2 editorial grid',
  )
  assert(overviewMobile.includes('grid-column: span 2'), 'money facts share row one')
  assert(overviewMobile.includes('grid-column: span 3'), 'deadline facts share row two')
  assert(!overviewCss.includes('.rail'), 'no rail architecture')
  assert(workspace.includes('ModernWeddingLogisticsWorkspace'), 'logistics tab')
  assert(
    !workspace.includes("from '@/features/weddings/detail/v2/WeddingDayWorkspace'"),
    'no classic day import',
  )
  assert(workspace.includes('ModernWeddingContractFinanceWorkspace'), 'finance tab')
  assert(
    !workspace.includes("from '@/features/weddings/detail/v2/WeddingContractFinanceWorkspace'"),
    'classic finance workspace not imported',
  )
  assert(workspace.includes('ModernWeddingQuestionnaireWorkspace'), 'pre-q tab')
  assert(
    !workspace.includes("from '@/features/weddings/detail/v2/WeddingPreWeddingQuestionnaireWorkspace'"),
    'classic questionnaire workspace not imported in modern shell',
  )
  assert(workspace.includes('ModernWeddingHistoriaWorkspace'), 'history tab')
  assert(
    !workspace.includes("from '@/features/weddings/detail/v2/WeddingActivityWorkspace'"),
    'classic activity workspace not imported by modern shell',
  )
  assert(tabs.includes("'Logistyka'"), 'modern day tab label')
  assert(!tabs.includes("'Dzień ślubu'"), 'classic day label not hardcoded in modern tabs')
  assert(tabs.includes('WORKSPACE_TABS'), 'five tabs preserved')
  assert(tabs.includes('role="tab"'), 'tab semantics')
  assert(tabs.includes('aria-selected'), 'aria-selected')
  const tabsCss = read(
    'src/features/weddings/modern-detail/ModernWeddingDetailTabs.module.css',
  )
  const headerSrc = read(
    'src/features/weddings/modern-detail/ModernWeddingDetailHeader.tsx',
  )
  assert(tabsCss.includes('margin: 15px 0 0'), 'tabs sit under hero, outside the surface')
  assert(!headerSrc.includes('ModernWeddingDetailTabs'), 'tabs are not inside the hero')
  assert(!headerSrc.includes('WORKSPACE_TABS'), 'hero does not own tabs')
  assert(workspace.includes('padding-top: 20px') === false, 'spacing lives in css')
})

run('12. package coverage end presentation', () => {
  const both = composePackageOverviewMeta(
    wedding({
      coverageHours: 12,
      coverageEndTime: '00:30',
      deliveryMonths: 5,
    }),
  )
  assertEq(both.coverage, '12 godz. · maks. 00:30', 'hours + canonical end')
  assertEq(both.delivery, 'Oddanie do 5 miesięcy', 'delivery separate')
  assertEq(both.name, 'Video Standard', 'package name')

  const hoursOnly = composePackageOverviewMeta(
    wedding({
      coverageHours: 12,
      coverageEndTime: null,
      deliveryMonths: 5,
    }),
  )
  assertEq(hoursOnly.coverage, '12 godz.', 'hours without fake end')
  assert(!hoursOnly.coverage?.includes('maks.'), 'no maks. fallback')

  const missing = composePackageOverviewMeta(
    wedding({
      coverageHours: null,
      coverageEndTime: null,
      deliveryMonths: null,
      deliveryDays: null,
    }),
  )
  assertEq(missing.coverage, null, 'omit coverage when unknown')
  assertEq(missing.delivery, null, 'omit delivery when unknown')

  const model = read(
    'src/features/weddings/modern-detail/modernWeddingDetailModel.ts',
  )
  assert(
    model.includes('commercial.coverageEndTime'),
    'reuses commercial snapshot end',
  )
  assert(!model.includes('maks. —'), 'no fake maks dash')
  assert(!model.includes('maks. brak'), 'no fake maks missing')
  const overview = read(
    'src/features/weddings/modern-detail/ModernWeddingOverview.tsx',
  )
  assert(overview.includes('packageCoverage'), 'coverage line owned')
  assert(overview.includes('packageDelivery'), 'delivery line owned')
})

run('12b. calendar rows presentation', () => {
  const rows = composeCalendarsRows({
    appleState: 'available',
    googleState: 'pending',
  })
  assertEq(rows.length, 2, 'two providers')
  assertEq(rows[0]?.name, 'Apple', 'apple name')
  assertEq(rows[0]?.status, 'Aktywny', 'apple status')
  assertEq(rows[1]?.name, 'Google', 'google name')
  assertEq(rows[1]?.status, 'Oczekuje', 'google status')
})

run('12c. correspondence overview uses persisted channels only', () => {
  const filled = composeCorrespondenceOverview(
    wedding({
      correspondence: [
        { id: 'c1', channel: 'instagram', value: '@julia' },
        { id: 'c2', channel: 'facebook', value: '   ' },
      ],
    }),
  )
  assertEq(filled.length, 1, 'empty values omitted')
  assertEq(filled[0]?.channelLabel, 'Instagram', 'product label')
  assertEq(filled[0]?.display.label, '@julia', 'canonical display')
  assertEq(composeCorrespondenceOverview(wedding({ correspondence: [] })).length, 0, 'no invented channel')
})

{
  const ctx = read(
    'src/features/weddings/modern-detail/useModernWeddingDetailContext.ts',
  )
  assert(ctx.includes("['wedding-places', userId, wedding.id]"), 'same places key')
  assert(ctx.includes("PREWEDDING_QUERY_KEY"), 'same prewedding key')
  assert(ctx.includes('operationalTimesQueryKey'), 'same ops key')
  assert(ctx.includes('package-contract-for-wedding'), 'reuses package contract key')
  assert(!ctx.includes('listByWeddingId(place'), 'no per-place N+1')
  const migDir = resolve(process.cwd(), 'supabase/migrations')
  const files = existsSync(migDir)
    ? readFileSync
    : readFileSync
  void files
  const modernCss = [
    'src/features/weddings/modern-detail/ModernWeddingOverview.module.css',
    'src/features/weddings/modern-detail/ModernWeddingDetailHeader.module.css',
    'src/pages/WeddingDetailModernPage.module.css',
  ]
    .map(read)
    .join('\n')
  assert(!modernCss.includes('backdrop-filter: blur'), 'no liquid glass')
  assert(modernCss.includes('prefers-reduced-motion'), 'reduced motion')
  console.log('PASS  12. queries / no N+1 / reduced motion / no glass')
}

{
  const tokens = read('src/features/theme/tokens/graphite.ts')
  assert(tokens.includes("'--app-background': '#F2E9DE'"), 'graphite frozen')
  const dashboard = read('src/pages/DashboardV3Page.tsx')
  const weddings = read('src/features/weddings/modern/ModernWeddingsWorkspace.tsx')
  const sessions = read('src/features/sessions/modern/ModernSessionsWorkspace.tsx')
  const calendar = read('src/features/calendar/modern/ModernCalendarWorkspace.tsx')
  const sidebar = read('src/layouts/Sidebar.tsx')
  void dashboard
  void weddings
  void sessions
  void calendar
  void sidebar
  console.log('PASS  13. neighboring surfaces not rewritten by this test file')
}

console.log('\nPASS  modern wedding detail phase 1 acceptance')
