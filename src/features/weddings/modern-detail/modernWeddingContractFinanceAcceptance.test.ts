/**
 * Modern Wedding Detail — Umowa i finanse presentation acceptance.
 * Run: npm run test:modern-wedding-detail
 */

import { readFileSync } from 'node:fs'
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
const classic = read(
  'src/features/weddings/detail/v2/WeddingContractFinanceWorkspace.tsx',
)
const classicCss = read(
  'src/features/weddings/detail/v2/WeddingDetailV2.module.css',
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
  assert(classic.includes('WeddingContractFinanceWorkspace'), 'classic remains')
  assert(classic.includes('max-width: 880px') === false, 'classic width lives in css')
  assert(classicCss.includes('max-width: 880px'), 'classic 880px untouched')
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
  assert(!modern.includes('GenerateContractModal'), 'legacy modal not activated')
  assert(!modern.includes('payment.dueDate'), 'no payment dueDate UI')
  assert(!modern.includes('Wyślij umowę'), 'no send invention')
  assert(!modern.includes('TravelMap'), 'no logistics map')
  assert(modern.includes("queryKey: ['generated-wedding-contracts'"), 'same contract key')
  assert(modern.includes("'package-contract-for-wedding'"), 'same template key')
  assert(modern.includes("queryKey: ['wedding-source-contracts'"), 'same source key')
})

run('Visual language is three composed sheets, not Classic settings stack', () => {
  assert(modernCss.includes('border-radius: 18px'), 'ivory sheet radius')
  assert(!modernCss.includes('max-width: 880px'), 'no classic column')
  assert(!modern.includes('paymentBig'), 'no classic KPI class')
  assert(modern.includes('>Umowa<') || modern.includes('Umowa'), 'contract section')
  assert(modern.includes('Rozliczenie'), 'settlement section')
  assert(modern.includes('Szczegóły pakietu'), 'package chapter')
  assert(!modern.includes('Warunki umowy'), 'old terms heading removed')
  assert(!modern.includes('Aktualna umowa'), 'no redundant current-contract heading')
  assert(!modernCss.includes('stateBanner'), 'no green status banner')
  assert(modern.includes('Umowa źródłowa'), 'recovery kept')
  assert(modern.includes('toggleUtility'), 'recovery is disclosure')
  assert(modern.includes('Dane z ankiety'), 'questionnaire kept')
  assert(!modern.includes('SendQuestionnaireModal'), 'no send questionnaire here')
  assert(model.includes("line: 'Nie wysłano'"), 'P5 — not_sent is provenance, not Oczekuje')
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
  assert(classic.includes('Pakiet i usługi'), 'classic package section remains')
  assert(classic.includes('Umowy źródłowe') === false, 'classic recovery is a child panel')
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
    workspace.includes("editorSection === 'package'") &&
      workspace.includes("editorSection === 'finances'"),
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
  assert(modern.includes('downloadArtifact'), 'PDF loads the final DOCX artifact')
  assert(modern.includes("'generated-wedding-contract-docx-bytes'"), 'shares Preview DOCX bytes cache')
  assert(!modern.includes("downloadContract(latest, 'pdf')"), 'no stored-PDF shortcut')
  assert(
    !modern.includes("getArtifactDownloadUrl(\n        wedding.id,\n        contract.draft.id,\n        format,"),
    'DOCX download stays format-locked to docx',
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
