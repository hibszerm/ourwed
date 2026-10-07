/**
 * Modern Wedding Detail — Umowa i finanse presentation acceptance.
 * Run: npm run test:modern-wedding-detail
 */

import { existsSync,  readFileSync  } from 'node:fs'
import { resolve } from 'node:path'
import type { GeneratedWeddingContract } from '@/features/documents/template'
import { WORKSPACE_TABS } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import {
  composeContractDocumentMeta,
  composeModernAgreementTerms,
  composeModernContractHeadline,
  composeModernSettlementView,
  formatExtrasLabel,
  paymentDisplayLabel,
  paymentPaidLine,
  questionnaireSummary,
  sortGeneratedContractsNewestFirst,
} from '@/features/weddings/modern-detail/modernWeddingContractFinanceModel'
import { getContractValue, getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { getRemainingToPay, getTotalPaid } from '@/lib/utils/finance'
import { getEffectiveTravelFeeAmount } from '@/lib/utils/travelFeeCommercial'
import type { WeddingExtraService } from '@/types/package'
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
    partner1: 'Julia Kanicka',
    partner2: 'Maksymilian Ruth',
    partner1FirstName: 'Julia',
    partner1LastName: 'Kanicka',
    partner2FirstName: 'Maksymilian',
    partner2LastName: 'Ruth',
    email: 'julia@example.com',
    phone: '500100200',
    venue: '',
    city: '',
    ...partial,
  }
}

