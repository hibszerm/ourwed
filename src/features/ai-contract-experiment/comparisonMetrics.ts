/**
 * Comparison metrics for experiment runs.
 */

import { EXPERIMENT_REQUIRED_FIELD_KEYS } from './fieldRegistry'
import type {
  ExperimentComparisonMetrics,
  ExperimentRunResult,
} from './types'

export function buildExperimentMetrics(
  partial: Partial<ExperimentComparisonMetrics> & {
    result?: Pick<
      ExperimentRunResult,
      | 'validatedMappings'
      | 'fullAiSafety'
      | 'run'
      | 'mode'
      | 'renderAudit'
    >
  },
): ExperimentComparisonMetrics {
  const r = partial.result
  const valid =
    r?.validatedMappings?.filter((m) => m.validationStatus === 'valid') ?? []
  const invalid =
    r?.validatedMappings?.filter((m) => m.validationStatus === 'rejected')
      .length ?? partial.invalidMappings ?? 0
  const detectedKeys = new Set(valid.map((m) => m.fieldKey))
  const approvedCount =
    r?.validatedMappings?.filter(
      (m) =>
        m.validationStatus === 'valid' &&
        (m.approvalStatus === 'approved' || m.approvalStatus === 'manually_mapped'),
    ).length ?? partial.approvedMappings ?? 0
  if (r?.mode === 'full_ai') {
    // full AI metrics from safety + analysis carried elsewhere
  }
  const requiredFieldsDetected = EXPERIMENT_REQUIRED_FIELD_KEYS.filter((k) =>
    detectedKeys.has(k),
  ).length

  const cost = r?.run.usage?.estimatedCostPln
  return {
    requiredFieldsDetected:
      partial.requiredFieldsDetected ?? requiredFieldsDetected,
    optionalFieldsDetected:
      partial.optionalFieldsDetected ??
      Math.max(0, detectedKeys.size - requiredFieldsDetected),
    invalidMappings: invalid,
    unauthorizedChanges:
      partial.unauthorizedChanges ??
      r?.fullAiSafety?.unauthorizedChangeCount ??
      0,
    fieldsManuallyCorrected: partial.fieldsManuallyCorrected ?? 0,
    generationSuccess: partial.generationSuccess ?? r?.run.status === 'completed',
    auditStatus:
      partial.auditStatus ??
      r?.fullAiSafety?.status ??
      (r?.mode === 'structured_mapping' ? 'n/a' : 'unknown'),
    requestCount: partial.requestCount ?? r?.run.usage?.requestCount ?? null,
    totalDurationMs: partial.totalDurationMs ?? r?.run.timing.totalMs ?? null,
    estimatedCostPln:
      partial.estimatedCostPln !== undefined
        ? partial.estimatedCostPln
        : cost === undefined
          ? 'Brak danych'
          : cost,
    changedSourceBlocks: partial.changedSourceBlocks ?? 0,
    rendererOperations: partial.rendererOperations ?? 0,
    approvedMappings: approvedCount,
    plannedRendererOperations:
      partial.plannedRendererOperations ?? approvedCount,
    validMappings:
      partial.validMappings ??
      r?.validatedMappings?.filter((m) => m.validationStatus === 'valid').length ??
      valid.length,
    pendingMappings:
      partial.pendingMappings ??
      r?.validatedMappings?.filter((m) => m.approvalStatus === 'pending').length ??
      0,
    rejectedMappings:
      partial.rejectedMappings ??
      r?.validatedMappings?.filter((m) => m.approvalStatus === 'rejected_by_user')
        .length ??
      0,
    manualMappings:
      partial.manualMappings ??
      r?.validatedMappings?.filter((m) => m.approvalStatus === 'manually_mapped')
        .length ??
      0,
    replacedParagraphs: partial.replacedParagraphs ?? 0,
    immutableBlocksChecked:
      partial.immutableBlocksChecked ??
      r?.renderAudit?.immutableBlocksChecked ??
      0,
    auditIssues:
      partial.auditIssues ?? r?.renderAudit?.issues.length ?? 0,
  }
}
