/**
 * Mode B — deterministic mapping validation (exactValue spans only).
 */

import { confidenceToScore, isExperimentDynamicFieldKey } from './fieldRegistry'
import { findBlockById } from './indexedDocx'
import { resolveExactSpan } from './mappingBoundaryResolver'
import { applyCrossFieldConsistency } from './validation/crossFieldConsistency'
import { applySpanOwnershipToMappings } from './validation/applySpanOwnership'
import {
  evaluateOccurrenceValidation,
  legacyRejectionReasonFromDimensions,
  legacyValidationStatusFromDimensions,
} from './validation/occurrenceValidation'
import { normalizeIdentityForComparison } from './validation/identityNormalization'
import {
  approveMapping,
  canContinueMappingReview,
  rejectMapping,
  restoreMappingDecision,
} from './experimentalMappingApproval'
import { createMappingId } from './mappingId'
import { classifyOccurrenceReplacementMode } from './locationOccurrenceDetection'
import {
  normalizeReciprocalPairGroups,
  validatePairedFieldGroups,
} from './pairedFieldGroupValidation'
import { validateSpanProviderExclusion } from './providerExclusion'
import type {
  AiMappingConfidenceLevel,
  ContractFieldKey,
  ContractGenerationInput,
  IndexedDocxBlock,
  StructuredAiFieldProposal,
  StructuredAiMappingResponse,
  ValidatedAiMapping,
} from './types'

function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

function normalizeConfidence(
  value: 'high' | 'medium' | 'low' | number | undefined,
): { level: AiMappingConfidenceLevel; score: number } {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return { level: value, score: confidenceToScore(value) }
  }
  if (typeof value === 'number') {
    if (value >= 0.85) return { level: 'high', score: value }
    if (value >= 0.65) return { level: 'medium', score: value }
    return { level: 'low', score: value }
  }
  return { level: 'medium', score: 0.75 }
}

function baseRejected(
  field: StructuredAiFieldProposal,
  conf: { level: AiMappingConfidenceLevel; score: number },
  reason: string,
  fieldKey: ContractFieldKey = field.fieldKey,
): ValidatedAiMapping {
  return {
    fieldKey,
    blockId: field.blockId,
    paragraphIndex: -1,
    start: -1,
    end: -1,
    sourceText: field.exactValue,
    aiExactValue: field.exactValue,
    evidenceText: field.evidenceText,
    resolvedExactValue: field.exactValue,
    resolutionMethod: 'ai_exact',
    occurrenceCount: 0,
    contextBefore: field.contextBefore,
    contextAfter: field.contextAfter,
    semanticRole: field.semanticRole,
    reasoning: field.reasoning,
    confidence: conf.level,
    confidenceScore: conf.score,
    validationStatus: 'rejected',
    approvalStatus: 'pending',
    rejectionReason: reason,
    pairedFieldGroup: field.pairedFieldGroup,
  }
}

