/**
 * Occurrence resolution helpers for readiness and audit.
 */

import type { ValidatedAiMapping } from './types'

export function isOccurrenceResolved(m: ValidatedAiMapping): boolean {
  if (m.approvalStatus === 'ignored_immutable') return true
  if (m.approvalStatus === 'rejected_by_user') return true
  if (m.validationStatus === 'rejected') return true
  if (m.validationStatus === 'needs_review') return false
  if (
    m.validationStatus === 'valid' &&
    (m.approvalStatus === 'approved' || m.approvalStatus === 'manually_mapped')
  ) {
    if (m.occurrenceReplacementMode === 'manual_review_required' && !m.customReplacementValue) {
      return false
    }
    return true
  }
  return false
}

export function isUnresolvedSemanticOccurrence(m: ValidatedAiMapping): boolean {
  if (m.occurrenceOrigin !== 'validator_detected' && !m.relatedPrimaryMappingId) {
    return false
  }
  if (m.validationStatus === 'rejected') return false
  if (m.approvalStatus === 'ignored_immutable') return false
  if (m.approvalStatus === 'rejected_by_user') return false
  return !isOccurrenceResolved(m)
}

export function unresolvedOccurrenceBlockers(
  mappings: ValidatedAiMapping[],
): ValidatedAiMapping[] {
  return mappings.filter(isUnresolvedSemanticOccurrence)
}

export const UNRESOLVED_OCCURRENCE_MESSAGE =
  'To samo miejsce występuje także w treści umowy i wymaga sprawdzenia.'
