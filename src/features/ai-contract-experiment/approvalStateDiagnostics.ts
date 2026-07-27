/**
 * DEV diagnostics for approval state tracing.
 */

import type { ValidatedAiMapping } from './types'

export type ApprovalStateSource =
  | 'review_ui'
  | 'experiment_store'
  | 'readiness'
  | 'metrics'
  | 'renderer'

export function logApprovalState(input: {
  experimentRunId: string
  source: ApprovalStateSource
  mappings: ValidatedAiMapping[]
}): void {
  if (typeof import.meta === 'undefined' || !import.meta.env?.DEV) return

  const counts = {
    valid: 0,
    pending: 0,
    approved: 0,
    rejectedByUser: 0,
    manuallyMapped: 0,
  }

  for (const m of input.mappings) {
    if (m.validationStatus === 'valid') counts.valid++
    if (m.approvalStatus === 'pending') counts.pending++
    if (m.approvalStatus === 'approved') counts.approved++
    if (m.approvalStatus === 'rejected_by_user') counts.rejectedByUser++
    if (m.approvalStatus === 'manually_mapped') counts.manuallyMapped++
  }

  console.info('[ai-contract-mapping-approval-state]', {
    experimentRunId: input.experimentRunId,
    source: input.source,
    mappings: input.mappings.map((m) => ({
      mappingId: m.id,
      fieldKey: m.fieldKey,
      validationStatus: m.validationStatus,
      approvalStatus: m.approvalStatus,
      pairedFieldGroup: m.pairedFieldGroup ?? null,
    })),
    counts,
  })
}
