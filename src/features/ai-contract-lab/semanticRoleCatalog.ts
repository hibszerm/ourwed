/**
 * Semantic Catalog V2 — document meaning only.
 * Roles never encode application field keys (no package.price, finances.*, …).
 * Business mapping lives exclusively in Phase B (`semanticDomainMapping.ts`).
 *
 * Phase A may still emit legacy aliases (e.g. package_price); normalize before mapping.
 */

export type SemanticValueKind =
  | 'text'
  | 'date'
  | 'money'
  | 'duration'
  | 'hours'
  | 'time_of_day'
  | 'phone'
  | 'email'
  | 'address'
  | 'location'
  | 'nip'
  | 'regon'
  | 'account'
  | 'package_name'
  | 'package_item'
  | 'legal_reference'
  | 'defined_term'
  | 'person_name'

export type SemanticPatchGroupKind =
  | 'contract_value'
  | 'remaining_amount'
  | 'deposit'
  | 'wedding_date'
  | 'company_identity'
  | 'package'
  | 'location'
  | 'bank_account'
  | 'other'

export type SemanticRoleDefinition = {
  id: string
  /** Legacy / synonym role ids still accepted from Phase A. */
  aliases: string[]
  meaning: string
  valueKind: SemanticValueKind
  /** Hint only — real targets are Phase B domain mappings. */
  canonicalTargets: string[]
  patchGroup: SemanticPatchGroupKind
}

/**
 * Primary semantic roles (business-independent).
 * Aliases keep Phase A compatibility without duplicate meanings.
 */
