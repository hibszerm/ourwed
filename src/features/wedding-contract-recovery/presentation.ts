import type { RecoveryFieldComparison, RecoveryProposal, RecoverySectionKey } from './types'

export type RecoveryDecisionGroup = {
  id: string
  sectionKey: RecoveryPresentationSectionKey
  label: string
  fields: RecoveryFieldComparison[]
  actionableFields: RecoveryFieldComparison[]
  currentValue: string
  extractedValue: string
  action: 'use_extracted' | 'keep_current' | 'skip' | 'mixed'
  state: RecoveryFieldComparison['state']
}

type RecoveryPresentationSectionKey = RecoverySectionKey | 'travel' | 'deadlines'

const SECTION_ORDER: RecoveryPresentationSectionKey[] = [
  'clients', 'contact', 'wedding', 'locations', 'package',
  'additional_services', 'finances', 'travel', 'deadlines', 'other', 'source_document',
]

const SECTION_LABELS: Record<RecoveryPresentationSectionKey, string> = {
  clients: 'Para',
  contact: 'Kontakt',
  wedding: 'Ślub',
  locations: 'Miejsca',
  package: 'Pakiet',
  additional_services: 'Usługi dodatkowe',
  finances: 'Finanse',
  travel: 'Dojazd',
  deadlines: 'Terminy',
  other: 'Pozostałe ustalenia',
  source_document: 'Dokument źródłowy',
}

const HIDDEN_IDENTITY_COMPONENTS = new Set([
  'partner1.firstName', 'partner1.lastName', 'partner2.firstName', 'partner2.lastName',
])
const ADDRESS_KEYS = new Set(['partner1.addressLine', 'partner1.postalCode', 'partner1.city'])

function addressText(fields: RecoveryFieldComparison[], side: 'currentValue' | 'extractedValue'): string {
  const labels: Record<string, string> = {
    'partner1.addressLine': 'Ulica',
    'partner1.postalCode': 'Kod pocztowy',
    'partner1.city': 'Miejscowość',
  }
  return fields
    .map((field) => ({ field, value: valueText(field[side]) }))
    .filter(({ value }) => value !== '—')
    .map(({ field, value }) => `${labels[field.fieldKey] ?? field.label}: ${value}`)
    .join(' · ') || '—'
}

const HUMAN_LABELS: Record<string, string> = {
  'partner1.fullName': 'Osoba 1',
  'partner2.fullName': 'Osoba 2',
  'partner1.address': 'Adres osoby 1',
  'partner1.email': 'E-mail osoby 1',
  'partner1.phone': 'Telefon osoby 1',
  'partner1.addressLine': 'Adres osoby 1 — ulica',
  'partner1.postalCode': 'Adres osoby 1 — kod pocztowy',
  'partner1.city': 'Adres osoby 1 — miejscowość',
  'partner2.email': 'E-mail osoby 2',
  'partner2.phone': 'Telefon osoby 2',
  'wedding.date': 'Data ślubu',
  'wedding.ceremonyTime': 'Godzina ceremonii',
  'delivery.dueDate': 'Termin oddania materiałów',
  'location.ceremony': 'Miejsce ceremonii',
  'location.reception': 'Miejsce przyjęcia',
  'location.bridePreparation': 'Przygotowania panny młodej',
  'location.groomPreparation': 'Przygotowania pana młodego',
  'finances.contractValue': 'Wartość umowy',
  'finances.depositAmount': 'Zaliczka umowna',
  'finances.currency': 'Waluta',
  'finances.finalPaymentDueDate': 'Termin płatności końcowej',
  'finances.paymentTermsText': 'Warunki płatności',
  'finances.travelStatus': 'Dojazd',
  'finances.travelAmount': 'Koszt dojazdu',
  'package.name': 'Pakiet z umowy',
  'document.signingDate': 'Data podpisania umowy',
  'document.contractNumber': 'Numer umowy',
}

