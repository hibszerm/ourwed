/**
 * Legacy adapters — graph ↔ validatedMappings for migration only.
 */

import type {
  ContractOccurrence,
  ContractOccurrenceGraph,
  ValidatedAiMapping,
} from '../types'

export function occurrenceToValidatedMapping(
  occurrence: ContractOccurrence,
  experimentRunId: string,
): ValidatedAiMapping {
  return {
    id: occurrence.id,
    experimentRunId,
    fieldKey: occurrence.fieldKey,
    blockId: occurrence.blockId,
    paragraphIndex: occurrence.paragraphIndex,
    tableIndex: occurrence.physicalRange.tableIndex,
    rowIndex: occurrence.physicalRange.rowIndex,
    cellIndex: occurrence.physicalRange.cellIndex,
    start: occurrence.physicalRange.start,
    end: occurrence.physicalRange.end,
    sourceText: occurrence.sourceValue,
    aiExactValue: occurrence.sourceValue,
    evidenceText: String(occurrence.diagnostics?.evidenceText ?? occurrence.sourceValue),
    resolvedExactValue: occurrence.sourceValue,
    resolutionMethod:
      occurrence.origin === 'manual'
        ? 'manual'
        : occurrence.origin === 'validator'
          ? 'refined_by_validator'
          : 'ai_exact',
    occurrenceCount: 1,
    confidence: occurrence.confidence,
    confidenceScore: occurrence.confidenceScore,
    validationStatus: occurrence.validationStatus,
    approvalStatus: occurrence.approvalStatus,
    rejectionReason: occurrence.rejectionReason,
    pairedFieldGroup: occurrence.pairedFieldGroup,
    targetValue: occurrence.targetValue,
    replacementValue: occurrence.targetValue,
    customReplacementValue: occurrence.customReplacement,
    relatedPrimaryMappingId: occurrence.relatedPrimaryOccurrenceId,
    grammaticalForm: occurrence.grammaticalForm,
    validationDimensions: occurrence.validationDimensions,
    occurrenceReplacementMode:
      occurrence.replacementStrategy === 'CUSTOM_TEXT_REQUIRED'
        ? 'manual_review_required'
        : occurrence.replacementStrategy === 'IGNORE_OCCURRENCE'
          ? undefined
          : 'direct_value',
    occurrenceOrigin:
      occurrence.origin === 'validator'
        ? 'validator_detected'
        : occurrence.origin === 'manual'
          ? 'manual'
          : 'ai_proposal',
  }
}

export function graphToValidatedMappings(
  graph: ContractOccurrenceGraph,
): ValidatedAiMapping[] {
  return graph.occurrences.map((o) =>
    occurrenceToValidatedMapping(o, graph.experimentRunId),
  )
}

export function validatedMappingToOccurrence(
  mapping: ValidatedAiMapping,
  experimentRunId: string,
): ContractOccurrence {
  const sourceValue = mapping.resolvedExactValue || mapping.sourceText
  return {
    id:
      mapping.id ??
      `${experimentRunId}:${mapping.fieldKey}:${mapping.blockId}:${mapping.start}:${mapping.end}`,
    fieldKey: mapping.fieldKey,
    blockId: mapping.blockId,
    paragraphIndex: mapping.paragraphIndex,
    physicalRange: {
      start: mapping.start,
      end: mapping.end,
      tableIndex: mapping.tableIndex,
      rowIndex: mapping.rowIndex,
      cellIndex: mapping.cellIndex,
    },
    replacementStrategy: 'AUTO_REPLACE',
    sourceValue,
    targetValue: mapping.targetValue ?? mapping.replacementValue ?? '',
    replacementValue: mapping.targetValue ?? mapping.replacementValue ?? '',
    customReplacement: mapping.customReplacementValue,
    approvalStatus: mapping.approvalStatus,
    validationStatus: mapping.validationStatus,
    origin:
      mapping.occurrenceOrigin === 'validator_detected'
        ? 'validator'
        : mapping.resolutionMethod === 'manual'
          ? 'manual'
          : 'ai',
    confidence: mapping.confidence,
    confidenceScore: mapping.confidenceScore,
    pairedFieldGroup: mapping.pairedFieldGroup,
    relatedPrimaryOccurrenceId: mapping.relatedPrimaryMappingId,
    rejectionReason: mapping.rejectionReason,
    grammaticalForm: mapping.grammaticalForm,
    validationDimensions: mapping.validationDimensions,
    diagnostics: {
      evidenceText: mapping.evidenceText,
      resolutionMethod: mapping.resolutionMethod,
      occurrenceReplacementMode: mapping.occurrenceReplacementMode,
    },
  }
}