export const SEMANTIC_ROLE_DEFINITIONS: readonly SemanticRoleDefinition[] = [
  {
    id: 'contract_date',
    aliases: [],
    meaning: 'Date the contract was executed / signed.',
    valueKind: 'date',
    canonicalTargets: ['contract_execution_date'],
    patchGroup: 'wedding_date',
  },
  {
    id: 'contract_execution_date',
    aliases: [],
    meaning: 'Date the contract was executed / signed.',
    valueKind: 'date',
    canonicalTargets: ['contract_date'],
    patchGroup: 'wedding_date',
  },
  {
    id: 'wedding_date',
    aliases: [],
    meaning: 'Date of the wedding event.',
    valueKind: 'date',
    canonicalTargets: [],
    patchGroup: 'wedding_date',
  },
  {
    id: 'preparation_location',
    aliases: [],
    meaning: 'Place where bridal/groom preparation occurs.',
    valueKind: 'location',
    canonicalTargets: [],
    patchGroup: 'location',
  },
  {
    id: 'ceremony_location',
    aliases: ['wedding_location'],
    meaning: 'Place of the wedding ceremony.',
    valueKind: 'location',
    canonicalTargets: ['church', 'civil_office'],
    patchGroup: 'location',
  },
  {
    id: 'reception_location',
    aliases: [],
    meaning: 'Place of the wedding reception.',
    valueKind: 'location',
    canonicalTargets: [],
    patchGroup: 'location',
  },
  {
    id: 'civil_office',
    aliases: [],
    meaning: 'Civil registry / USC ceremony venue.',
    valueKind: 'location',
    canonicalTargets: ['ceremony_location'],
    patchGroup: 'location',
  },
  {
    id: 'church',
    aliases: [],
    meaning: 'Church / religious ceremony venue.',
    valueKind: 'location',
    canonicalTargets: ['ceremony_location'],
    patchGroup: 'location',
  },
  {
    id: 'package_name',
    aliases: [],
    meaning: 'Commercial package / offer name in the contract.',
    valueKind: 'package_name',
    canonicalTargets: [],
    patchGroup: 'package',
  },
  {
    id: 'contract_value',
    aliases: [
      'package_price',
      'wynagrodzenie',
      'wartość_umowy',
      'cena_pakietu',
    ],
    meaning: 'Total monetary value agreed by the contract.',
    valueKind: 'money',
    canonicalTargets: [],
    patchGroup: 'contract_value',
  },
  {
    id: 'deposit_amount',
    aliases: [],
    meaning: 'Deposit / zadatek amount.',
    valueKind: 'money',
    canonicalTargets: [],
    patchGroup: 'deposit',
  },
  {
    id: 'remaining_amount',
    aliases: [],
    meaning: 'Remaining amount after deposit.',
    valueKind: 'money',
    canonicalTargets: [],
    patchGroup: 'remaining_amount',
  },
  {
    id: 'bank_account',
    aliases: [],
    meaning: 'Bank account number for payments.',
    valueKind: 'account',
    canonicalTargets: [],
    patchGroup: 'bank_account',
  },
  {
    id: 'photographer_name',
    aliases: [],
    meaning: 'Photographer person name in the document.',
    valueKind: 'person_name',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'videographer_name',
    aliases: [],
    meaning: 'Videographer / camera operator name.',
    valueKind: 'person_name',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'company_name',
    aliases: [],
    meaning: 'Contractor / studio legal name.',
    valueKind: 'text',
    canonicalTargets: [],
    patchGroup: 'company_identity',
  },
  {
    id: 'company_tax_id',
    aliases: ['company_nip'],
    meaning: 'Company tax identifier (NIP).',
    valueKind: 'nip',
    canonicalTargets: [],
    patchGroup: 'company_identity',
  },
  {
    id: 'company_registration_number',
    aliases: ['company_regon'],
    meaning: 'Company registration number (REGON).',
    valueKind: 'regon',
    canonicalTargets: [],
    patchGroup: 'company_identity',
  },
  {
    id: 'company_address',
    aliases: [],
    meaning: 'Company registered address.',
    valueKind: 'address',
    canonicalTargets: [],
    patchGroup: 'company_identity',
  },
  {
    id: 'company_phone',
    aliases: [],
    meaning: 'Company contact phone.',
    valueKind: 'phone',
    canonicalTargets: [],
    patchGroup: 'company_identity',
  },
  {
    id: 'company_email',
    aliases: [],
    meaning: 'Company contact email.',
    valueKind: 'email',
    canonicalTargets: [],
    patchGroup: 'company_identity',
  },
  {
    id: 'company_website',
    aliases: ['company_website_url', 'website'],
    meaning: 'Company website URL or domain (template-owner invariant).',
    valueKind: 'text',
    canonicalTargets: [],
    patchGroup: 'company_identity',
  },
  {
    id: 'client_name',
    aliases: [],
    meaning: 'Generic client name in the contract.',
    valueKind: 'person_name',
    canonicalTargets: ['bride_name'],
    patchGroup: 'other',
  },
  {
    id: 'bride_name',
    aliases: [],
    meaning: 'Bride full name.',
    valueKind: 'person_name',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'bride_first_name',
    aliases: [
      'bride.firstName',
      'bride.first_name',
      'client_1_first_name',
      'client1_first_name',
    ],
    meaning: 'Bride / client 1 first name (partner1).',
    valueKind: 'text',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'bride_last_name',
    aliases: [
      'bride.lastName',
      'bride.last_name',
      'client_1_last_name',
      'client1_last_name',
    ],
    meaning: 'Bride / client 1 last name (partner1).',
    valueKind: 'text',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'groom_name',
    aliases: [],
    meaning: 'Groom full name.',
    valueKind: 'person_name',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'groom_first_name',
    aliases: [
      'groom.firstName',
      'groom.first_name',
      'client_2_first_name',
      'client2_first_name',
    ],
    meaning: 'Groom / client 2 first name (partner2).',
    valueKind: 'text',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'groom_last_name',
    aliases: [
      'groom.lastName',
      'groom.last_name',
      'client_2_last_name',
      'client2_last_name',
    ],
    meaning: 'Groom / client 2 last name (partner2).',
    valueKind: 'text',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'wedding_planner_name',
    aliases: ['planner_name', 'wedding_planner'],
    meaning: 'Wedding planner name — not part of the core wedding model.',
    valueKind: 'person_name',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'wedding_planner_email',
    aliases: ['planner_email'],
    meaning: 'Wedding planner email — not part of the core wedding model.',
    valueKind: 'email',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'wedding_planner_phone',
    aliases: ['planner_phone'],
    meaning: 'Wedding planner phone — not part of the core wedding model.',
    valueKind: 'phone',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'client_phone',
    aliases: [],
    meaning: 'Generic client phone.',
    valueKind: 'phone',
    canonicalTargets: ['bride_phone'],
    patchGroup: 'other',
  },
  {
    id: 'client_email',
    aliases: [],
    meaning: 'Generic client email.',
    valueKind: 'email',
    canonicalTargets: ['bride_email'],
    patchGroup: 'other',
  },
  {
    id: 'bride_phone',
    aliases: [],
    meaning: 'Bride phone number.',
    valueKind: 'phone',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'groom_phone',
    aliases: [],
    meaning: 'Groom phone number.',
    valueKind: 'phone',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'bride_email',
    aliases: [],
    meaning: 'Bride email.',
    valueKind: 'email',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'groom_email',
    aliases: [],
    meaning: 'Groom email.',
    valueKind: 'email',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'bride_address',
    aliases: [],
    meaning: 'Bride address.',
    valueKind: 'address',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'groom_address',
    aliases: [],
    meaning: 'Groom address.',
    valueKind: 'address',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'delivery_deadline',
    aliases: [],
    meaning: 'Deadline for delivering finished materials.',
    valueKind: 'duration',
    canonicalTargets: [],
    patchGroup: 'wedding_date',
  },
  {
    id: 'preview_deadline',
    aliases: [],
    meaning: 'Deadline for preview / teaser delivery.',
    valueKind: 'duration',
    canonicalTargets: [],
    patchGroup: 'wedding_date',
  },
  {
    id: 'package_duration',
    aliases: ['coverage_hours', 'working_hours'],
    meaning: 'Coverage / working duration included in the package.',
    valueKind: 'hours',
    canonicalTargets: [],
    patchGroup: 'package',
  },
  {
    id: 'package_overtime_rate',
    aliases: ['extra_hour_price'],
    meaning: 'Hourly overtime rate beyond package coverage.',
    valueKind: 'money',
    canonicalTargets: [],
    patchGroup: 'package',
  },
  {
    id: 'payment_due_date',
    aliases: ['final_payment_due_date'],
    meaning: 'Date when final / remaining payment is due.',
    valueKind: 'date',
    canonicalTargets: [],
    patchGroup: 'wedding_date',
  },
  {
    id: 'deposit_due_date',
    aliases: [],
    meaning: 'Date or relative term when deposit is due.',
    valueKind: 'duration',
    canonicalTargets: [],
    patchGroup: 'deposit',
  },
  {
    id: 'coverage_end_time',
    aliases: [],
    meaning: 'Clock time when coverage ends.',
    valueKind: 'time_of_day',
    canonicalTargets: [],
    patchGroup: 'package',
  },
  {
    id: 'package_item',
    aliases: ['package_contents'],
    meaning: 'A single deliverable / content item of the package.',
    valueKind: 'package_item',
    canonicalTargets: [],
    patchGroup: 'package',
  },
  {
    id: 'deposit_refund_multiplier',
    aliases: [],
    meaning: 'Legal multiplier for deposit refund (not a payable amount).',
    valueKind: 'legal_reference',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'deposit_forfeiture_clause',
    aliases: [],
    meaning: 'Legal clause about deposit forfeiture.',
    valueKind: 'legal_reference',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'amount_reference_without_literal_value',
    aliases: [],
    meaning: 'Reference to an amount without a literal currency value.',
    valueKind: 'legal_reference',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'legal_clause_reference',
    aliases: [],
    meaning: 'Generic legal clause reference.',
    valueKind: 'legal_reference',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'defined_party_term',
    aliases: [],
    meaning: 'Defined-party legal term.',
    valueKind: 'defined_term',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'couple_defined_term',
    aliases: [],
    meaning: 'Defined term for the couple (e.g. Para Młoda).',
    valueKind: 'defined_term',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'client_defined_term',
    aliases: [],
    meaning: 'Defined term for the client party.',
    valueKind: 'defined_term',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'contractor_defined_term',
    aliases: [],
    meaning: 'Defined term for the contractor party.',
    valueKind: 'defined_term',
    canonicalTargets: [],
    patchGroup: 'other',
  },
  {
    id: 'legal_party_reference',
    aliases: [],
    meaning: 'Reference to a contractual party.',
    valueKind: 'defined_term',
    canonicalTargets: [],
    patchGroup: 'other',
  },
] as const

