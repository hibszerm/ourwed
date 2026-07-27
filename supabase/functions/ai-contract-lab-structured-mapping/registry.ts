/**
 * Authoritative server-side closed registry for structured mapping.
 * Must stay aligned with src/features/ai-contract-experiment/fieldRegistry.ts
 */

export const ALLOWED_FIELD_KEYS = [
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
] as const

export type ContractFieldKey = (typeof ALLOWED_FIELD_KEYS)[number]

export const FIELD_REGISTRY: Array<{
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
    label: 'Strona zamawiająca',
    description: 'Imiona i nazwiska klientów / pary (może być jeden span kompozytowy).',
    expectedValueType: 'person_identity',
  },
  {
    key: 'client_address',
    label: 'Adres klientów',
    description: 'Adres zamieszkania lub korespondencyjny klientów.',
    expectedValueType: 'address',
  },
  {
    key: 'client_phone',
    label: 'Telefon klientów',
    description: 'Numer telefonu klientów.',
    expectedValueType: 'phone',
  },
  {
    key: 'contract_execution_date',
    label: 'Data zawarcia umowy',
    description: 'Data podpisania / zawarcia umowy (nie data ślubu).',
    expectedValueType: 'date',
  },
  {
    key: 'wedding_date',
    label: 'Data ślubu',
    description: 'Data uroczystości / wydarzenia ślubnego.',
    expectedValueType: 'date',
  },
  {
    key: 'preparation_location',
    label: 'Miejsce przygotowań',
    description: 'Lokalizacja przygotowań przed ceremonią.',
    expectedValueType: 'location',
  },
  {
    key: 'ceremony_location',
    label: 'Miejsce ceremonii',
    description: 'Kościół, USC lub inne miejsce ceremonii.',
    expectedValueType: 'location',
  },
  {
    key: 'reception_location',
    label: 'Miejsce przyjęcia',
    description: 'Sala weselna, hotel lub inne miejsce przyjęcia.',
    expectedValueType: 'location',
  },
  {
    key: 'contract_value_formatted',
    label: 'Wartość umowy',
    description: 'Łączna kwota wynagrodzenia (liczbowo, z walutą).',
    expectedValueType: 'money_numeric',
  },
  {
    key: 'contract_value_words',
    label: 'Wartość umowy słownie',
    description: 'Kwota wynagrodzenia zapisana słownie.',
    expectedValueType: 'money_words',
  },
  {
    key: 'agreed_deposit_formatted',
    label: 'Zadatek',
    description: 'Kwota zadatku / pierwszej raty.',
    expectedValueType: 'money_numeric',
  },
  {
    key: 'agreed_deposit_words',
    label: 'Zadatek słownie',
    description: 'Kwota zadatku zapisana słownie.',
    expectedValueType: 'money_words',
  },
  {
    key: 'remaining_after_deposit_formatted',
    label: 'Pozostała kwota',
    description: 'Kwota pozostała po zadatku (pojedyncza pozostała rata).',
    expectedValueType: 'money_numeric',
  },
  {
    key: 'remaining_after_deposit_words',
    label: 'Pozostała kwota słownie',
    description: 'Kwota pozostała po zadatku zapisana słownie.',
    expectedValueType: 'money_words',
  },
  {
    key: 'deposit_due_date',
    label: 'Termin zadatku',
    description: 'Termin płatności zadatku (konkretna data w dokumencie).',
    expectedValueType: 'date',
  },
  {
    key: 'payment_due_date',
    label: 'Termin płatności',
    description: 'Termin raty pośredniej (konkretna data).',
    expectedValueType: 'date',
  },
  {
    key: 'final_payment_due_date',
    label: 'Termin płatności końcowej',
    description: 'Termin ostatniej raty (konkretna data).',
    expectedValueType: 'date',
  },
]

export const IMMUTABLE_CONCEPTS = [
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
