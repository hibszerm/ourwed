/**
 * Canonical accessors for occurrence replacement targets.
 * All pipeline consumers must use these instead of legacy top-level fields.
 */

import type { ContractOccurrence, ValidatedAiMapping } from '../types'
import type { ReplacementReadiness } from './types'
import { devWarnArgs } from '@/lib/debug/devConsole'

export function getReplacementReadiness(
  occurrence: Pick<ContractOccurrence, 'validationDimensions'>,
): ReplacementReadiness | undefined {
  return occurrence.validationDimensions?.replacement
}

export function getOccurrenceTargetValue(
  occurrence: Pick<
    ContractOccurrence,
    'validationDimensions' | 'targetValue' | 'replacementValue'
  >,
): string | undefined {
  const r = getReplacementReadiness(occurrence)
  if (r) {
    if (r.status === 'ready' || r.status === 'manual_text_required') {
      const value = r.targetValue?.trim()
      return value ? value : undefined
    }
    return undefined
  }
  const mirrored =
    occurrence.replacementValue?.trim() || occurrence.targetValue?.trim()
  return mirrored ? mirrored : undefined
}

export function getExecutableReplacementValue(
  occurrence: ContractOccurrence,
): string {
  if (occurrence.replacementStrategy === 'IGNORE_OCCURRENCE') return ''
  if (occurrence.replacementStrategy === 'CUSTOM_TEXT_REQUIRED') {
    return occurrence.customReplacement?.trim() ?? ''
  }
  return getOccurrenceTargetValue(occurrence) ?? ''
}

export function getMappingTargetValue(
  mapping: Pick<ValidatedAiMapping, 'validationDimensions'>,
): string | undefined {
  const r = mapping.validationDimensions?.replacement
  if (!r) return undefined
  if (r.status === 'ready' || r.status === 'manual_text_required') {
    const value = r.targetValue?.trim()
    return value ? value : undefined
  }
  return undefined
}

export function assertReplacementInvariant(
  occurrence: ContractOccurrence,
  context: string,
): void {
  if (import.meta.env?.PROD) return
  const target = getOccurrenceTargetValue(occurrence)
  const readiness = getReplacementReadiness(occurrence)
  if (
    readiness?.status === 'ready' &&
    (!target || target.length === 0)
  ) {
    devWarnArgs(`[occurrence-invariant] ready without target in ${context}`, occurrence.id)
  }
  if (
    occurrence.replacementStrategy === 'AUTO_REPLACE' &&
    readiness?.status === 'missing_target_value'
  ) {
    devWarnArgs(`[occurrence-invariant] AUTO_REPLACE with missing target in ${context}`, occurrence.id)
  }
}
