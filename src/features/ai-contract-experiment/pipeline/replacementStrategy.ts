/**
 * Assign exactly one replacement strategy per occurrence.
 */

import { deriveLocationReplacementCapability } from '../locationReplacementCapability'
import { formatReplacementValue } from '../replacementValueFormatting'
import { getExecutableReplacementValue, getOccurrenceTargetValue } from '../validation/occurrenceAccessors'
import type { OccurrenceValidationDimensions } from '../validation/types'
import type {
  ContractFieldKey,
  ContractGenerationInput,
  ContractOccurrence,
  IndexedDocxBlock,
  ReplacementStrategy,
  ValidatedAiMapping,
} from '../types'

const AUTO_REPLACE_FIELDS = new Set<ContractFieldKey>([
  'couple_full_names',
  'client_address',
  'client_phone',
  'contract_execution_date',
  'wedding_date',
  'contract_value_formatted',
  'contract_value_words',
  'agreed_deposit_formatted',
  'agreed_deposit_words',
  'remaining_after_deposit_formatted',
  'remaining_after_deposit_words',
  'deposit_due_date',
  'payment_due_date',
  'final_payment_due_date',
])

export function computeOccurrenceReplacementValue(input: {
  fieldKey: ContractFieldKey
  sourceValue: string
  generationInput: ContractGenerationInput
  block?: IndexedDocxBlock
  grammaticalForm?: string
  occurrenceReplacementMode?: ValidatedAiMapping['occurrenceReplacementMode']
}): string {
  const mode = input.occurrenceReplacementMode
  const isLocationField =
    input.fieldKey === 'reception_location' ||
    input.fieldKey === 'ceremony_location' ||
    input.fieldKey === 'preparation_location'

  if (mode === 'manual_review_required' && isLocationField) return ''

  if (mode === 'location_name_inflected' && isLocationField) {
    const cap = deriveLocationReplacementCapability(
      input.generationInput,
      input.fieldKey,
    )
    if (cap.venueName) return cap.venueName
    return ''
  }

  if (input.block?.kind === 'tableCell') {
    return formatReplacementValue({
      fieldKey: input.fieldKey,
      sourceExact: input.sourceValue,
      generationInput: input.generationInput,
    })
  }

  return formatReplacementValue({
    fieldKey: input.fieldKey,
    sourceExact: input.sourceValue,
    generationInput: input.generationInput,
  })
}

export function assignReplacementStrategy(input: {
  fieldKey: ContractFieldKey
  validationStatus: ContractOccurrence['validationStatus']
  approvalStatus: ContractOccurrence['approvalStatus']
  occurrenceReplacementMode?: ValidatedAiMapping['occurrenceReplacementMode']
  replacementValue: string
  block?: IndexedDocxBlock
  grammaticalForm?: string
  validationDimensions?: OccurrenceValidationDimensions
}): ReplacementStrategy {
  if (input.approvalStatus === 'ignored_immutable') {
    return 'IGNORE_OCCURRENCE'
  }

  const readiness = input.validationDimensions?.replacement
  if (readiness?.status === 'manual_text_required') {
    return 'CUSTOM_TEXT_REQUIRED'
  }

  if (input.occurrenceReplacementMode === 'manual_review_required') {
    return 'CUSTOM_TEXT_REQUIRED'
  }

  if (
    input.grammaticalForm === 'inflected' &&
    (input.fieldKey === 'reception_location' ||
      input.fieldKey === 'ceremony_location' ||
      input.fieldKey === 'preparation_location') &&
    !input.replacementValue.trim()
  ) {
    return 'CUSTOM_TEXT_REQUIRED'
  }

  if (AUTO_REPLACE_FIELDS.has(input.fieldKey) && input.replacementValue.trim()) {
    return 'AUTO_REPLACE'
  }

  if (input.validationStatus === 'needs_review') {
    return input.replacementValue.trim() ? 'CONFIRM_ONLY' : 'CUSTOM_TEXT_REQUIRED'
  }

  if (
    input.fieldKey === 'reception_location' ||
    input.fieldKey === 'ceremony_location' ||
    input.fieldKey === 'preparation_location'
  ) {
    return input.replacementValue.trim() ? 'AUTO_REPLACE' : 'CUSTOM_TEXT_REQUIRED'
  }

  return input.replacementValue.trim() ? 'CONFIRM_ONLY' : 'CUSTOM_TEXT_REQUIRED'
}

export function replacementStrategyLabel(strategy: ReplacementStrategy): string {
  switch (strategy) {
    case 'AUTO_REPLACE':
      return 'Automatyczna zamiana'
    case 'CONFIRM_ONLY':
      return 'Tylko zatwierdzenie'
    case 'CUSTOM_TEXT_REQUIRED':
      return 'Wymagany własny tekst'
    case 'IGNORE_OCCURRENCE':
      return 'Pominięte'
  }
}

export function resolvedReplacementText(occurrence: ContractOccurrence): string {
  return getExecutableReplacementValue(occurrence)
}

export function suggestedTargetForOccurrence(occurrence: ContractOccurrence): string | undefined {
  return getOccurrenceTargetValue(occurrence)
}