export type ContractSemanticRole = (typeof SEMANTIC_ROLE_DEFINITIONS)[number]['id']

export const CONTRACT_SEMANTIC_ROLES: readonly ContractSemanticRole[] =
  SEMANTIC_ROLE_DEFINITIONS.map((d) => d.id)

const DEFINITION_BY_ID = new Map(
  SEMANTIC_ROLE_DEFINITIONS.map((d) => [d.id, d] as const),
)

/** Legacy Phase A role id → primary V2 id. */
export const SEMANTIC_ROLE_ALIASES: Readonly<Record<string, ContractSemanticRole>> =
  Object.freeze(
    Object.fromEntries(
      SEMANTIC_ROLE_DEFINITIONS.flatMap((d) =>
        d.aliases.map((a) => [a, d.id] as const),
      ),
    ) as Record<string, ContractSemanticRole>,
  )

export const SEMANTIC_ROLE_LABELS: Record<ContractSemanticRole, string> = {
  contract_date: 'Data zawarcia umowy',
  contract_execution_date: 'Data zawarcia umowy',
  wedding_date: 'Data ślubu',
  preparation_location: 'Lokalizacja przygotowań',
  ceremony_location: 'Lokalizacja ceremonii',
  reception_location: 'Lokalizacja przyjęcia',
  civil_office: 'Urząd / USC',
  church: 'Kościół',
  package_name: 'Nazwa pakietu',
  contract_value: 'Wartość umowy',
  deposit_amount: 'Kwota zadatku',
  remaining_amount: 'Kwota pozostała',
  bank_account: 'Numer konta',
  photographer_name: 'Fotograf',
  videographer_name: 'Operator / wideofilmowanie',
  company_name: 'Nazwa firmy',
  company_tax_id: 'NIP',
  company_registration_number: 'REGON',
  company_address: 'Adres firmy',
  company_phone: 'Telefon firmy',
  company_email: 'E-mail firmy',
  company_website: 'Strona WWW firmy',
  client_name: 'Klient (ogólnie)',
  bride_name: 'Panna Młoda',
  bride_first_name: 'Imię Panny Młodej',
  bride_last_name: 'Nazwisko Panny Młodej',
  groom_name: 'Pan Młody',
  groom_first_name: 'Imię Pana Młodego',
  groom_last_name: 'Nazwisko Pana Młodego',
  wedding_planner_name: 'Wedding planner — imię i nazwisko',
  wedding_planner_email: 'Wedding planner — e-mail',
  wedding_planner_phone: 'Wedding planner — telefon',
  client_phone: 'Telefon klienta',
  client_email: 'E-mail klienta',
  bride_phone: 'Telefon Panny Młodej',
  groom_phone: 'Telefon Pana Młodego',
  bride_email: 'E-mail Panny Młodej',
  groom_email: 'E-mail Pana Młodego',
  bride_address: 'Adres Panny Młodej',
  groom_address: 'Adres Pana Młodego',
  delivery_deadline: 'Termin oddania materiałów',
  preview_deadline: 'Termin podglądu / teasera',
  package_duration: 'Czas trwania pakietu',
  package_overtime_rate: 'Stawka nadgodzin',
  payment_due_date: 'Termin płatności końcowej',
  deposit_due_date: 'Termin zadatku',
  coverage_end_time: 'Godzina zakończenia',
  package_item: 'Element pakietu',
  deposit_refund_multiplier: 'Zwrot zadatku (mnożnik)',
  deposit_forfeiture_clause: 'Klauzula przepadku zadatku',
  amount_reference_without_literal_value: 'Odwołanie do kwoty (bez literału)',
  legal_clause_reference: 'Odwołanie prawne',
  defined_party_term: 'Termin stron',
  couple_defined_term: 'Termin „Para Młoda”',
  client_defined_term: 'Termin „Klient”',
  contractor_defined_term: 'Termin wykonawcy',
  legal_party_reference: 'Odwołanie do strony umowy',
}

