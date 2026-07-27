/**
 * Mapping diagnostics summary for experiment review.
 */

import { EXPERIMENT_REQUIRED_FIELD_KEYS } from './fieldRegistry'
import type {
  MappingDiagnosticsSummary,
  ProposalDiagnostic,
  ValidatedAiMapping,
} from './types'

export function buildProposalDiagnostics(
  mappings: ValidatedAiMapping[],
): ProposalDiagnostic[] {
  return mappings.map((m) => ({
    fieldKey: m.fieldKey,
    blockId: m.blockId,
    aiExactValue: m.aiExactValue,
    evidenceText: m.evidenceText,
    resolvedExactValue: m.resolvedExactValue,
    occurrenceCount: m.occurrenceCount,
    start: m.start,
    end: m.end,
    resolutionMethod: m.resolutionMethod,
    fieldValidation: m.fieldValidation,
    overlapValidation: m.overlapValidation,
    finalStatus: m.validationStatus,
    rejectionReason: m.rejectionReason,
  }))
}

export function buildMappingDiagnosticsSummary(
  mappings: ValidatedAiMapping[],
): MappingDiagnosticsSummary {
  const requiredKeys = new Set(EXPERIMENT_REQUIRED_FIELD_KEYS)
  const approved = mappings.filter(
    (m) =>
      m.validationStatus === 'valid' &&
      (m.approvalStatus === 'approved' || m.approvalStatus === 'manually_mapped'),
  )
  const approvedRequired = approved.filter((m) => requiredKeys.has(m.fieldKey))

  return {
    aiProposalCount: mappings.length,
    exactAcceptedCount: mappings.filter(
      (m) =>
        m.validationStatus === 'valid' && m.resolutionMethod === 'ai_exact',
    ).length,
    refinedCount: mappings.filter(
      (m) =>
        m.validationStatus === 'valid' &&
        m.resolutionMethod === 'refined_by_validator',
    ).length,
    needsReviewCount: mappings.filter(
      (m) => m.validationStatus === 'needs_review',
    ).length,
    rejectedCount: mappings.filter((m) => m.validationStatus === 'rejected')
      .length,
    requiredReadyCount: approvedRequired.length,
    requiredMissingCount: EXPERIMENT_REQUIRED_FIELD_KEYS.filter(
      (k) => !approved.some((m) => m.fieldKey === k),
    ).length,
  }
}
