/**
 * Canonical occurrence validation — three independent dimensions.
 */

import { validateCompleteMoneySpan, validateMoneyWordsSpan } from '../completeMoneySpanValidator'
import { validatePolishContractDateToken } from '../polishContractDateValidator'
import type {
  ContractFieldKey,
  ContractGenerationInput,
  IndexedDocxBlock,
} from '../types'
import { addressSourceValid } from './addressComponents'
import { getFieldDefinition } from './fieldDefinitionRegistry'
import { normalizeIdentityForComparison } from './identityNormalization'
import {
  contextContradictsFieldKey,
  contextSupportsFieldKey,
  isShapeCompatibleWithField,
  resolveFieldKeyFromContext,
} from './semanticContextScoring'
import { resolveTargetValue } from './targetValueResolver'
import type {
  OccurrenceValidationDimensions,
  SemanticValidity,
  SourceValidity,
} from './types'
import type { ValueShapeResult } from './valueShapeClassifier'

export type PhysicalSpanInput = {
  fieldKey: ContractFieldKey
  blockId: string
  blockText: string
  sourceValue: string
  start: number
  end: number
  spanStatus: 'resolved' | 'not_found' | 'ambiguous'
  occurrenceCount: number
  providerRejected?: boolean
  providerReason?: string
  overlapWithFieldKey?: ContractFieldKey
}

export function evaluateSourceValidity(input: PhysicalSpanInput): SourceValidity {
  if (input.providerRejected) {
    if (input.providerReason?.includes('bank')) {
      return { status: 'invalid', reasonCode: 'protected_range_overlap' }
    }
    return { status: 'invalid', reasonCode: 'protected_range_overlap' }
  }
  if (input.overlapWithFieldKey) {
    return { status: 'invalid', reasonCode: 'duplicate_physical_span' }
  }
  if (!input.sourceValue.trim()) {
    return { status: 'invalid', reasonCode: 'empty_source_value' }
  }
  if (input.spanStatus === 'not_found') {
    return { status: 'invalid', reasonCode: 'span_not_found' }
  }
  if (input.spanStatus === 'ambiguous') {
    return { status: 'invalid', reasonCode: 'span_mismatch' }
  }
  if (input.start < 0 || input.end > input.blockText.length || input.start >= input.end) {
    return { status: 'invalid', reasonCode: 'offset_out_of_range' }
  }
  const slice = input.blockText.slice(input.start, input.end)
  if (slice !== input.sourceValue) {
    return { status: 'invalid', reasonCode: 'span_mismatch' }
  }
  return { status: 'valid' }
}

function evaluateSemanticRole(input: {
  aiProposedFieldKey: ContractFieldKey
  fieldKey: ContractFieldKey
  blockText: string
  sourceValue: string
  start: number
  end: number
  valueShape: ValueShapeResult
  providerReason?: string
  reassigned: boolean
}): SemanticValidity {
  if (input.providerReason?.includes('provider')) {
    return { status: 'invalid', reasonCode: 'provider_data' }
  }
  if (input.providerReason?.includes('bank')) {
    return { status: 'invalid', reasonCode: 'bank_account' }
  }
  if (input.providerReason?.includes('immutable')) {
    return { status: 'invalid', reasonCode: 'immutable_clause' }
  }

  const key = input.fieldKey
  const def = getFieldDefinition(key)

  if (!def.acceptedValueShapes.includes(input.valueShape.shape)) {
    return { status: 'invalid', reasonCode: 'unsupported_role' }
  }

  if (
    contextContradictsFieldKey(
      key,
      input.blockText,
      input.start,
      input.end,
      input.sourceValue,
    )
  ) {
    if (input.reassigned) {
      return { status: 'needs_review', reasonCode: 'ambiguous_role' }
    }
    return { status: 'invalid', reasonCode: 'role_context_contradiction' }
  }

  if (def.valueType === 'date') {
    const date = validatePolishContractDateToken(input.sourceValue)
    if (!date.valid) {
      return { status: 'needs_review', reasonCode: 'weak_context' }
    }
  }

  if (def.valueType === 'money') {
    const money = validateCompleteMoneySpan({
      exactValue: input.sourceValue,
      blockText: input.blockText,
      start: input.start,
      end: input.end,
    })
    if (!money.valid) {
      if (money.reason === 'bank_account_not_money') {
        return { status: 'invalid', reasonCode: 'bank_account' }
      }
      return { status: 'needs_review', reasonCode: 'weak_context' }
    }
  }

  if (def.valueType === 'money_words') {
    const words = validateMoneyWordsSpan(input.sourceValue)
    if (!words.valid) {
      return { status: 'needs_review', reasonCode: 'weak_context' }
    }
  }

  if (def.valueType === 'person_name') {
    if (/,\s*zam\.|NIP|REGON|tel\./i.test(input.sourceValue)) {
      return { status: 'invalid', reasonCode: 'identity_contamination' }
    }
    const identity = normalizeIdentityForComparison(input.sourceValue)
    if (identity.appearsInflected) {
      return { status: 'needs_review', reasonCode: 'grammatical_form' }
    }
    if (/^(?:Zamawiający|Klienci|Klient)\s*:?/i.test(input.sourceValue)) {
      return { status: 'needs_review', reasonCode: 'weak_context' }
    }
  }

  if (def.valueType === 'address') {
    if (!addressSourceValid(input.sourceValue)) {
      return { status: 'needs_review', reasonCode: 'weak_context' }
    }
  }

  if (def.valueType === 'location') {
    if (/^(?:Miejsce przyjęcia|Ceremonia|Przygotowania|Miejsce|Lokalizacja)\s*:/i.test(input.sourceValue)) {
      return { status: 'needs_review', reasonCode: 'weak_context' }
    }
    if (
      !contextSupportsFieldKey(
        key,
        input.blockText,
        input.start,
        input.end,
        input.sourceValue,
      )
    ) {
      return { status: 'needs_review', reasonCode: 'ambiguous_role' }
    }
  }

  if (input.reassigned && key !== input.aiProposedFieldKey) {
    return { status: 'needs_review', reasonCode: 'ambiguous_role' }
  }

  if (
    !isShapeCompatibleWithField(input.aiProposedFieldKey, input.sourceValue) &&
    key === input.aiProposedFieldKey
  ) {
    return { status: 'invalid', reasonCode: 'unsupported_role' }
  }

  if (
    def.replacementPolicy === 'context_sensitive' &&
    !contextSupportsFieldKey(
      key,
      input.blockText,
      input.start,
      input.end,
      input.sourceValue,
    )
  ) {
    return { status: 'needs_review', reasonCode: 'weak_context' }
  }

  if (/%\s*$/.test(input.sourceValue)) {
    return { status: 'invalid', reasonCode: 'percentage_not_scalar' }
  }

  return { status: 'valid' }
}

