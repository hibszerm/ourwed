/**
 * Closed dynamic / immutable field registries for the AI contract experiment.
 */

import type { ContractFieldKey } from './types'

export const EXPERIMENT_DYNAMIC_FIELD_KEYS = [
  'couple_full_names',
  'client_address',
  'client_phone',
  'contract_execution_date',
  'wedding_date',
  'preparation_location',
  'ceremony_location',
  'reception_location',
  'contract_value_formatted',
  'contract_value_words',
  'agreed_deposit_formatted',
  'agreed_deposit_words',
  'remaining_after_deposit_formatted',
  'remaining_after_deposit_words',
  'deposit_due_date',
  'payment_due_date',
  'final_payment_due_date',
] as const satisfies readonly ContractFieldKey[]

export const EXPERIMENT_FIELD_LABELS: Record<ContractFieldKey, string> = {
  couple_full_names: 'Strona zamawiająca',
  client_address: 'Adres klientów',
  client_phone: 'Telefon klientów',
  contract_execution_date: 'Data zawarcia umowy',
  wedding_date: 'Data ślubu',
  preparation_location: 'Miejsce przygotowań',
  ceremony_location: 'Miejsce ceremonii',
  reception_location: 'Miejsce przyjęcia',
  contract_value_formatted: 'Wartość umowy',
  contract_value_words: 'Wartość umowy słownie',
  agreed_deposit_formatted: 'Zadatek',
  agreed_deposit_words: 'Zadatek słownie',
  remaining_after_deposit_formatted: 'Pozostała kwota',
  remaining_after_deposit_words: 'Pozostała kwota słownie',
  deposit_due_date: 'Termin zadatku',
  payment_due_date: 'Termin płatności',
  final_payment_due_date: 'Termin płatności końcowej',
}

export const EXPERIMENT_REQUIRED_FIELD_KEYS: readonly ContractFieldKey[] = [
  'couple_full_names',
  'contract_execution_date',
  'wedding_date',
  'contract_value_formatted',
]

export const EXPERIMENT_FIELD_REGISTRY: Array<{
  key: ContractFieldKey
  label: string
  description: string
  expectedValueType:
    | 'person_identity'
    | 'address'
    | 'phone'
    | 'date'
    | 'location'
    | 'money_numeric'
    | 'money_words'
}> = [
  {
    key: 'couple_full_names',
    label: EXPERIMENT_FIELD_LABELS.couple_full_names,
    description:
      'Imiona i nazwiska klientów / pary (może być jeden span kompozytowy).',
    expectedValueType: 'person_identity',
  },
  {
    key: 'client_address',
    label: EXPERIMENT_FIELD_LABELS.client_address,
    description: 'Adres zamieszkania lub korespondencyjny klientów.',
    expectedValueType: 'address',
  },
  {
    key: 'client_phone',
    label: EXPERIMENT_FIELD_LABELS.client_phone,
    description: 'Numer telefonu klientów.',
    expectedValueType: 'phone',
  },
  {
    key: 'contract_execution_date',
    label: EXPERIMENT_FIELD_LABELS.contract_execution_date,
    description: 'Data podpisania / zawarcia umowy (nie data ślubu).',
    expectedValueType: 'date',
  },
  {
    key: 'wedding_date',
    label: EXPERIMENT_FIELD_LABELS.wedding_date,
    description: 'Data uroczystości / wydarzenia ślubnego.',
    expectedValueType: 'date',
  },
  {
    key: 'preparation_location',
    label: EXPERIMENT_FIELD_LABELS.preparation_location,
    description: 'Lokalizacja przygotowań przed ceremonią.',
    expectedValueType: 'location',
  },
  {
    key: 'ceremony_location',
    label: EXPERIMENT_FIELD_LABELS.ceremony_location,
    description: 'Kościół, USC lub inne miejsce ceremonii.',
    expectedValueType: 'location',
  },
  {
    key: 'reception_location',
    label: EXPERIMENT_FIELD_LABELS.reception_location,
    description: 'Sala weselna, hotel lub inne miejsce przyjęcia.',
    expectedValueType: 'location',
  },
  {
    key: 'contract_value_formatted',
    label: EXPERIMENT_FIELD_LABELS.contract_value_formatted,
    description: 'Łączna kwota wynagrodzenia (liczbowo, z walutą).',
    expectedValueType: 'money_numeric',
  },
  {
    key: 'contract_value_words',
    label: EXPERIMENT_FIELD_LABELS.contract_value_words,
    description: 'Kwota wynagrodzenia zapisana słownie.',
    expectedValueType: 'money_words',
  },
  {
    key: 'agreed_deposit_formatted',
    label: EXPERIMENT_FIELD_LABELS.agreed_deposit_formatted,
    description: 'Kwota zadatku / pierwszej raty.',
    expectedValueType: 'money_numeric',
  },
  {
    key: 'agreed_deposit_words',
    label: EXPERIMENT_FIELD_LABELS.agreed_deposit_words,
    description: 'Kwota zadatku zapisana słownie.',
    expectedValueType: 'money_words',
  },
  {
    key: 'remaining_after_deposit_formatted',
    label: EXPERIMENT_FIELD_LABELS.remaining_after_deposit_formatted,
    description: 'Kwota pozostała po zadatku.',
    expectedValueType: 'money_numeric',
  },
  {
    key: 'remaining_after_deposit_words',
    label: EXPERIMENT_FIELD_LABELS.remaining_after_deposit_words,
    description: 'Kwota pozostała po zadatku zapisana słownie.',
    expectedValueType: 'money_words',
  },
  {
    key: 'deposit_due_date',
    label: EXPERIMENT_FIELD_LABELS.deposit_due_date,
    description: 'Termin płatności zadatku.',
    expectedValueType: 'date',
  },
  {
    key: 'payment_due_date',
    label: EXPERIMENT_FIELD_LABELS.payment_due_date,
    description: 'Termin raty pośredniej.',
    expectedValueType: 'date',
  },
  {
    key: 'final_payment_due_date',
    label: EXPERIMENT_FIELD_LABELS.final_payment_due_date,
    description: 'Termin ostatniej raty.',
    expectedValueType: 'date',
  },
]