function validateProposal(
  field: StructuredAiFieldProposal,
  blocks: IndexedDocxBlock[],
  accepted: ValidatedAiMapping[],
  manualExactValue?: string,
  immutableFindings?: StructuredAiMappingResponse['immutableFindings'],
  generationInput?: ContractGenerationInput,
): ValidatedAiMapping {
  const conf = normalizeConfidence(field.confidence)

  if (!isExperimentDynamicFieldKey(field.fieldKey)) {
    return baseRejected(field, conf, `invented_registry_key:${field.fieldKey}`, 'couple_full_names')
  }

  if (!field.exactValue?.trim() || !field.evidenceText?.trim()) {
    return baseRejected(field, conf, 'empty_exact_or_evidence')
  }

  const block = findBlockById(blocks, field.blockId)
  if (!block) return baseRejected(field, conf, 'invalid_block_id')

  if (!block.text.includes(field.exactValue)) {
    return baseRejected(field, conf, 'exact_value_not_in_block')
  }

  const normalizedEvidence = field.evidenceText.replace(/\u2026/g, '')
  const evidenceOk =
    block.text.includes(field.evidenceText) ||
    block.text.includes(normalizedEvidence) ||
    field.evidenceText === block.text ||
    (block.text.includes(field.exactValue) &&
      normalizedEvidence.includes(field.exactValue))
  if (!evidenceOk) {
    return baseRejected(field, conf, 'evidence_not_in_block')
  }

  if (
    block.text.includes(field.evidenceText) &&
    field.evidenceText !== field.exactValue &&
    field.evidenceText !== block.text &&
    !field.evidenceText.includes(field.exactValue) &&
    !normalizedEvidence.includes(field.exactValue)
  ) {
    return baseRejected(field, conf, 'exact_not_in_evidence')
  }

  const { boundary, span } = resolveExactSpan({
    proposal: field,
    blockText: block.text,
    manualExactValue,
  })

  if (span.status === 'not_found') {
    return {
      ...baseRejected(field, conf, 'exact_value_not_found'),
      ...boundary,
      resolvedExactValue: boundary.resolvedExactValue,
      resolutionMethod: boundary.resolutionMethod,
    }
  }

  if (span.status === 'ambiguous') {
    return {
      fieldKey: field.fieldKey,
      blockId: field.blockId,
      paragraphIndex: block.paragraphIndex,
      tableIndex: block.kind === 'tableCell' ? block.tableIndex : undefined,
      rowIndex: block.kind === 'tableCell' ? block.rowIndex : undefined,
      cellIndex: block.kind === 'tableCell' ? block.cellIndex : undefined,
      start: -1,
      end: -1,
      sourceText: boundary.resolvedExactValue,
      aiExactValue: field.exactValue,
      evidenceText: field.evidenceText,
      resolvedExactValue: boundary.resolvedExactValue,
      resolutionMethod: boundary.resolutionMethod,
      occurrenceCount: span.occurrenceCount,
      contextBefore: field.contextBefore,
      contextAfter: field.contextAfter,
      semanticRole: field.semanticRole,
      reasoning: field.reasoning,
      confidence: conf.level,
      confidenceScore: conf.score,
      validationStatus: 'needs_review',
      approvalStatus: 'pending',
      rejectionReason: 'ambiguous_exact_value_occurrence',
      pairedFieldGroup: field.pairedFieldGroup,
      fieldValidation: 'ambiguous',
    }
  }

  const start = span.start!
  const end = span.end!
  const exact = boundary.resolvedExactValue

  const providerCheck = validateSpanProviderExclusion({
    fieldKey: field.fieldKey,
    block,
    exactValue: exact,
    start,
    end,
    immutableFindings,
  })

  const overlap = accepted.find(
    (a) => a.blockId === field.blockId && rangesOverlap(a, { start, end }),
  )

  const isLocationField =
    field.fieldKey === 'preparation_location' ||
    field.fieldKey === 'ceremony_location' ||
    field.fieldKey === 'reception_location'

  const occurrenceReplacementMode = isLocationField
    ? classifyOccurrenceReplacementMode(
        {
          fieldKey: field.fieldKey,
          blockId: field.blockId,
          resolvedExactValue: exact,
          sourceText: exact,
          start,
        },
        block,
        generationInput,
      )
    : 'direct_value'

  const grammaticalForm = isLocationField
    ? occurrenceReplacementMode === 'direct_value'
      ? 'canonical'
      : 'inflected'
    : undefined

  const dimensions = evaluateOccurrenceValidation({
    fieldKey: field.fieldKey,
    block,
    sourceValue: exact,
    start,
    end,
    spanStatus: span.status,
    occurrenceCount: span.occurrenceCount,
    generationInput,
    providerRejected: !providerCheck.ok,
    providerReason: providerCheck.ok ? undefined : providerCheck.reason,
    overlapWithFieldKey: overlap?.fieldKey,
    occurrenceReplacementMode,
  })

  const identityNorm =
    field.fieldKey === 'couple_full_names'
      ? normalizeIdentityForComparison(exact)
      : undefined

  const validationStatus = legacyValidationStatusFromDimensions(dimensions)
  const rejectionReason = legacyRejectionReasonFromDimensions(dimensions)

  const candidate: ValidatedAiMapping = {
    fieldKey: dimensions.resolvedFieldKey,
    blockId: field.blockId,
    paragraphIndex: block.paragraphIndex,
    tableIndex: block.kind === 'tableCell' ? block.tableIndex : undefined,
    rowIndex: block.kind === 'tableCell' ? block.rowIndex : undefined,
    cellIndex: block.kind === 'tableCell' ? block.cellIndex : undefined,
    start,
    end,
    sourceText: exact,
    aiExactValue: field.exactValue,
    evidenceText: field.evidenceText,
    resolvedExactValue: exact,
    resolutionMethod: boundary.resolutionMethod,
    occurrenceCount: span.occurrenceCount,
    contextBefore: field.contextBefore,
    contextAfter: field.contextAfter,
    semanticRole: field.semanticRole,
    reasoning: field.reasoning,
    confidence: conf.level,
    confidenceScore: conf.score,
    validationStatus,
    approvalStatus: 'pending',
    rejectionReason,
    pairedFieldGroup: field.pairedFieldGroup,
    fieldValidation:
      dimensions.semantic.status === 'needs_review'
        ? dimensions.semantic.reasonCode
        : validationStatus === 'valid'
          ? 'passed'
          : dimensions.source.status === 'invalid'
            ? dimensions.source.reasonCode
            : dimensions.semantic.status === 'invalid'
              ? dimensions.semantic.reasonCode
              : 'failed',
    validationDimensions: dimensions,
    aiProposedFieldKey: dimensions.aiProposedFieldKey ?? field.fieldKey,
    occurrenceReplacementMode,
    grammaticalForm,
    sourceValueComparisonForm: identityNorm?.sourceValueComparisonForm,
    targetValue:
      dimensions.replacement.status === 'ready' ||
      dimensions.replacement.status === 'manual_text_required'
        ? dimensions.replacement.targetValue
        : undefined,
    replacementValue:
      dimensions.replacement.status === 'ready' ||
      dimensions.replacement.status === 'manual_text_required'
        ? dimensions.replacement.targetValue
        : undefined,
  }

  if (validationStatus === 'valid') {
    // accepted list maintained by validateStructuredMapping caller
  }

  return candidate
}

