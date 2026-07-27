/**
 * DEV invariants for experiment approval/readiness consistency.
 */

import type { ExperimentalRenderEligibility } from './experimentalRenderEligibility'
import type { ExperimentComparisonMetrics, MappingReadinessStatus, ValidatedAiMapping } from './types'

function isApprovedDisplay(m: ValidatedAiMapping): boolean {
  return (
    m.validationStatus === 'valid' &&
    (m.approvalStatus === 'approved' || m.approvalStatus === 'manually_mapped')
  )
}

export function assertApprovalStateInvariants(input: {
  experimentRunId: string
  mappings: ValidatedAiMapping[]
  readiness: MappingReadinessStatus
  metrics: ExperimentComparisonMetrics
  renderEligibility: ExperimentalRenderEligibility
}): void {
  if (typeof import.meta === 'undefined' || !import.meta.env?.DEV) return

  const approved = input.mappings.filter(isApprovedDisplay)
  const approvedCount = approved.length
  const allValidApproved =
    input.mappings.length > 0 &&
    input.mappings.every(
      (m) => m.validationStatus !== 'valid' || isApprovedDisplay(m),
    )

  const violations: string[] = []

  if (allValidApproved && (input.readiness === 'incomplete' || input.readiness === 'needs_review')) {
    violations.push('A')
  }

  if ((input.metrics.approvedMappings ?? 0) !== approvedCount) {
    violations.push('B')
  }

  if (input.renderEligibility.eligible && input.readiness !== 'ready') {
    violations.push('C')
  }

  if (violations.length > 0) {
    console.error('[ai-contract-experiment-state-invariant-failed]', {
      experimentRunId: input.experimentRunId,
      invariant: violations,
      canonicalMappings: input.mappings,
      readiness: input.readiness,
      metrics: input.metrics,
      renderEligibility: input.renderEligibility,
    })
  }
}
