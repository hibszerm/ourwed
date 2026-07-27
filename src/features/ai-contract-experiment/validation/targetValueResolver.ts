/**
 * Resolve target replacement values from wedding generation input.
 * Never returns empty strings as resolved values.
 */

import { formatReplacementValue } from '../replacementValueFormatting'
import type { ContractFieldKey, ContractGenerationInput } from '../types'
import { getFieldDefinition } from './fieldDefinitionRegistry'
import type { ReplacementReadiness, TargetResolution } from './types'

export function resolveTargetResolution(input: {
  fieldKey: ContractFieldKey
  sourceValue: string
  generationInput: ContractGenerationInput
}): TargetResolution {
  const def = getFieldDefinition(input.fieldKey)
  const raw = formatReplacementValue({
    fieldKey: input.fieldKey,
    sourceExact: input.sourceValue,
    generationInput: input.generationInput,
  })
  const value = raw.trim()

  if (!value || value === 'r.' || /^r\.?$/i.test(value)) {
    if (def.replacementPolicy === 'manual_by_default') {
      return { status: 'not_applicable', reasonCode: 'manual_by_default' }
    }
    return { status: 'missing', reasonCode: 'wedding_data_missing' }
  }

  return { status: 'resolved', value }
}

export function targetResolutionToReadiness(
  resolution: TargetResolution,
  options?: {
    manualTextRequired?: boolean
    manualReason?: 'grammatical_inflection' | 'narrative_phrase' | 'unsafe_automatic_replacement'
  },
): ReplacementReadiness {
  if (resolution.status === 'not_applicable') {
    return { status: 'not_applicable' }
  }
  if (resolution.status === 'missing') {
    return { status: 'missing_target_value', reasonCode: 'wedding_data_missing' }
  }
  if (options?.manualTextRequired) {
    return {
      status: 'manual_text_required',
      reasonCode: options.manualReason ?? 'unsafe_automatic_replacement',
      targetValue: resolution.value,
    }
  }
  return { status: 'ready', targetValue: resolution.value }
}

export function resolveTargetValue(input: {
  fieldKey: ContractFieldKey
  sourceValue: string
  generationInput: ContractGenerationInput
  manualTextRequired?: boolean
  manualReason?: 'grammatical_inflection' | 'narrative_phrase' | 'unsafe_automatic_replacement'
}): ReplacementReadiness {
  const resolution = resolveTargetResolution(input)
  return targetResolutionToReadiness(resolution, {
    manualTextRequired: input.manualTextRequired,
    manualReason: input.manualReason,
  })
}
