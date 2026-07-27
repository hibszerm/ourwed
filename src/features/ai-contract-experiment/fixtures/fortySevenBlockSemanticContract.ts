/**
 * Generic 47-block wedding photography contract structure for semantic resolution regression.
 * Uses placeholder names/venues — not tied to any live contract.
 */

import { blocksFromPlainParagraphs } from '../experimentService'
import type { ContractFieldKey, ContractGenerationInput, IndexedDocxBlock } from '../types'

export const FORTY_SEVEN_GENERATION_INPUT: ContractGenerationInput = {
  currentDate: '30.10.2024 r.',
  weddingDate: '19.06.2025 r.',
  clients: [
    {
      id: 'c1',
      firstName: 'Anna',
      lastName: 'Kowalska',
      fullName: 'Anna Kowalska',
      address: 'ul. Przykładowa 67/73, 30-001 Kraków',
      phone: '888 777 621',
    },
    {
      id: 'c2',
      firstName: 'Jan',
      lastName: 'Kowalski',
      fullName: 'Jan Kowalski',
    },
  ],
  locations: {
    preparation: 'Hotel Przykładowy, Kraków',
    ceremony: 'Kościół Przykładowy, Kraków',
    reception: 'Rezydencja Przykładowa, Kraków',
  },
  finances: {
    contractValue: 8000,
    contractValueFormatted: '8 000 zł',
    contractValueWords: 'osiem tysięcy złotych',
    depositAmount: 1000,
    depositAmountFormatted: '1 000 zł',
    depositAmountWords: 'tysiąc złotych',
    remainingAmount: 7000,
    remainingAmountFormatted: '7 000 zł',
    remainingAmountWords: 'siedem tysięcy złotych',
    payments: [],
  },
  package: { id: 'pkg', name: 'Foto' },
}

export const FORTY_SEVEN_KEY_PARAGRAPHS = {
  clientIntro:
    'z Anną Kowalską, zam. ul. Przykładowa 67/73 Kraków, tel. 888 777 621, zwaną dalej Zleceniodawcą',
  execution:
    'Umowa zawarta w Krakowie w dniu 30.10.2024 r. pomiędzy Wykonawcą a Zleceniodawcą.',
  event:
    'Wykonawca wykona usługi fotograficzne podczas wydarzeń odbywających się w dniu 19.06.2025r.',
  preparation: 'Przygotowania Panny Młodej: Hotel Przykładowy, Kraków.',
  ceremony: 'Ceremonia ślubna: Kościół Przykładowy, Kraków.',
  reception: 'Przyjęcie weselne: Rezydencja Przykładowa, Kraków.',
  contractValue:
    'Wynagrodzenie w wysokości 8 000 zł (słownie: osiem tysięcy złotych) za usługi określone w Umowie.',
  deposit:
    'Zadatek w wysokości 1 000 zł (słownie: tysiąc złotych) płatny w terminie 7 dni od daty zawarcia Umowy.',
  remaining:
    'pozostałą część wynagrodzenia w wysokości 7 000 zł (słownie: siedem tysięcy złotych) Zamawiający zapłaci najpóźniej w dniu 19.06.2025r.',
} as const

export type ExpectedOwnership = {
  exactValue: string
  fieldKey: ContractFieldKey
}

export const FORTY_SEVEN_EXPECTED_OWNERSHIP: ExpectedOwnership[] = [
  { exactValue: 'Anną Kowalską', fieldKey: 'couple_full_names' },
  { exactValue: 'ul. Przykładowa 67/73 Kraków', fieldKey: 'client_address' },
  { exactValue: '888 777 621', fieldKey: 'client_phone' },
  { exactValue: '30.10.2024 r.', fieldKey: 'contract_execution_date' },
  { exactValue: '19.06.2025r.', fieldKey: 'wedding_date' },
  { exactValue: 'Hotel Przykładowy, Kraków', fieldKey: 'preparation_location' },
  { exactValue: 'Kościół Przykładowy, Kraków', fieldKey: 'ceremony_location' },
  { exactValue: 'Rezydencja Przykładowa, Kraków', fieldKey: 'reception_location' },
  { exactValue: '8 000 zł', fieldKey: 'contract_value_formatted' },
  { exactValue: 'osiem tysięcy złotych', fieldKey: 'contract_value_words' },
  { exactValue: '1 000 zł', fieldKey: 'agreed_deposit_formatted' },
  { exactValue: 'tysiąc złotych', fieldKey: 'agreed_deposit_words' },
  { exactValue: '7 000 zł', fieldKey: 'remaining_after_deposit_formatted' },
  { exactValue: 'siedem tysięcy złotych', fieldKey: 'remaining_after_deposit_words' },
  { exactValue: '19.06.2025r.', fieldKey: 'final_payment_due_date' },
]