function roleLookupCandidates(raw: string): string[] {
  const key = raw.trim()
  if (!key) return []
  const lower = key.toLowerCase()
  const camelToSnake = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
  const dottedToSnake = lower
    .replace(/[\s.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return [...new Set([key, lower, camelToSnake, dottedToSnake])]
}

/** Normalize raw Phase A role (or alias) → primary V2 role. */
export function normalizeSemanticRole(
  raw: string | null | undefined,
): ContractSemanticRole | null {
  if (!raw?.trim()) return null
  for (const candidate of roleLookupCandidates(raw)) {
    if (DEFINITION_BY_ID.has(candidate as ContractSemanticRole)) {
      return candidate as ContractSemanticRole
    }
    const alias = SEMANTIC_ROLE_ALIASES[candidate]
    if (alias) return alias
  }
  return null
}

export function getSemanticRoleDefinition(
  role: string,
): SemanticRoleDefinition | null {
  const id = normalizeSemanticRole(role)
  return id ? DEFINITION_BY_ID.get(id) ?? null : null
}

export function isContractSemanticRole(
  value: string,
): value is ContractSemanticRole {
  return normalizeSemanticRole(value) != null
}

/** True when two role strings denote the same semantic meaning. */
export function semanticRolesEquivalent(a: string, b: string): boolean {
  const na = normalizeSemanticRole(a)
  const nb = normalizeSemanticRole(b)
  return na != null && na === nb
}

export const SEMANTIC_MAP_ANALYSIS_VERSION = '2.1.0'

/** Confidence thresholds for Phase B replacement generation. */
export const SEMANTIC_CONFIDENCE = {
  autoApprove: 0.9,
  reviewMin: 0.6,
} as const

export function confidenceBand(
  confidence: number,
): 'auto' | 'review' | 'ignore' {
  if (confidence >= SEMANTIC_CONFIDENCE.autoApprove) return 'auto'
  if (confidence >= SEMANTIC_CONFIDENCE.reviewMin) return 'review'
  return 'ignore'
}
