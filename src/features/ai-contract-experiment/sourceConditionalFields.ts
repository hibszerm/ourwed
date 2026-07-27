/**
 * Detect which optional / source-conditional field concepts appear in the document.
 * Delegates to value-level presence — stage labels alone do not count.
 */

import { evaluateAllSourceFieldPresence } from './sourceFieldPresence'
import type { ContractFieldKey, IndexedDocxBlock } from './types'

export const SOURCE_CONDITIONAL_FIELD_KEYS: readonly ContractFieldKey[] = [
  'client_address',
  'client_phone',
  'preparation_location',
  'ceremony_location',
  'reception_location',
  'agreed_deposit_formatted',
  'remaining_after_deposit_formatted',
  'deposit_due_date',
  'payment_due_date',
  'final_payment_due_date',
] as const

export function detectSourceConditionalFieldsPresent(
  blocks: IndexedDocxBlock[],
): ContractFieldKey[] {
  return evaluateAllSourceFieldPresence({ blocks })
    .filter((d) => d.presence === 'present_supported_value' && d.requiresMapping)
    .map((d) => d.fieldKey)
}

export function sourceRequiresField(
  blocks: IndexedDocxBlock[],
  fieldKey: ContractFieldKey,
): boolean {
  return detectSourceConditionalFieldsPresent(blocks).includes(fieldKey)
}
