/**
 * Derived render eligibility from canonical reviewed mappings.
 */

import type { MappingReadinessStatus, ValidatedAiMapping } from './types'

export type ExperimentalRenderEligibilityReason =
  | 'mapping_not_ready'
  | 'source_docx_missing'
  | 'required_mapping_unapproved'
  | 'invalid_mapping'
  | 'stale_source'
  | 'incomplete_pair'

export type ExperimentalRenderEligibility = {
  eligible: boolean
  reasons: ExperimentalRenderEligibilityReason[]
}

export function evaluateExperimentalRenderEligibility(input: {
  readiness: MappingReadinessStatus
  mappings: ValidatedAiMapping[]
  sourceDocxAvailable: boolean
}): ExperimentalRenderEligibility {
  const reasons: ExperimentalRenderEligibilityReason[] = []

  if (input.readiness === 'invalid') {
    reasons.push('invalid_mapping')
  }
  if (input.readiness === 'incomplete') {
    reasons.push('required_mapping_unapproved')
  }
  if (input.readiness === 'needs_review') {
    reasons.push('mapping_not_ready')
  }
  if (!input.sourceDocxAvailable) {
    reasons.push('source_docx_missing')
  }

  const pairIncomplete = input.mappings.some((m) => {
    if (!m.pairedFieldGroup || m.validationStatus !== 'valid') return false
    const members = input.mappings.filter(
      (x) => x.pairedFieldGroup === m.pairedFieldGroup && x.validationStatus === 'valid',
    )
    if (members.length < 2) return false
    const approved = members.filter(
      (x) => x.approvalStatus === 'approved' || x.approvalStatus === 'manually_mapped',
    )
    return approved.length > 0 && approved.length < members.length
  })
  if (pairIncomplete) {
    reasons.push('incomplete_pair')
  }

  const eligible =
    input.readiness === 'ready' &&
    input.sourceDocxAvailable &&
    reasons.filter((r) => r !== 'source_docx_missing').length === 0

  return {
    eligible,
    reasons: [...new Set(reasons)],
  }
}
