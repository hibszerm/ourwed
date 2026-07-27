/**
 * Required-field readiness from canonical reviewed mappings (not AI confidence).
 */

import {
  allRequiredFieldKeys,
  deriveExperimentalTemplateRequirements,
} from './templateShapeRequirements'
import {
  hasApprovedMappingForKey,
  mappingsForFieldKey,
} from './logicalFieldGrouping'
import {
  isOccurrenceResolved,
  unresolvedOccurrenceBlockers,
} from './occurrenceResolution'
import type {
  ContractFieldKey,
  IndexedDocxBlock,
  MappingReadinessStatus,
  StructuredAiMappingResponse,
  ValidatedAiMapping,
} from './types'

function mappingForKey(
  mappings: ValidatedAiMapping[],
  key: ContractFieldKey,
): ValidatedAiMapping | undefined {
  return mappingsForFieldKey(mappings, key)[0]
}

function isApproved(m: ValidatedAiMapping): boolean {
  return (
    m.validationStatus === 'valid' &&
    (m.approvalStatus === 'approved' || m.approvalStatus === 'manually_mapped')
  )
}

export function requiredKeysForReadiness(input: {
  blocks: IndexedDocxBlock[]
  response?: StructuredAiMappingResponse
  mappings?: ValidatedAiMapping[]
}): ContractFieldKey[] {
  const requirements = deriveExperimentalTemplateRequirements({
    blocks: input.blocks,
    mappings: input.mappings,
    response: input.response,
  })
  return allRequiredFieldKeys(requirements)
}

export function evaluateExperimentalMappingReadiness(input: {
  blocks: IndexedDocxBlock[]
  response?: StructuredAiMappingResponse
  mappings: ValidatedAiMapping[]
}): MappingReadinessStatus {
  const requiredKeys = requiredKeysForReadiness(input)

  const hasRequiredOverlap = requiredKeys.some((key) => {
    const m = mappingForKey(input.mappings, key)
    return m?.rejectionReason?.startsWith('overlap_with')
  })

  if (hasRequiredOverlap) return 'invalid'

  const criticalRequiredReject = requiredKeys.filter((key) => {
    const m = mappingForKey(input.mappings, key)
    if (!m || m.validationStatus !== 'rejected') return false
    const reason = m.rejectionReason ?? ''
    const dims = m.validationDimensions
    if (dims?.source.status === 'invalid') return true
    if (
      dims?.semantic.status === 'invalid' &&
      (dims.semantic.reasonCode === 'provider_data' ||
        dims.semantic.reasonCode === 'bank_account')
    ) {
      return true
    }
    return (
      reason.includes('provider') ||
      reason.includes('overlap_with') ||
      reason === 'date_parse_failed' ||
      reason === 'non_minimal_date_span'
    )
  })
  if (criticalRequiredReject.length > 0) return 'invalid'

  for (const key of requiredKeys) {
    const fieldMappings = mappingsForFieldKey(input.mappings, key)
    if (!fieldMappings.some((m) => m.validationStatus !== 'rejected')) {
      return 'incomplete'
    }
  }

  const userRejectedRequired = requiredKeys.filter((key) => {
    return mappingsForFieldKey(input.mappings, key).some(
      (m) => m.approvalStatus === 'rejected_by_user',
    )
  })
  if (userRejectedRequired.length > 0) return 'incomplete'

  const requiredNeedsReview = requiredKeys.filter((key) => {
    return mappingsForFieldKey(input.mappings, key).some(
      (m) => m.validationStatus === 'needs_review' && !isOccurrenceResolved(m),
    )
  })

  const pendingRequired = requiredKeys.filter((key) => {
    return mappingsForFieldKey(input.mappings, key).some(
      (m) =>
        m.validationStatus === 'valid' &&
        m.approvalStatus === 'pending' &&
        !isOccurrenceResolved(m),
    )
  })

  if (unresolvedOccurrenceBlockers(input.mappings).length > 0) {
    return 'needs_review'
  }

  if (requiredNeedsReview.length > 0 || pendingRequired.length > 0) {
    return 'needs_review'
  }

  const allRequiredApproved = requiredKeys.every((key) =>
    hasApprovedMappingForKey(input.mappings, key),
  )
  if (!allRequiredApproved) return 'incomplete'

  const pairGroups = new Set(
    input.mappings
      .filter((m) => m.pairedFieldGroup && m.validationStatus === 'valid')
      .map((m) => m.pairedFieldGroup!),
  )
  for (const group of pairGroups) {
    const members = input.mappings.filter(
      (m) => m.pairedFieldGroup === group && m.validationStatus === 'valid',
    )
    if (members.length < 2) continue
    const anyApproved = members.some(isApproved)
    const allApproved = members.every(isApproved)
    if (anyApproved && !allApproved) return 'needs_review'
  }

  return 'ready'
}

/** @deprecated Use evaluateExperimentalMappingReadiness */
export function computeMappingReadiness(input: {
  blocks: IndexedDocxBlock[]
  response?: StructuredAiMappingResponse
  mappings: ValidatedAiMapping[]
}): MappingReadinessStatus {
  return evaluateExperimentalMappingReadiness(input)
}

export function approvedMappings(
  mappings: ValidatedAiMapping[],
): ValidatedAiMapping[] {
  return mappings.filter(isApproved)
}

export function mappingReadinessLabel(status: MappingReadinessStatus): string {
  switch (status) {
    case 'ready':
      return 'Gotowe'
    case 'needs_review':
      return 'Wymaga sprawdzenia'
    case 'incomplete':
      return 'Niekompletne'
    case 'invalid':
      return 'Nieprawidłowe'
  }
}