function wedding(partial: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w-julia',
    couple: couple(),
    date: '2026-08-17',
    status: 'active',
    workflowStage: 'deposit',
    packageName: 'Video Standard',
    price: 11400,
    depositAmount: 1000,
    coverageHours: 12,
    coverageEndTime: '23:30',
    overtimeRate: 900,
    deliveryMonths: 5,
    travelFeeStatus: 'included',
    travelFeeAmount: 0,
    finalPaymentDueDate: '2026-08-17',
    finalPaymentTerms: { mode: 'wedding_day' },
    packageItems: [
      { sourceItemId: 'i1', title: 'teledysk 4K', description: null, sortOrder: 0 },
    ],
    checklist: [],
    schedule: [],
    payments: [
      {
        id: 'pay-1',
        label: 'Zadatek',
        amount: 1000,
        type: 'deposit',
        paid: true,
        paidAt: '2026-08-16',
      },
    ],
    finances: [],
    questionnaires: {
      contractData: { status: 'completed', completedAt: '2026-08-16' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: {
      status: 'signed',
      signedAt: '2026-08-16',
      generatedAt: '2026-08-16T15:26:00.000Z',
    },
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#000',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

function extra(name: string): WeddingExtraService {
  return {
    id: 'ex-1',
    weddingId: 'w-julia',
    extraServiceId: 'vhs',
    priceSnapshot: 400,
    quantity: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    name,
  }
}

function artifact(
  partial: Partial<GeneratedWeddingContract> & { title?: string; version?: number },
): GeneratedWeddingContract {
  const version = partial.version ?? 1
  const id = partial.draft?.id ?? `d-${version}`
  return {
    draft: {
      id,
      weddingId: 'w-julia',
      templateId: 't1',
      templateVersionId: 'tv1',
      title:
        partial.title ??
        'Umowa — Video Standard — Julia Kanicka & Maksymilian Ruth',
      fieldValues: {},
      packageSnapshot: {
        packageId: null,
        name: 'Video Standard',
        currency: 'PLN',
        items: [],
      },
      enabledClauseIds: [],
      money: {
        price: 11400,
        deposit: 1000,
        remaining: 10400,
        discount: 0,
        currency: 'PLN',
      },
      notes: null,
      status: 'ready',
      createdAt: '2026-08-16T15:26:00.000Z',
      updatedAt: '2026-08-16T15:26:00.000Z',
    },
    weddingId: 'w-julia',
    templateId: 't1',
    templateVersionId: 'tv1',
    generationVersion: version,
    status: 'ready',
    artifacts: [
      {
        id: `a-${version}`,
        format: 'docx',
        generationVersion: version,
        fileName: `umowa-v${version}.docx`,
        filePath: `path/v${version}.docx`,
        createdAt: '2026-08-16T15:26:00.000Z',
        snapshotJson: {},
      },
    ],
    createdAt: '2026-08-16T15:26:00.000Z',
    updatedAt: '2026-08-16T15:26:00.000Z',
    ...partial,
  }
}

const modern = read(
  'src/features/weddings/modern-detail/ModernWeddingContractFinanceWorkspace.tsx',
)
const modernCss = read(
  'src/features/weddings/modern-detail/ModernWeddingContractFinanceWorkspace.module.css',
)
const model = read(
  'src/features/weddings/modern-detail/modernWeddingContractFinanceModel.ts',
)
const workspace = read(
  'src/features/weddings/modern-detail/ModernWeddingDetailWorkspace.tsx',
)
const tabs = read(
  'src/features/weddings/modern-detail/ModernWeddingDetailTabs.tsx',
)
const overview = read(
  'src/features/weddings/modern-detail/ModernWeddingOverview.tsx',
)
const logistics = read(
  'src/features/weddings/modern-detail/ModernWeddingLogisticsWorkspace.tsx',
)
const header = read(
  'src/features/weddings/modern-detail/ModernWeddingDetailHeader.tsx',
)

run('Modern mounts dedicated finance workspace; Classic file stays', () => {
  assert(workspace.includes('ModernWeddingContractFinanceWorkspace'), 'modern mount')
  assert(
    !workspace.includes(
      "from '@/features/weddings/detail/v2/WeddingContractFinanceWorkspace'",
    ),
    'no classic import in modern workspace',
  )
  assert(
    !workspace.includes('data-tab="contract_finance"'),
    'no v2 bridge wrapper for finance tab',
  )
  assert(!existsSync(resolve(process.cwd(), 'src/features/weddings/detail/v2/WeddingContractFinanceWorkspace.tsx')), 'Classic contract finance chrome removed')
})

run('Tab id and label stay Umowa i finanse / contract_finance', () => {
  assertEq(
    WORKSPACE_TABS.find((tab) => tab.id === 'contract_finance')?.label,
    'Umowa i finanse',
    'canonical tab label',
  )
  assert(!tabs.includes("contract_finance:"), 'modern tabs do not rename finance')
})

run('Architecture uses canonical helpers, not a second commercial model', () => {
  assert(model.includes('getWeddingCommercialSummary'), 'commercial summary')
  assert(model.includes('composeModernWeddingCommercialHealth'), 'existing overdue/paid')
  assert(model.includes('getPackageSummary'), 'package snapshot helper')
  assert(model.includes('formatTravelFeeDisplay'), 'travel display')
  assert(model.includes('getEffectiveTravelFeeAmount') === false, 'no local CV travel math')
  assert(modern.includes("onAction('generate_contract')"), 'existing generate action')
  assert(modern.includes('Oznacz jako wysłaną'), 'mark-as-sent action')
  assert(modern.includes("updateStatus(wedding.id, 'sent')"), 'persists sent')
  assert(modern.includes('Oznacz jako podpisaną'), 'mark-as-signed action')
  assert(modern.includes("status === 'sent' && hasGenerated"), 'sign only after sent')
  assert(!modern.includes('Wyślij umowę'), 'no send invention')
  assert(!modern.includes('Pobierz i wyślij'), 'no combined download-send')
  assert(!modern.includes('GenerateContractModal'), 'legacy modal not activated')
  assert(!modern.includes('payment.dueDate'), 'no payment dueDate UI')
  assert(!modern.includes('TravelMap'), 'no logistics map')
  assert(modern.includes("queryKey: ['generated-wedding-contracts'"), 'same contract key')
  assert(modern.includes("'package-contract-for-wedding'"), 'same template key')
  assert(modern.includes("queryKey: ['wedding-source-contracts'"), 'same source key')
})

run('Contract workspace is two columns with modal document details', () => {
  assert(modernCss.includes('border-radius: 18px'), 'ivory sheet radius')
  assert(!modernCss.includes('max-width: 880px'), 'no classic column')
  assert(!modern.includes('paymentBig'), 'no classic KPI class')
  assert(modern.includes('>Umowa<') || modern.includes('Umowa'), 'contract section')
  assert(modern.includes('Dokumenty i dane'), 'right-side documents and data area')
  assert(modernCss.includes('grid-template-columns: minmax(0, 1.63fr) minmax(300px, 1fr)'), 'two-column desktop ratio')
  assert(modernCss.includes('align-items: start'), 'workspace columns stay content-height')
  assert(modernCss.includes('padding: 28px 36px 30px'), 'workspace keeps compact framing')
  assert(modernCss.includes('margin-bottom: 12px'), 'eyebrow and status have deliberate separation')
  assert(modernCss.includes('min-height: 56px'), 'right navigation rows stay comfortable but compact')
  assert(modernCss.includes('margin-top: 18px'), 'navigation divider spacing stays compact')
  assert(modernCss.includes('@media (max-width: 900px)'), 'columns stack for tablet and mobile')
  assert(modern.includes('Rozliczenie'), 'settlement section')
  assert(modern.includes('Szczegóły pakietu'), 'package chapter')
  assert(!modern.includes('Warunki umowy'), 'old terms heading removed')
  assert(!modern.includes('Aktualna umowa'), 'no redundant current-contract heading')
  assert(!modernCss.includes('stateBanner'), 'no green status banner')
  assert(modern.includes('Wgrane dokumenty'), 'user-facing uploaded-document terminology')
  assert(modern.includes("setUtility('source')"), 'uploaded documents open in modal')
  assert(modern.includes('size="story"'), 'detail surfaces use shared modal')
  assert(modern.includes('showClose'), 'modals have stable close control')
  assert(modern.includes('Modal'), 'modal primitive reused')
  assert(modern.includes('Dane z ankiety'), 'questionnaire kept')
  assert(!modern.includes('SendQuestionnaireModal'), 'no send questionnaire here')
  assert(model.includes("line: 'Nie wysłano'"), 'P5 — not_sent is provenance, not Oczekuje')
})

run('Upload-only stores a private source document without starting analysis', () => {
  const storeOnly = read('src/features/wedding-contract-recovery/storeSourceContractOnly.ts')
  const sourceSchema = read('supabase/migrations/20260728160000_wedding_contract_recovery.sql')
  assert(storeOnly.includes('assertValidSourceContractFile'), 'reuse PDF/DOCX validation')
  assert(storeOnly.includes('documentStorage.paths.sourceContract'), 'use owner/wedding-scoped private path')
  assert(storeOnly.includes('documentStorage.upload'), 'store original file')
  assert(storeOnly.includes('createSourceContract'), 'persist document metadata')
  assert(!storeOnly.includes('createRecovery'), 'stored-only creates no analysis record')
  assert(!storeOnly.includes('runRecoveryAnalysis'), 'stored-only never runs analysis')
  assert(!storeOnly.includes('analyzeWeddingContractRecovery'), 'stored-only never calls a provider')
  assert(!storeOnly.includes('weddingService.update'), 'stored-only does not mutate wedding fields')
  assert(sourceSchema.includes("'uploaded'"), 'existing source record supports uploaded state')
  assert(modern.includes('storeSourceContractOnly(wedding.id, selectedUpload)'), 'keep-only option uses storage path')
  assert(modern.includes('uploadAndStartRecovery(wedding.id, selectedUpload)'), 'analysis option reuses existing upload path')
  assert(modern.includes('runRecoveryAnalysis(recoveryId)'), 'analysis option uses existing analysis service')
  assert(modern.includes('retryRecoveryAnalysis'), 'analysis failure can retry the same recovery instead of duplicating the upload')
  assert(modern.includes('upload-document-store-only'), 'keep-only option is independently actionable')
  assert(modern.includes('upload-document-analyze'), 'analysis choice is explicit')
})

run('History, questionnaire, and uploaded documents retain their existing data/actions', () => {
  assert(modern.includes('sorted.map((contract)'), 'history renders the already sorted contract versions')
  assert(modern.includes('HistoricalContractVersion'), 'history reuses each saved version')
  assert(modern.includes('Pobierz DOCX'), 'history exposes DOCX download')
  assert(modern.includes('Pobierz PDF'), 'history exposes PDF through the shared converter')
  assert(modern.includes('WeddingContractQuestionnaireAnswers'), 'questionnaire modal retains the existing read model')
  assert(modern.includes('listSourceContractsByWedding'), 'document list stays wedding-scoped')
  assert(modern.includes('documentStorage.signedUrl(filePath)'), 'uploaded documents reopen via private signed URL')
  assert(modern.includes('reanalyzeSourceContract(contract.id)'), 'analyzed source can enter its existing reanalysis flow')
  assert(modern.includes('contracts-generate'), 'existing generation action remains wired')
  assert(modern.includes("onAction('generate_contract')"), 'generation stays on current handler')
  assert(modern.includes("contractService.updateStatus(wedding.id, 'sent')"), 'sent lifecycle action remains wired')
  assert(modern.includes('contract-pdf-download-button'), 'current PDF action remains wired')
  assert(modern.includes('contract-freshness-regenerate'), 'regeneration path remains available')
})

run('Contract headline states', () => {
  assertEq(
    composeModernContractHeadline({
      weddingStatus: 'active',
      contractStatus: 'signed',
      signedAt: '2026-08-16',
      hasTemplate: true,
      hasGenerated: true,
    }).kind,
    'signed',
    'signed',
  )
  assertEq(
    composeModernContractHeadline({
      weddingStatus: 'active',
      contractStatus: 'signed',
      signedAt: '2026-08-16',
      hasTemplate: true,
      hasGenerated: true,
    }).title,
    'Podpisana',
    'signed title once',
  )
  assertEq(
    composeModernContractHeadline({
      weddingStatus: 'active',
      contractStatus: 'generated',
      hasTemplate: true,
      hasGenerated: true,
    }).title,
    'Wygenerowana',
    'generated',
  )
  assertEq(
    composeModernContractHeadline({
      weddingStatus: 'active',
      contractStatus: 'none',
      hasTemplate: true,
      hasGenerated: false,
    }).kind,
    'ready',
    'ready',
  )
  assertEq(
    composeModernContractHeadline({
      weddingStatus: 'active',
      contractStatus: 'none',
      hasTemplate: false,
      hasGenerated: false,
    }).kind,
    'no_template',
    'missing template',
  )
  assertEq(
    composeModernContractHeadline({
      weddingStatus: 'archived',
      contractStatus: 'signed',
      hasTemplate: true,
      hasGenerated: true,
    }).kind,
    'archived',
    'archived wins',
  )
  assertEq(
    composeModernContractHeadline({
      weddingStatus: 'active',
      contractStatus: 'none',
      hasTemplate: null,
      hasGenerated: false,
    }).kind,
    'loading',
    'template query pending',
  )
})

run('Current document meta and version sort', () => {
  const v1 = artifact({ version: 1 })
  const v2 = artifact({
    version: 2,
    title: 'Umowa v2',
    updatedAt: '2026-08-17T10:00:00.000Z',
  })
  const sorted = sortGeneratedContractsNewestFirst([v1, v2])
  assertEq(sorted[0]?.generationVersion, 2, 'newest first')
  const meta = composeContractDocumentMeta(v1)
  assert(meta.title.includes('Video Standard'), 'document identity')
  assertEq(meta.versionLabel, 'v1', 'version')
  assertEq(meta.formatsLabel, 'DOCX', 'format')
})

run('Julia settlement uses canonical CV / paid / remaining', () => {
  const record = wedding()
  const commercial = getWeddingCommercialSummary(record)
  const view = composeModernSettlementView(record, '2026-08-10')
  assertEq(getContractValue(record), 11400, 'CV')
  assertEq(getTotalPaid(record.payments), 1000, 'paid')
  assertEq(getRemainingToPay(11400, record.payments), 10400, 'remaining helper')
  assertEq(commercial.remainingToPay, 10400, 'summary remaining')
  assertEq(view.headline, 'Pozostało', 'remaining is headline')
  assertEq(view.headlineAmount, '10 400 zł', 'remaining amount')
  assertEq(view.contractValueLabel, '11 400 zł', 'CV label')
  assertEq(view.paidLabel, '1 000 zł', 'paid label')
  assertEq(view.travelLabel, 'W cenie', 'included travel')
  assertEq(getEffectiveTravelFeeAmount(record), 0, 'included travel is 0')
  assertEq(view.paymentKind, 'partial', 'deposit paid remaining')
  assertEq(view.dueDateOnly, '17 sierpnia 2026', 'calendar date')
  assertEq(view.dueTermsLabel, 'W dniu ślubu', 'semantic payment rule')
})

run('Fully paid and overdue use existing health helpers', () => {
  const paidRecord = wedding({
    payments: [
      {
        id: 'p-all',
        label: 'Wpłata',
        amount: 11400,
        type: 'final',
        paid: true,
        paidAt: '2026-08-01',
      },
    ],
  })
  const paidView = composeModernSettlementView(paidRecord, '2026-08-19')
  assertEq(paidView.headline, 'Rozliczone', 'paid headline')
  assertEq(paidView.remainingLabel, null, 'no remaining')
  assertEq(paidView.paymentKind, 'paid', 'paid kind')

  const overdue = wedding({
    finalPaymentDueDate: '2026-07-31',
    date: '2026-07-31',
  })
  const overdueView = composeModernSettlementView(overdue, '2026-08-19')
  assertEq(overdueView.dueTone, 'overdue', 'existing overdue')
  assert(Boolean(overdueView.overdueDateLabel), 'overdue date from existing helper')
  assertEq(overdueView.headlineAmount, '10 400 zł', 'still remaining')
})

run('Travel charged contributes; unresolved is 0; deposit/payments stay out of CV', () => {
  const charged = wedding({
    travelFeeStatus: 'charged',
    travelFeeAmount: 800,
    price: 12200,
  })
  assertEq(getEffectiveTravelFeeAmount(charged), 800, 'charged amount')
  assertEq(getContractValue(charged), 12200, 'CV is stored price')
  const unresolved = wedding({
    travelFeeStatus: 'unresolved',
    travelFeeAmount: 0,
  })
  const unresolvedView = composeModernSettlementView(unresolved)
  assertEq(unresolvedView.travelLabel, 'Nieustalony', 'unresolved copy')
  assert(unresolvedView.travelUnresolved, 'unresolved flag')
  assertEq(getEffectiveTravelFeeAmount(unresolved), 0, 'unresolved travel 0')
  assertEq(getContractValue(wedding()), 11400, 'deposit did not enter CV')
})

run('Agreement terms omit duplicated CV / travel / final due', () => {
  const terms = composeModernAgreementTerms(wedding(), [extra('VHS')])
  assertEq(terms.name, 'Video Standard', 'package name')
  assert(Boolean(terms.coverage?.includes('12 godz.')), 'coverage hours')
  assert(Boolean(terms.coverage?.includes('23:30')), 'coverage end')
  assertEq(terms.agreedDepositLabel, '1 000 zł', 'agreed deposit')
  assertEq(terms.extrasLabel, 'VHS', 'extras names')
  const src = JSON.stringify(terms)
  assert(!src.includes('11 400'), 'no CV in terms object')
  assert(!src.includes('W cenie'), 'no travel in terms')
  assert(!String(terms.coverage).includes('sierpnia'), 'no final due in coverage')
})

run('Payments and questionnaire stay on the real model', () => {
  const row: Payment = {
    id: 'p1',
    label: 'Zadatek',
    amount: 1000,
    type: 'deposit',
    paid: true,
    paidAt: '2026-08-16',
  }
  assertEq(paymentDisplayLabel(row), 'Zadatek', 'label')
  assert(paymentPaidLine(row).startsWith('Opłacone'), 'paid copy')
  assert(!('dueDate' in row && row.dueDate), 'fixture has no dueDate')
  const q = questionnaireSummary(wedding())
  assert(q.completed, 'completed')
  assert(q.line.includes('Wypełniona'), 'completed copy')
  assertEq(formatExtrasLabel([extra('VHS')]), 'VHS', 'extra label')

  const photographerOnly = questionnaireSummary(
    wedding({
      questionnaires: {
        contractData: { status: 'not_sent' },
        weddingQuestionnaire: { status: 'not_sent' },
      },
      couple: couple({
        partner1Address: 'ul. Kwiatowa 8',
        partner1PostalCode: '00-001',
        partner1City: 'Warszawa',
      }),
      bridePreparationLocation: 'Dom panny',
      groomPreparationLocation: 'Dom pana',
      ceremonyLocation: 'Kościół',
      receptionLocation: 'Sala',
    }),
  )
  assertEq(photographerOnly.completed, false, 'R — no fake submitted questionnaire')
  assertEq(photographerOnly.line, 'Nie wysłano', 'R — provenance, not a send CTA')
  assert(!photographerOnly.line.includes('Wypełniona'), 'R — does not claim couple submitted')
  assert(!photographerOnly.line.includes('Oczekuje'), 'R — not waiting on the couple')

  const waiting = questionnaireSummary(
    wedding({
      questionnaires: {
        contractData: { status: 'sent', sentAt: '2026-08-16' },
        weddingQuestionnaire: { status: 'not_sent' },
      },
    }),
  )
  assertEq(waiting.line, 'Oczekuje na odpowiedzi', 'sent still waits on couple')

})

run('Frozen Overview / Logistics / hero files are not this change set target', () => {
  assert(overview.includes('Rozliczenie'), 'overview settlement remains')
  assert(overview.includes('Wartość umowy'), 'overview CV copy is Wartość umowy')
  assert(!overview.includes('Wartość zlecenia'), 'overview dropped zlecenia copy')
  assert(logistics.includes('ModernWeddingLogisticsWorkspace'), 'logistics stays')
  assert(header.includes('ModernWeddingDetailHeader'), 'hero file still present')
  assert(!existsSync(resolve(process.cwd(), 'src/features/weddings/detail/v2/WeddingContractFinanceWorkspace.tsx')), 'Classic contract finance chrome removed')
})

run('Modern finance CSS is a record, not a dashboard', () => {
  assert(modernCss.includes('.summaryAmount'), 'shared money family')
  assert(modernCss.includes('1fr 1fr 1fr 1.15fr 1fr'), 'five commercial columns')
  assert(!modernCss.includes('paymentBig'), 'no classic KPI class in css')
  assert(modernCss.includes('font-variant-numeric: tabular-nums'), 'tabular numerals')
  assert(modern.includes('min-height: 44px') || modernCss.includes('height: 44px'), 'touch')
})

run('H.3.2: one commercial summary row, Wartość umowy, no Termin minął', () => {
  assert(modern.includes('Wartość umowy'), 'finance CV label')
  assert(!modern.includes('Wartość zlecenia'), 'zlecenia copy gone from finance')
  assert(modern.includes('Wpłacono'), 'paid column')
  assert(modern.includes('Pozostało'), 'remaining column')
  assert(modern.includes('Termin płatności'), 'deadline in summary')
  assert(modern.includes('Dojazd'), 'travel in summary')
  assert(!modern.includes('Termin minął'), 'no redundant overdue sentence')
  assert(!modern.includes('po terminie'), 'no po terminie copy')
  assert(modern.includes('styles.summaryCol'), 'typographic summary not tiles')
  assert(modern.includes('data-testid="travel-fee-summary"'), 'travel in settlement')
  const travelAt = modern.indexOf('data-testid="travel-fee-summary"')
  const packageAt = modern.indexOf('Szczegóły pakietu')
  const ledgerAt = modern.indexOf('Płatności')
  assert(travelAt > 0 && ledgerAt > travelAt, 'summary then payments')
  assert(packageAt > ledgerAt, 'package after settlement')
  assert(modern.includes("from '@/components/icons'"), 'existing icon set')
  assert(modern.includes('IconCheck'), 'signed check from project icons')
  assert(modern.includes('statusPill'), 'status uses compact pill')
  assert(modern.includes('docActionPrimary'), 'Preview is the only emphasized operation')
  assert(modern.includes('data-testid="contract-operations"'), 'operations have a shared module')
  assert(modern.includes('aria-label="Dokument"'), 'document actions have a semantic group')
  assert(modern.includes('aria-label="Działania"'), 'contract actions have a semantic group')
  assert(modern.includes('>Dokument<'), 'document group is visibly labeled')
  assert(modern.includes('>Działania<'), 'workflow group is visibly labeled')
  assert(modern.includes('aria-label="Pobierz DOCX"'), 'compact DOCX label remains accessible')
  assert(modern.includes('aria-label={pdfDownload.busy ?'), 'compact PDF label remains accessible')
  assert(modern.includes('className={styles.docAction}'), 'all neutral and lifecycle actions share one style')
  assert(modernCss.includes('.operationsModuleWithContractActions'), 'operations use a two-group desktop layout')
  assert(modernCss.includes('@container contract-card (max-width: 760px)'), 'operation groups stack when desktop width is constrained')
  assert(modernCss.includes('grid-template-columns: minmax(max-content, 0.9fr) minmax(max-content, 1.1fr)'), 'desktop groups use the available width')
  assert(!modern.includes('workflowAction'), 'no separate lifecycle action styling')
  assert(modernCss.includes('height: 44px'), 'all actions share one height')
  assert(modernCss.includes('padding: 0 16px'), 'all actions share one horizontal padding')
  assert(modernCss.includes('flex-wrap: wrap'), 'operations wrap without horizontal scrolling')
  assert(modern.includes('Eye'), 'preview icon')
  assert(modern.includes('Download'), 'download icons')
  assert(modern.includes('RefreshCw'), 'regenerate icon')
  assert(modern.includes('Send'), 'mark-sent icon')
  assert(modern.includes('CircleCheck'), 'generated/sign icon')
  assert(modern.includes('History'), 'version history icon')
  assert(modern.includes('FileText'), 'questionnaire icon')
  assert(modern.includes('Paperclip'), 'source contract icon')
  assert(modern.includes('ChevronRight'), 'history chevron')
  assert(modern.includes('discloseLead'), 'info row left cluster')
  assert(modernCss.includes('grid-template-columns: minmax(0, 1fr) auto 16px'), 'utility rows align label, value and chevron')
  assert(!modernCss.includes('discloseTrail'), 'utility rows use direct aligned columns')
  assert(modernCss.includes('discloseIcon'), 'info row icon styles')
  assert(modernCss.includes('--button-primary-background'), 'primary action uses token family')
  assert(modern.includes('styles.packageFacts'), 'package fact grid')
  assert(modernCss.includes('repeat(4, minmax(0, 1fr))'), 'desktop package 4-col')
  assert(!modern.includes('contextMoney'), 'no inline CV/paid sentence')
  assert(!modern.includes('wygenerowano'), 'generated copy not restated')
  assert(modern.includes('finance-add-payment'), 'add payment kept')
  const addPayAt = modern.indexOf('data-testid="finance-add-payment"')
  const addPaySnippet = modern.slice(Math.max(0, addPayAt - 220), addPayAt)
  assert(addPaySnippet.includes('quietLink'), 'add payment sits in the heading')
  assert(!addPaySnippet.includes('<Button'), 'add payment is not a floating button')
  assert(modernCss.includes("data-kind='signed'"), 'one signed color cue')
  assert(!modernCss.includes('success-banner'), 'no success banner')
  assert(model.includes('dueTermsLabel'), 'due terms split from date')
  assert(
    workspace.includes('resolveWeddingEditOverlayPresentation') &&
      workspace.includes('editorSection'),
    'package/finances reuse centered overlay on this tab',
  )
})

run('F1.3: deadline date is primary; current contract exposes DOCX+PDF via Preview path', () => {
  const dueAt = modern.indexOf('Termin płatności')
  const dueBlock = modern.slice(dueAt, modern.indexOf('Dojazd', dueAt))
  assert(
    dueBlock.indexOf('dueDateOnly') < dueBlock.indexOf('dueTermsLabel'),
    'date renders before payment-rule support',
  )
  assert(!dueBlock.includes('Termin minął'), 'no termin minął in deadline')
  assert(!dueBlock.includes('po terminie'), 'no po terminie in deadline')
  assert(modern.includes('Pobierz DOCX'), 'docx labeled')
  assert(modern.includes('Pobierz PDF'), 'pdf labeled')
  assert(modern.includes('useContractPdfDownload'), 'reuses preview PDF hook')
  assert(modern.includes('documentStorage.download'), 'PDF loads DOCX via known filePath')
  assert(modern.includes("'generated-wedding-contract-docx-bytes'"), 'shares Preview DOCX bytes cache')
  assert(!modern.includes("downloadContract(latest, 'pdf')"), 'no stored-PDF shortcut')
  assert(
    modern.includes('documentStorage.signedUrl') ||
      modern.includes('getArtifactDownloadUrl'),
    'DOCX download uses signed URL',
  )
  const preview = modern.indexOf('Podgląd')
  const docx = modern.indexOf('Pobierz DOCX')
  const pdf = modern.indexOf('Pobierz PDF')
  assert(preview > 0 && docx > preview && pdf > docx, 'Podgląd → DOCX → PDF')
  assert(modern.includes('Przygotowywanie PDF…'), 'reuses Preview busy copy')
  const pdfUi = read(
    'src/features/documents/contract-experience/ContractPdfActions.tsx',
  )
  const pdfHook = read(
    'src/features/documents/contract-experience/useContractPdfDownload.ts',
  )
  const ready = read(
    'src/features/documents/contract-experience/ContractReadyPreview.tsx',
  )
  assert(pdfHook.includes('export function useContractPdfDownload'), 'shared hook')
  assert(pdfUi.includes('useContractPdfDownload'), 'preview actions use the hook')
  assert(ready.includes('ContractPdfActions'), 'preview still mounts PDF actions')
  assert(ready.includes('Pobierz DOCX'), 'preview still has DOCX')
  assert(!modernCss.includes('.summaryCol[data-tone=\'overdue\'] .summarySupport'), 'support line stays secondary')
})
