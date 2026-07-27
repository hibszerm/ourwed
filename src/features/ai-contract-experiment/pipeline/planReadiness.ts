/**
 * Readiness derived exclusively from RenderPlan.
 */

import { blockedOperations, buildRenderPlan, isPlanExecutable } from './buildRenderPlan'
import type {
  ContractOccurrenceGraph,
  MappingReadinessStatus,
  RenderPlan,
} from '../types'

export function evaluatePlanReadiness(plan: RenderPlan): MappingReadinessStatus {
  const blocked = blockedOperations(plan)
  const hasRejectedRequired = plan.operations.some(
    (op) =>
      op.status === 'SKIPPED' &&
      op.strategy !== 'IGNORE_OCCURRENCE' &&
      blocked.some((b) => b.occurrenceId === op.occurrenceId),
  )

  if (hasRejectedRequired) return 'incomplete'

  if (blocked.length > 0) {
    const allBlockedAreReviewable = blocked.every(
      (op) =>
        op.strategy === 'CUSTOM_TEXT_REQUIRED' || op.strategy === 'CONFIRM_ONLY',
    )
    return allBlockedAreReviewable ? 'needs_review' : 'incomplete'
  }

  return isPlanExecutable(plan) ? 'ready' : 'needs_review'
}

export function evaluateGraphReadiness(graph: ContractOccurrenceGraph): MappingReadinessStatus {
  const invalid = graph.occurrences.some((o) => {
    const dims = o.validationDimensions
    if (dims?.source.status === 'invalid') return true
    if (
      dims?.semantic.status === 'invalid' &&
      (dims.semantic.reasonCode === 'provider_data' ||
        dims.semantic.reasonCode === 'bank_account')
    ) {
      return true
    }
    const reason = o.rejectionReason ?? ''
    return (
      o.validationStatus === 'rejected' &&
      (reason.includes('provider') ||
        reason.includes('overlap_with') ||
        reason === 'date_parse_failed' ||
        reason === 'non_minimal_date_span')
    )
  })
  if (invalid) return 'invalid'

  return evaluatePlanReadiness(buildRenderPlan(graph))
}

export function mappingReadinessFromGraph(
  graph: ContractOccurrenceGraph,
): MappingReadinessStatus {
  return evaluateGraphReadiness(graph)
}
