/**
 * DEV trace for logical field occurrences.
 */

import { unresolvedOccurrenceBlockers } from './occurrenceResolution'
import type { ContractFieldKey, IndexedDocxBlock, ValidatedAiMapping } from './types'

export function logLogicalFieldOccurrenceTrace(input: {
  experimentRunId: string
  fieldKey: ContractFieldKey
  blocks: IndexedDocxBlock[]
  mappings: ValidatedAiMapping[]
  rendererOperations?: number
}): void {
  if (typeof import.meta === 'undefined' || !import.meta.env?.DEV) return

  const fieldMappings = input.mappings.filter((m) => m.fieldKey === input.fieldKey)
  const approved = fieldMappings.filter(
    (m) =>
      m.validationStatus === 'valid' &&
      (m.approvalStatus === 'approved' || m.approvalStatus === 'manually_mapped'),
  )

  console.info('[ai-contract-logical-field-occurrence-trace]', {
    experimentRunId: input.experimentRunId,
    fieldKey: input.fieldKey,
    sourceCandidates: fieldMappings.map((m) => ({
      blockId: m.blockId,
      exactValue: m.resolvedExactValue || m.sourceText,
      grammaticalForm: m.grammaticalForm ?? 'canonical',
      semanticContext: m.evidenceText,
      classification: m.occurrenceOrigin ?? 'ai_proposal',
    })),
    aiReturnedMappings: fieldMappings
      .filter((m) => m.occurrenceOrigin !== 'validator_detected')
      .map((m) => m.id),
    validatedMappings: fieldMappings.map((m) => m.id),
    approvedMappings: approved.map((m) => m.id),
    rendererOperations: input.rendererOperations ?? approved.length,
    unboundSemanticOccurrences: unresolvedOccurrenceBlockers(fieldMappings).map((m) => ({
      mappingId: m.id,
      blockId: m.blockId,
      exactValue: m.resolvedExactValue || m.sourceText,
    })),
  })
}
