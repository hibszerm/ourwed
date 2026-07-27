/**
 * Stable mapping IDs for experiment review decisions.
 */

import type { ContractFieldKey } from './types'

export function createMappingId(input: {
  experimentRunId: string
  fieldKey: ContractFieldKey
  blockId: string
  start: number
  end: number
}): string {
  return [
    input.experimentRunId,
    input.fieldKey,
    input.blockId,
    String(input.start),
    String(input.end),
  ].join(':')
}

export function logMissingDecisionTarget(input: {
  experimentRunId: string
  mappingId: string
  action: string
}): void {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    console.warn('[ai-contract-mapping-decision-target-missing]', input)
  }
}
