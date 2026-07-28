import { splitPersonName } from '@/lib/api/weddings/weddingMappers'
import { isAbsentPartnerName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { WEDDING_CONTRACT_RECOVERY_VERSION } from './constants'
import type {
  ContractRecoveryExtraction,
  RecoveryComparisonState,
  RecoveryDecisionAction,
  RecoveryFieldComparison,
  RecoveryProposal,
  RecoverySectionKey,
  RecoverySectionSummary,
} from './types'
import type { Wedding } from '@/types/wedding'

type FieldDef = {
  fieldKey: string
  sectionKey: RecoverySectionKey
  label: string
  getCurrent: (wedding: Wedding) => string | number | null
  getExtracted: (extraction: ContractRecoveryExtraction) => string | number | null
  comparable?: boolean
}

function compareValues(
  current: string | number | null,
  extracted: string | number | null,
): RecoveryComparisonState {
  if (extracted == null || extracted === '') return 'missing_extracted'
  const hasCurrent = current != null && current !== ''
  if (!hasCurrent) return 'missing_current'
  const normCurrent = typeof current === 'number' ? current : String(current).trim()
  const normExtracted =
    typeof extracted === 'number' ? extracted : String(extracted).trim()
  if (normCurrent === normExtracted) return 'same'
  if (typeof normCurrent === 'number' && typeof normExtracted === 'number') {
    return Math.abs(normCurrent - normExtracted) < 0.01 ? 'same' : 'different'
  }
  return String(normCurrent).toLowerCase() === String(normExtracted).toLowerCase()
    ? 'same'
    : 'different'
}

function defaultAction(state: RecoveryComparisonState): RecoveryDecisionAction {
  if (state === 'missing_current') return 'use_extracted'
  if (state === 'same') return 'skip'
  if (state === 'different') return 'keep_current'
  return 'skip'
}

function resolveExtractedMeta(
  extraction: ContractRecoveryExtraction,
  fieldKey: string,
): {
  confidence: number | null
  evidence: RecoveryFieldComparison['evidence']
  warnings: string[]
  rawValue?: string | null
  value?: string | number | null
} {
  const empty = {
    confidence: null,
    evidence: [] as RecoveryFieldComparison['evidence'],
    warnings: [] as string[],
  }

  const pickString = (field: { confidence: number; evidence: RecoveryFieldComparison['evidence']; warnings: string[]; value: string | null; rawValue?: string | null }) => ({
    confidence: field.confidence,
    evidence: field.evidence,
    warnings: field.warnings,
    rawValue: field.rawValue,
    value: field.value,
  })

  const pickNumber = (field: { confidence: number; evidence: RecoveryFieldComparison['evidence']; warnings: string[]; value: number | null; rawValue?: string | null }) => ({
    confidence: field.confidence,
    evidence: field.evidence,
    warnings: field.warnings,
    rawValue: field.rawValue,
    value: field.value,
  })

  switch (fieldKey) {
    case 'partner1.fullName':
      return pickString(extraction.clients.partner1.fullName)
    case 'partner1.firstName':
      return pickString(extraction.clients.partner1.firstName)
    case 'partner1.lastName':
      return pickString(extraction.clients.partner1.lastName)
    case 'partner2.fullName':
      return pickString(extraction.clients.partner2.fullName)
    case 'partner2.firstName':
      return pickString(extraction.clients.partner2.firstName)
    case 'partner2.lastName':
      return pickString(extraction.clients.partner2.lastName)
    case 'partner1.email':
      return pickString(extraction.clients.partner1.email)
    case 'partner1.phone':
      return pickString(extraction.clients.partner1.phone)
    case 'partner1.addressLine':
      return pickString(extraction.clients.partner1.addressLine)
    case 'partner1.postalCode':
      return pickString(extraction.clients.partner1.postalCode)
    case 'partner1.city':
      return pickString(extraction.clients.partner1.city)
    case 'partner2.email':
      return pickString(extraction.clients.partner2.email)
    case 'partner2.phone':
      return pickString(extraction.clients.partner2.phone)
    case 'wedding.date':
      return pickString(extraction.wedding.weddingDate)
    case 'wedding.ceremonyTime':
      return pickString(extraction.wedding.ceremonyTime)
    case 'location.ceremony':
      return pickString(extraction.wedding.ceremonyLocation)
    case 'location.reception':
      return pickString(extraction.wedding.receptionLocation)
    case 'location.bridePreparation':
      return pickString(extraction.wedding.bridePreparationLocation)
    case 'location.groomPreparation':
      return pickString(extraction.wedding.groomPreparationLocation)
    case 'finances.contractValue':
      return pickNumber(extraction.finances.totalContractValue)
    case 'finances.depositAmount':
      return pickNumber(extraction.finances.depositAmount)
    case 'finances.currency':
      return pickString(extraction.finances.currency)
    case 'finances.finalPaymentDueDate':
      return pickString(extraction.finances.finalPaymentDueDate)
    case 'finances.paymentTermsText':
      return pickString(extraction.finances.paymentTermsText)
    case 'package.name':
      return pickString(extraction.contractedPackage.name)
    case 'document.signingDate':
      return pickString(extraction.document.signingDate)
    case 'document.contractNumber':
      return pickString(extraction.document.contractNumber)
    default:
      return empty
  }
}

function buildFieldComparison(
  def: FieldDef,
  wedding: Wedding,
  extraction: ContractRecoveryExtraction,
): RecoveryFieldComparison {
  const currentValue = def.getCurrent(wedding)
  const extractedValue = def.getExtracted(extraction)
  let state = compareValues(currentValue, extractedValue)

  const meta = resolveExtractedMeta(extraction, def.fieldKey)
  const warnings = [...meta.warnings]
  const confidence = meta.confidence
  const evidence = meta.evidence

  if (meta.value == null && meta.rawValue) {
    state = 'invalid_extracted'
  }

  if (def.comparable === false) state = 'unsupported'

  const selectedAction =
    state === 'invalid_extracted' || state === 'missing_extracted' || state === 'unsupported'
      ? 'skip'
      : defaultAction(state)

  return {
    fieldKey: def.fieldKey,
    sectionKey: def.sectionKey,
    label: def.label,
    currentValue,
    extractedValue,
    normalizedCurrentValue: currentValue,
    normalizedExtractedValue: extractedValue,
    state,
    confidence,
    evidence,
    warnings,
    selectedAction,
  }
}

const FIELD_DEFS: FieldDef[] = [
  {
    fieldKey: 'partner1.fullName',
    sectionKey: 'clients',
    label: 'Klient 1 — imię i nazwisko',
    getCurrent: (w) => w.couple.partner1?.trim() || null,
    getExtracted: (e) => e.clients.partner1.fullName.value,
  },
  {
    fieldKey: 'partner1.firstName',
    sectionKey: 'clients',
    label: 'Klient 1 — imię',
    getCurrent: (w) =>
      w.couple.partner1FirstName?.trim() ||
      splitPersonName(w.couple.partner1).first ||
      null,
    getExtracted: (e) => e.clients.partner1.firstName.value,
  },
  {
    fieldKey: 'partner1.lastName',
    sectionKey: 'clients',
    label: 'Klient 1 — nazwisko',
    getCurrent: (w) =>
      w.couple.partner1LastName?.trim() ||
      splitPersonName(w.couple.partner1).last ||
      null,
    getExtracted: (e) => e.clients.partner1.lastName.value,
  },
  {
    fieldKey: 'partner2.fullName',
    sectionKey: 'clients',
    label: 'Klient 2 — imię i nazwisko',
    getCurrent: (w) =>
      isAbsentPartnerName(w.couple.partner2) ? null : w.couple.partner2?.trim() || null,
    getExtracted: (e) => e.clients.partner2.fullName.value,
  },
  {
    fieldKey: 'partner2.firstName',
    sectionKey: 'clients',
    label: 'Klient 2 — imię',
    getCurrent: (w) =>
      isAbsentPartnerName(w.couple.partner2)
        ? null
        : w.couple.partner2FirstName?.trim() ||
          splitPersonName(w.couple.partner2).first ||
          null,
    getExtracted: (e) => e.clients.partner2.firstName.value,
  },
  {
    fieldKey: 'partner2.lastName',
    sectionKey: 'clients',
    label: 'Klient 2 — nazwisko',
    getCurrent: (w) =>
      isAbsentPartnerName(w.couple.partner2)
        ? null
        : w.couple.partner2LastName?.trim() ||
          splitPersonName(w.couple.partner2).last ||
          null,
    getExtracted: (e) => e.clients.partner2.lastName.value,
  },
  {
    fieldKey: 'partner1.email',
    sectionKey: 'contact',
    label: 'E-mail klienta 1',
    getCurrent: (w) => w.couple.partner1Email?.trim() || w.couple.email?.trim() || null,
    getExtracted: (e) => e.clients.partner1.email.value,
  },
  {
    fieldKey: 'partner1.phone',
    sectionKey: 'contact',
    label: 'Telefon klienta 1',
    getCurrent: (w) => w.couple.partner1Phone?.trim() || w.couple.phone?.trim() || null,
    getExtracted: (e) => e.clients.partner1.phone.value,
  },
  {
    fieldKey: 'partner1.addressLine',
    sectionKey: 'contact',
    label: 'Adres klienta 1',
    getCurrent: (w) => w.couple.partner1Address?.trim() || null,
    getExtracted: (e) => e.clients.partner1.addressLine.value,
  },
  {
    fieldKey: 'partner1.postalCode',
    sectionKey: 'contact',
    label: 'Kod pocztowy klienta 1',
    getCurrent: (w) => w.couple.partner1PostalCode?.trim() || null,
    getExtracted: (e) => e.clients.partner1.postalCode.value,
  },
  {
    fieldKey: 'partner1.city',
    sectionKey: 'contact',
    label: 'Miasto klienta 1',
    getCurrent: (w) => w.couple.partner1City?.trim() || w.couple.city?.trim() || null,
    getExtracted: (e) => e.clients.partner1.city.value,
  },
  {
    fieldKey: 'partner2.email',
    sectionKey: 'contact',
    label: 'E-mail klienta 2',
    getCurrent: (w) => w.couple.partner2Email?.trim() || null,
    getExtracted: (e) => e.clients.partner2.email.value,
  },
  {
    fieldKey: 'partner2.phone',
    sectionKey: 'contact',
    label: 'Telefon klienta 2',
    getCurrent: (w) => w.couple.partner2Phone?.trim() || null,
    getExtracted: (e) => e.clients.partner2.phone.value,
  },
  {
    fieldKey: 'wedding.date',
    sectionKey: 'wedding',
    label: 'Data ślubu',
    getCurrent: (w) => w.date?.trim() || null,
    getExtracted: (e) => e.wedding.weddingDate.value,
  },
  {
    fieldKey: 'wedding.ceremonyTime',
    sectionKey: 'wedding',
    label: 'Godzina ceremonii',
    getCurrent: (w) => w.ceremonyTime?.trim() || null,
    getExtracted: (e) => e.wedding.ceremonyTime.value,
  },
  {
    fieldKey: 'location.ceremony',
    sectionKey: 'locations',
    label: 'Miejsce ceremonii',
    getCurrent: (w) => w.ceremonyLocation?.trim() || null,
    getExtracted: (e) => e.wedding.ceremonyLocation.value,
  },
  {
    fieldKey: 'location.reception',
    sectionKey: 'locations',
    label: 'Miejsce przyjęcia',
    getCurrent: (w) => w.receptionLocation?.trim() || null,
    getExtracted: (e) => e.wedding.receptionLocation.value,
  },
  {
    fieldKey: 'location.bridePreparation',
    sectionKey: 'locations',
    label: 'Przygotowania panny młodej',
    getCurrent: (w) => w.bridePreparationLocation?.trim() || null,
    getExtracted: (e) => e.wedding.bridePreparationLocation.value,
  },
  {
    fieldKey: 'location.groomPreparation',
    sectionKey: 'locations',
    label: 'Przygotowania pana młodego',
    getCurrent: (w) => w.groomPreparationLocation?.trim() || null,
    getExtracted: (e) => e.wedding.groomPreparationLocation.value,
  },
  {
    fieldKey: 'finances.contractValue',
    sectionKey: 'finances',
    label: 'Wartość umowy',
    getCurrent: (w) => (w.price > 0 ? w.price : null),
    getExtracted: (e) => e.finances.totalContractValue.value,
  },
  {
    fieldKey: 'finances.depositAmount',
    sectionKey: 'finances',
    label: 'Zaliczka umowna',
    getCurrent: (w) =>
      w.depositAmount != null && w.depositAmount > 0 ? w.depositAmount : null,
    getExtracted: (e) => e.finances.depositAmount.value,
  },
  {
    fieldKey: 'finances.currency',
    sectionKey: 'finances',
    label: 'Waluta',
    getCurrent: (w) => w.currency?.trim() || null,
    getExtracted: (e) => e.finances.currency.value,
  },
  {
    fieldKey: 'finances.finalPaymentDueDate',
    sectionKey: 'finances',
    label: 'Termin płatności końcowej',
    getCurrent: (w) => w.finalPaymentDueDate?.trim() || null,
    getExtracted: (e) => e.finances.finalPaymentDueDate.value,
  },
  {
    fieldKey: 'finances.paymentTermsText',
    sectionKey: 'finances',
    label: 'Warunki płatności',
    getCurrent: () => null,
    getExtracted: (e) => e.finances.paymentTermsText.value,
    comparable: true,
  },
  {
    fieldKey: 'package.name',
    sectionKey: 'package',
    label: 'Nazwa pakietu z umowy',
    getCurrent: (w) => w.packageName?.trim() || null,
    getExtracted: (e) => e.contractedPackage.name.value,
  },
  {
    fieldKey: 'document.signingDate',
    sectionKey: 'other',
    label: 'Data podpisania umowy',
    getCurrent: () => null,
    getExtracted: (e) => e.document.signingDate.value,
    comparable: true,
  },
  {
    fieldKey: 'document.contractNumber',
    sectionKey: 'other',
    label: 'Numer umowy',
    getCurrent: () => null,
    getExtracted: (e) => e.document.contractNumber.value,
    comparable: true,
  },
]

const SECTION_LABELS: Record<RecoverySectionKey, string> = {
  clients: 'Dane klientów',
  contact: 'Kontakt',
  wedding: 'Ślub',
  locations: 'Miejsca',
  finances: 'Umowa i finanse',
  package: 'Pakiet z umowy',
  additional_services: 'Usługi dodatkowe',
  other: 'Pozostałe ustalenia',
  source_document: 'Dokument źródłowy',
}

function summarizeSection(
  sectionKey: RecoverySectionKey,
  fields: RecoveryFieldComparison[],
): RecoverySectionSummary {
  const sectionFields = fields.filter((f) => f.sectionKey === sectionKey)
  const withExtracted = sectionFields.filter(
    (f) => f.state !== 'missing_extracted' && f.state !== 'unsupported',
  )
  const valid = withExtracted.filter((f) => f.state !== 'invalid_extracted')
  const needsReview = valid.filter(
    (f) => f.state === 'different' || f.state === 'missing_current',
  )

  let status: RecoverySectionSummary['status'] = 'missing'
  if (valid.length === 0) status = 'missing'
  else if (needsReview.length > 0) status = 'review'
  else if (withExtracted.length > valid.length) status = 'partial'
  else if (valid.every((f) => f.state === 'same' || f.state === 'missing_extracted'))
    status = 'found'
  else status = 'partial'

  return {
    sectionKey,
    label: SECTION_LABELS[sectionKey],
    status,
  }
}

export const APPLYABLE_FIELD_KEYS = new Set(
  FIELD_DEFS.filter((d) => d.comparable !== false).map((d) => d.fieldKey),
)

export function buildRecoveryProposal(
  wedding: Wedding,
  extraction: ContractRecoveryExtraction,
): RecoveryProposal {
  const fields = FIELD_DEFS.map((def) => buildFieldComparison(def, wedding, extraction))

  const packageItems = extraction.contractedPackage.includedItems
    .map((item) => item.text.trim())
    .filter(Boolean)
  const hasPackageContent =
    Boolean(extraction.contractedPackage.name.value) ||
    Boolean(extraction.contractedPackage.originalDescription.value) ||
    packageItems.length > 0

  const packageSnapshotProposal = hasPackageContent
    ? {
        name: extraction.contractedPackage.name.value,
        originalDescription: extraction.contractedPackage.originalDescription.value,
        includedItems: packageItems,
        coverageHours: extraction.contractedPackage.coverageHours?.value ?? null,
        coverageTimeRange: extraction.contractedPackage.coverageTimeRange?.value ?? null,
        deliveryDeadlineText:
          extraction.contractedPackage.deliveryDeadlineText?.value ?? null,
        selectedAction: 'use_extracted' as RecoveryDecisionAction,
      }
    : null

  const toUpdate = fields.filter((f) => f.selectedAction === 'use_extracted').length
  const unchanged = fields.filter((f) => f.state === 'same').length
  const conflictsKept = fields.filter(
    (f) => f.state === 'different' && f.selectedAction === 'keep_current',
  ).length
  const invalid = fields.filter((f) => f.state === 'invalid_extracted').length

  const sectionKeys: RecoverySectionKey[] = [
    'clients',
    'contact',
    'wedding',
    'locations',
    'finances',
    'package',
    'additional_services',
    'other',
  ]

  return {
    version: WEDDING_CONTRACT_RECOVERY_VERSION,
    fields,
    sections: sectionKeys.map((key) => summarizeSection(key, fields)),
    packageSnapshotProposal,
    summary: {
      toUpdate: toUpdate + (packageSnapshotProposal ? 1 : 0),
      unchanged,
      conflictsKept,
      invalid,
      packageSnapshot: Boolean(packageSnapshotProposal),
    },
  }
}

export function applyDecisionsToProposal(
  proposal: RecoveryProposal,
  decisions: Array<{ fieldKey: string; action: RecoveryDecisionAction }>,
  includePackageSnapshot: boolean,
): RecoveryProposal {
  const decisionMap = new Map(decisions.map((d) => [d.fieldKey, d.action]))
  const fields = proposal.fields.map((field) => {
    const action = decisionMap.get(field.fieldKey)
    if (!action) return field
    if (
      field.state === 'invalid_extracted' ||
      field.state === 'missing_extracted' ||
      field.state === 'unsupported'
    ) {
      return { ...field, selectedAction: 'skip' as const }
    }
    return { ...field, selectedAction: action }
  })

  const packageSnapshotProposal = proposal.packageSnapshotProposal
    ? {
        ...proposal.packageSnapshotProposal,
        selectedAction: includePackageSnapshot
          ? ('use_extracted' as RecoveryDecisionAction)
          : ('skip' as RecoveryDecisionAction),
      }
    : null

  const toUpdate = fields.filter((f) => f.selectedAction === 'use_extracted').length
  const unchanged = fields.filter((f) => f.state === 'same').length
  const conflictsKept = fields.filter(
    (f) => f.state === 'different' && f.selectedAction === 'keep_current',
  ).length
  const invalid = fields.filter((f) => f.state === 'invalid_extracted').length

  return {
    ...proposal,
    fields,
    packageSnapshotProposal,
    summary: {
      toUpdate: toUpdate + (packageSnapshotProposal?.selectedAction === 'use_extracted' ? 1 : 0),
      unchanged,
      conflictsKept,
      invalid,
      packageSnapshot: packageSnapshotProposal?.selectedAction === 'use_extracted',
    },
  }
}