export function evaluateOccurrenceValidation(input: {
  fieldKey: ContractFieldKey
  block: IndexedDocxBlock
  sourceValue: string
  start: number
  end: number
  spanStatus: 'resolved' | 'not_found' | 'ambiguous'
  occurrenceCount: number
  generationInput?: ContractGenerationInput
  providerRejected?: boolean
  providerReason?: string
  overlapWithFieldKey?: ContractFieldKey
  occurrenceReplacementMode?: 'direct_value' | 'location_name_inflected' | 'manual_review_required'
}): OccurrenceValidationDimensions & {
  aiProposedFieldKey: ContractFieldKey
  valueShape: ValueShapeResult
} {
  const contextResolution = resolveFieldKeyFromContext({
    proposedFieldKey: input.fieldKey,
    blockText: input.block.text,
    start: input.start,
    end: input.end,
    exactValue: input.sourceValue,
  })

  const source = evaluateSourceValidity({
    fieldKey: input.fieldKey,
    blockId: input.block.id,
    blockText: input.block.text,
    sourceValue: input.sourceValue,
    start: input.start,
    end: input.end,
    spanStatus: input.spanStatus,
    occurrenceCount: input.occurrenceCount,
    providerRejected: input.providerRejected,
    providerReason: input.providerReason,
    overlapWithFieldKey: input.overlapWithFieldKey,
  })

  let semantic: SemanticValidity =
    source.status === 'valid'
      ? evaluateSemanticRole({
          aiProposedFieldKey: contextResolution.aiProposedFieldKey,
          fieldKey: contextResolution.fieldKey,
          blockText: input.block.text,
          sourceValue: input.sourceValue,
          start: input.start,
          end: input.end,
          valueShape: contextResolution.valueShape,
          providerReason: input.providerReason,
          reassigned: contextResolution.reassigned,
        })
      : { status: 'valid' }

  const manualText =
    input.occurrenceReplacementMode === 'manual_review_required'
      ? ('narrative_phrase' as const)
      : input.occurrenceReplacementMode === 'location_name_inflected'
        ? ('grammatical_inflection' as const)
        : undefined

  let replacement =
    input.generationInput && source.status === 'valid'
      ? resolveTargetValue({
          fieldKey: contextResolution.fieldKey,
          sourceValue: input.sourceValue,
          generationInput: input.generationInput,
          manualTextRequired: Boolean(manualText),
          manualReason: manualText,
        })
      : { status: 'not_applicable' as const }

  return {
    source,
    semantic,
    replacement,
    resolvedFieldKey: contextResolution.fieldKey,
    contextScore: contextResolution.score,
    aiProposedFieldKey: contextResolution.aiProposedFieldKey,
    valueShape: contextResolution.valueShape,
  }
}

export function legacyValidationStatusFromDimensions(
  dims: OccurrenceValidationDimensions,
): 'valid' | 'needs_review' | 'rejected' {
  if (dims.source.status === 'invalid') return 'rejected'
  if (dims.semantic.status === 'invalid') return 'rejected'
  if (dims.semantic.status === 'needs_review') return 'needs_review'
  if (dims.replacement.status === 'manual_text_required') return 'needs_review'
  if (dims.replacement.status === 'missing_target_value') return 'needs_review'
  return 'valid'
}

export function legacyRejectionReasonFromDimensions(
  dims: OccurrenceValidationDimensions,
): string | undefined {
  if (dims.source.status === 'invalid') return dims.source.reasonCode
  if (dims.semantic.status === 'invalid') return dims.semantic.reasonCode
  return undefined
}