export function validateStructuredMapping(input: {
  response: StructuredAiMappingResponse
  blocks: IndexedDocxBlock[]
  generationInput?: ContractGenerationInput
  experimentRunId?: string
}): ValidatedAiMapping[] {
  const normalizedFields = normalizeReciprocalPairGroups(input.response.fields)
  const accepted: ValidatedAiMapping[] = []
  const out: ValidatedAiMapping[] = []

  for (const field of normalizedFields) {
    const result = validateProposal(
      field,
      input.blocks,
      accepted,
      undefined,
      input.response.immutableFindings,
      input.generationInput,
    )
    if (result.validationStatus === 'valid') {
      accepted.push(result)
    }
    out.push(result)
  }

  let validated = out
  validated = applySpanOwnershipToMappings(validated, input.blocks)
  validated = applyCrossFieldConsistency(validated)
  validated = validatePairedFieldGroups(validated)

  if (input.experimentRunId) {
    return validated.map((m) => ({
      ...m,
      experimentRunId: input.experimentRunId,
      id:
        m.id ??
        (m.start >= 0 && m.end >= 0
          ? createMappingId({
              experimentRunId: input.experimentRunId!,
              fieldKey: m.fieldKey,
              blockId: m.blockId,
              start: m.start,
              end: m.end,
            })
          : undefined),
    }))
  }
  return validated
}

export function validateManualMapping(input: {
  fieldKey: ContractFieldKey
  blockId: string
  exactValue: string
  blocks: IndexedDocxBlock[]
  existing: ValidatedAiMapping[]
}): ValidatedAiMapping {
  const synthetic: StructuredAiFieldProposal = {
    fieldKey: input.fieldKey,
    blockId: input.blockId,
    exactValue: input.exactValue,
    evidenceText: input.exactValue,
    contextBefore: '',
    contextAfter: '',
    semanticRole: 'manual',
    confidence: 'high',
    reasoning: 'manual_selection',
    pairedFieldGroup: null,
  }
  const result = validateProposal(
    synthetic,
    input.blocks,
    input.existing,
    input.exactValue,
  )
  if (result.validationStatus !== 'valid') return result

  const overlap = input.existing.find(
    (m) =>
      m.validationStatus === 'valid' &&
      m.blockId === result.blockId &&
      rangesOverlap(m, result),
  )
  if (overlap) {
    return {
      ...result,
      validationStatus: 'rejected',
      approvalStatus: 'pending',
      rejectionReason: `overlap_with:${overlap.fieldKey}`,
    }
  }

  return {
    ...result,
    approvalStatus: 'manually_mapped',
    resolutionMethod: 'manual',
    reasoning: 'manual_selection',
  }
}

export function persistableMappings(
  mappings: ValidatedAiMapping[],
): ValidatedAiMapping[] {
  return mappings.filter(
    (m) =>
      m.validationStatus === 'valid' &&
      (m.approvalStatus === 'approved' || m.approvalStatus === 'manually_mapped'),
  )
}

export function updateMappingApproval(
  mappings: ValidatedAiMapping[],
  fieldKey: ContractFieldKey,
  blockId: string,
  approval: 'approved' | 'rejected_by_user' | 'pending',
): ValidatedAiMapping[] {
  if (approval === 'approved') return approveMapping(mappings, fieldKey, blockId)
  if (approval === 'rejected_by_user') return rejectMapping(mappings, fieldKey, blockId)
  return restoreMappingDecision(mappings, fieldKey, blockId)
}

export { canContinueMappingReview }