function valueText(value: unknown): string {
  return value == null || value === '' ? '—' : String(value)
}

function buildGroup(id: string, fields: RecoveryFieldComparison[]): RecoveryDecisionGroup {
  const first = fields[0]
  const sectionKey: RecoveryPresentationSectionKey = first.fieldKey === 'finances.travelStatus' || first.fieldKey === 'finances.travelAmount'
    ? 'travel'
    : first.fieldKey === 'delivery.dueDate' || first.fieldKey === 'finances.depositDueDate' || first.fieldKey === 'finances.finalPaymentDueDate'
      ? 'deadlines'
      : first.sectionKey
  const actionableFields = fields.filter((field) =>
    field.state === 'missing_current' || field.state === 'different',
  )
  const selectedCount = actionableFields.filter((field) => field.selectedAction === 'use_extracted').length
  const action = selectedCount === 0
    ? actionableFields.length === 0 && fields.every((field) => field.state === 'same') ? 'skip' : 'keep_current'
    : selectedCount === actionableFields.length ? 'use_extracted' : 'mixed'
  const state = fields.some((field) => field.state === 'different')
    ? 'different'
    : fields.some((field) => field.state === 'missing_current')
      ? 'missing_current'
      : first.state

  return {
    id,
    sectionKey,
    label: HUMAN_LABELS[id] ?? first.label,
    fields,
    actionableFields,
    currentValue: id === 'partner1.address' ? addressText(fields, 'currentValue') : fields.map((field) => valueText(field.currentValue)).filter((value) => value !== '—').join(', ') || '—',
    extractedValue: id === 'partner1.address' ? addressText(fields, 'extractedValue') : fields.map((field) => valueText(field.extractedValue)).filter((value) => value !== '—').join(', ') || '—',
    action,
    state,
  }
}

export function buildRecoveryDecisionGroups(fields: RecoveryFieldComparison[]): RecoveryDecisionGroup[] {
  const visible = fields.filter((field) =>
    field.state !== 'missing_extracted' && !HIDDEN_IDENTITY_COMPONENTS.has(field.fieldKey),
  )
  const groups: RecoveryDecisionGroup[] = []
  const consumed = new Set<string>()

  const addressFields = visible.filter((field) => ADDRESS_KEYS.has(field.fieldKey))
  if (addressFields.length > 0) {
    addressFields.forEach((field) => consumed.add(field.fieldKey))
    groups.push(buildGroup('partner1.address', addressFields))
  }

  for (const field of visible) {
    if (consumed.has(field.fieldKey)) continue
    consumed.add(field.fieldKey)

    // fullName is the single applyable authority for an identity; name parts are informational.
    groups.push(buildGroup(field.fieldKey, [field]))
  }

  const sectionIndex = new Map<RecoveryPresentationSectionKey, number>(SECTION_ORDER.map((key, index) => [key, index]))
  return groups.sort((a, b) =>
    (sectionIndex.get(a.sectionKey) ?? 99) - (sectionIndex.get(b.sectionKey) ?? 99),
  )
}

function hasReviewValue(value: string): boolean {
  const normalized = value.trim()
  return normalized.length > 0 && normalized !== '—'
}

/** Presentation-only filter: preserve persisted fields and Apply decisions while omitting empty rows. */
export function buildRecoveryReviewGroups(fields: RecoveryFieldComparison[]): RecoveryDecisionGroup[] {
  return buildRecoveryDecisionGroups(fields).filter((group) =>
    hasReviewValue(group.currentValue) || hasReviewValue(group.extractedValue),
  )
}

/** Read-only confirmation rows are the selected, applicable logical decisions already used by Apply. */
export function buildRecoveryConfirmationGroups(fields: RecoveryFieldComparison[]): RecoveryDecisionGroup[] {
  return buildRecoveryReviewGroups(fields).filter((group) =>
    group.actionableFields.some((field) => field.selectedAction === 'use_extracted'),
  )
}