export function buildFortySevenBlockFixture(): {
  blocks: IndexedDocxBlock[]
  fields: Array<{
    fieldKey: ContractFieldKey
    blockId: string
    exactValue: string
    pairedFieldGroup: string | null
    confidence: 'high'
  }>
} {
  const core = [
    'UMOWA O ŚWIADCZENIE USŁUG FOTOGRAFICZNYCH',
    FORTY_SEVEN_KEY_PARAGRAPHS.execution,
    '',
    FORTY_SEVEN_KEY_PARAGRAPHS.clientIntro,
    '',
    '§1 Przedmiot umowy',
    FORTY_SEVEN_KEY_PARAGRAPHS.event,
    FORTY_SEVEN_KEY_PARAGRAPHS.preparation,
    FORTY_SEVEN_KEY_PARAGRAPHS.ceremony,
    FORTY_SEVEN_KEY_PARAGRAPHS.reception,
    '',
    '§2 Wynagrodzenie',
    FORTY_SEVEN_KEY_PARAGRAPHS.contractValue,
    FORTY_SEVEN_KEY_PARAGRAPHS.deposit,
    FORTY_SEVEN_KEY_PARAGRAPHS.remaining,
  ]

  const paragraphs = [...core]
  while (paragraphs.length < 47) {
    const n = paragraphs.length
    paragraphs.push(
      `§${Math.floor(n / 4)} Postanowienie uzupełniające nr ${n}: szczegóły realizacji usługi.`,
    )
  }

  const blocks = blocksFromPlainParagraphs(paragraphs.slice(0, 47))
  const find = (needle: string) => {
    const block = blocks.find((b) => b.text.includes(needle))
    if (!block) throw new Error(`block not found for: ${needle}`)
    return block
  }

  const fields = [
    { fieldKey: 'couple_full_names' as const, blockId: find('Anną Kowalską').id, exactValue: 'Anną Kowalską', pairedFieldGroup: null, confidence: 'high' as const },
    { fieldKey: 'client_address' as const, blockId: find('ul. Przykładowa').id, exactValue: 'ul. Przykładowa 67/73 Kraków', pairedFieldGroup: null, confidence: 'high' as const },
    { fieldKey: 'client_phone' as const, blockId: find('888 777 621').id, exactValue: '888 777 621', pairedFieldGroup: null, confidence: 'high' as const },
    { fieldKey: 'contract_execution_date' as const, blockId: find('30.10.2024').id, exactValue: '30.10.2024 r.', pairedFieldGroup: null, confidence: 'high' as const },
    { fieldKey: 'wedding_date' as const, blockId: find('wydarzeń').id, exactValue: '19.06.2025r.', pairedFieldGroup: null, confidence: 'high' as const },
    { fieldKey: 'preparation_location' as const, blockId: find('Przygotowania').id, exactValue: 'Hotel Przykładowy, Kraków', pairedFieldGroup: null, confidence: 'high' as const },
    { fieldKey: 'ceremony_location' as const, blockId: find('Ceremonia').id, exactValue: 'Kościół Przykładowy, Kraków', pairedFieldGroup: null, confidence: 'high' as const },
    { fieldKey: 'reception_location' as const, blockId: find('Przyjęcie').id, exactValue: 'Rezydencja Przykładowa, Kraków', pairedFieldGroup: null, confidence: 'high' as const },
    { fieldKey: 'contract_value_formatted' as const, blockId: find('8 000 zł').id, exactValue: '8 000 zł', pairedFieldGroup: 'cv1', confidence: 'high' as const },
    { fieldKey: 'contract_value_words' as const, blockId: find('osiem tysięcy').id, exactValue: 'osiem tysięcy złotych', pairedFieldGroup: 'cv1', confidence: 'high' as const },
    { fieldKey: 'agreed_deposit_formatted' as const, blockId: find('1 000 zł').id, exactValue: '1 000 zł', pairedFieldGroup: 'dep1', confidence: 'high' as const },
    { fieldKey: 'agreed_deposit_words' as const, blockId: find('tysiąc złotych').id, exactValue: 'tysiąc złotych', pairedFieldGroup: 'dep1', confidence: 'high' as const },
    { fieldKey: 'remaining_after_deposit_formatted' as const, blockId: find('pozostałą').id, exactValue: '7 000 zł', pairedFieldGroup: 'rem1', confidence: 'high' as const },
    { fieldKey: 'remaining_after_deposit_words' as const, blockId: find('siedem tysięcy').id, exactValue: 'siedem tysięcy złotych', pairedFieldGroup: 'rem1', confidence: 'high' as const },
    { fieldKey: 'final_payment_due_date' as const, blockId: find('najpóźniej').id, exactValue: '19.06.2025r.', pairedFieldGroup: null, confidence: 'high' as const },
  ]

  return { blocks, fields }
}
