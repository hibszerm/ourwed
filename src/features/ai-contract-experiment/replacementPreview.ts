/**
 * Replacement preview values from normalized wedding input (not sent to OpenAI).
 */

import type { ContractFieldKey, ContractGenerationInput } from './types'

export function replacementPreviewForField(
  fieldKey: ContractFieldKey,
  input: ContractGenerationInput,
): string {
  const clients = input.clients.map((c) => c.fullName).join(' i ')
  switch (fieldKey) {
    case 'couple_full_names':
      return clients || '—'
    case 'client_address':
      return input.clients[0]?.address ?? '—'
    case 'client_phone':
      return input.clients[0]?.phone ?? '—'
    case 'contract_execution_date':
      return input.currentDate || '—'
    case 'wedding_date':
      return input.weddingDate || '—'
    case 'preparation_location':
      return input.locations.preparation ?? '—'
    case 'ceremony_location':
      return input.locations.ceremony ?? '—'
    case 'reception_location':
      return input.locations.reception ?? '—'
    case 'contract_value_formatted':
      return input.finances.contractValueFormatted
    case 'contract_value_words':
      return input.finances.contractValueWords
    case 'agreed_deposit_formatted':
      return input.finances.depositAmountFormatted
    case 'remaining_after_deposit_formatted':
      return input.finances.remainingAmountFormatted
    case 'deposit_due_date':
      return (
        input.finances.payments.find((p) => p.type === 'deposit')?.dueDate ??
        '—'
      )
    case 'payment_due_date':
      return input.finances.payments[0]?.dueDate ?? '—'
    case 'final_payment_due_date':
      return (
        input.finances.payments[input.finances.payments.length - 1]?.dueDate ??
        '—'
      )
    default:
      return '—'
  }
}