export function recoverySectionLabel(sectionKey: RecoveryPresentationSectionKey): string {
  return SECTION_LABELS[sectionKey]
}

export function recoveryLogicalSelectionCount(
  fields: RecoveryFieldComparison[],
  proposal: RecoveryProposal | null,
  includePackage: boolean,
): number {
  return buildRecoveryApplySelection(fields, proposal, includePackage).logicalCount
}

export function buildRecoveryApplySelection(
  fields: RecoveryFieldComparison[],
  proposal: RecoveryProposal | null,
  includePackage: boolean,
) {
  const decisions = fields.map((field) => ({
    fieldKey: field.fieldKey,
    action: field.selectedAction,
  }))
  const selectedExtraIndexes = proposal?.extraProposals.flatMap((extra) =>
    extra.selected && extra.applicable ? [extra.sourceIndex] : [],
  ) ?? []
  const selectedNoteIndexes = proposal?.noteProposals.flatMap((note) =>
    note.selected ? [note.sourceIndex] : [],
  ) ?? []
  const includePackageSnapshot = Boolean(includePackage && proposal?.packageSnapshotProposal)
  const selectedGroups = buildRecoveryDecisionGroups(fields).filter((group) =>
    group.actionableFields.some((field) => field.selectedAction === 'use_extracted'),
  )
  const packageNameSelected = selectedGroups.some((group) => group.id === 'package.name')
  const fieldCount = selectedGroups.filter((group) => group.id !== 'package.name').length
  return {
    decisions,
    selectedExtraIndexes,
    selectedNoteIndexes,
    includePackageSnapshot,
    logicalCount: fieldCount + selectedExtraIndexes.length + selectedNoteIndexes.length + Number(includePackageSnapshot || packageNameSelected),
  }
}

export function prepareRecoveryProposalForReview(proposal: RecoveryProposal): RecoveryProposal {
  return {
    ...proposal,
    // Notes may include consent or rights language; keep them opt-in in the UI.
    noteProposals: proposal.noteProposals.map((note) => ({ ...note, selected: false })),
  }
}

export function formatSelectedChangeCount(count: number): { noun: string; sentence: string } {
  const lastTwo = count % 100
  const last = count % 10
  const plural = lastTwo >= 12 && lastTwo <= 14 ? 'zmian' : last >= 2 && last <= 4 ? 'zmiany' : 'zmian'
  if (count === 1) return { noun: 'zmianę', sentence: '1 zmiana zostanie zastosowana' }
  if (count === 0) return { noun: 'zmian', sentence: 'Nie wybrano zmian do zapisania' }
  return plural === 'zmiany'
    ? { noun: plural, sentence: `${count} zmiany zostaną zastosowane` }
    : { noun: plural, sentence: `${count} zmian zostanie zastosowanych` }
}

export function formatRecoveryValue(field: RecoveryFieldComparison, value: unknown, currencyCode = 'PLN'): string {
  if (value == null || value === '') return '—'
  const raw = String(value)
  if (field.fieldKey === 'wedding.date' || field.fieldKey === 'delivery.dueDate' ||
    field.fieldKey === 'finances.finalPaymentDueDate' || field.fieldKey === 'document.signingDate') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
    if (match) {
      const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
      return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
    }
  }
  if (['finances.contractValue', 'finances.depositAmount', 'finances.travelAmount'].includes(field.fieldKey)) {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numeric)) {
      try {
        return new Intl.NumberFormat('pl-PL', {
          style: 'currency', currency: currencyCode, minimumFractionDigits: 0, maximumFractionDigits: 2,
        }).format(numeric)
      } catch {
        return `${new Intl.NumberFormat('pl-PL').format(numeric)} ${currencyCode}`
      }
    }
  }
  if (field.fieldKey === 'finances.travelStatus') {
    if (raw === 'included') return 'W cenie pakietu'
    if (raw === 'charged') return 'Płatny dojazd'
    if (raw === 'free') return 'Bezpłatny dojazd'
  }
  return raw
}