export const EXPERIMENT_IMMUTABLE_CONCEPTS = [
  {
    key: 'provider_identity',
    label: 'Dane usługodawcy',
    description: 'Nazwa firmy, wykonawcy, fotografa lub filmowca.',
  },
  {
    key: 'provider_address',
    label: 'Adres usługodawcy',
    description: 'Siedziba lub adres usługodawcy.',
  },
  {
    key: 'provider_nip',
    label: 'NIP usługodawcy',
    description: 'Numer NIP wykonawcy.',
  },
  {
    key: 'provider_regon',
    label: 'REGON usługodawcy',
    description: 'Numer REGON wykonawcy.',
  },
  {
    key: 'provider_phone',
    label: 'Telefon usługodawcy',
    description: 'Kontakt usługodawcy.',
  },
  {
    key: 'provider_bank_account',
    label: 'Rachunek bankowy',
    description: 'Numer konta do wpłat na rzecz usługodawcy.',
  },
  {
    key: 'package_fact',
    label: 'Fakt pakietowy',
    description: 'Zawartość pakietu, czas pracy, nadgodziny, terminy oddania.',
  },
  {
    key: 'legal_clause',
    label: 'Klauzula prawna',
    description: 'Postanowienia prawne, copyright, jurysdykcja, rezygnacja.',
  },
] as const

export const EXPERIMENT_FIELD_GROUPS: Record<
  string,
  { title: string; keys: ContractFieldKey[] }
> = {
  clients: {
    title: 'Dane klientów',
    keys: ['couple_full_names', 'client_address', 'client_phone'],
  },
  dates: {
    title: 'Daty',
    keys: ['contract_execution_date', 'wedding_date'],
  },
  locations: {
    title: 'Miejsca',
    keys: [
      'preparation_location',
      'ceremony_location',
      'reception_location',
    ],
  },
  finances: {
    title: 'Finanse',
    keys: [
      'contract_value_formatted',
      'contract_value_words',
      'agreed_deposit_formatted',
      'agreed_deposit_words',
      'remaining_after_deposit_formatted',
      'remaining_after_deposit_words',
      'deposit_due_date',
      'payment_due_date',
      'final_payment_due_date',
    ],
  },
}

export const CONFIDENCE_LABELS: Record<'high' | 'medium' | 'low', string> = {
  high: 'Wysoka',
  medium: 'Średnia',
  low: 'Niska',
}

export function confidenceToScore(level: 'high' | 'medium' | 'low'): number {
  if (level === 'high') return 0.95
  if (level === 'medium') return 0.75
  return 0.5
}

export const EXPERIMENT_IMMUTABLE_CLASSIFICATIONS = [
  'provider_identity',
  'provider_address',
  'provider_nip',
  'provider_regon',
  'provider_phone',
  'provider_bank_account',
  'package_contents',
  'coverage_hours',
  'event_time_limits',
  'overtime_rate',
  'delivery_period',
  'legal_clause',
  'copyright_clause',
  'publication_clause',
  'jurisdiction_clause',
] as const

const DYNAMIC = new Set<string>(EXPERIMENT_DYNAMIC_FIELD_KEYS)

export function isExperimentDynamicFieldKey(
  key: string | null | undefined,
): key is ContractFieldKey {
  return Boolean(key && DYNAMIC.has(key))
}

export function assertExperimentFieldKey(key: string): ContractFieldKey {
  if (!isExperimentDynamicFieldKey(key)) {
    throw new Error(`Invented or unsupported registry key: ${key}`)
  }
  return key
}
