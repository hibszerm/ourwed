/**
 * Derive review UI display status from three validation dimensions.
 */

import type { ContractOccurrence, MappingApprovalStatus } from '../types'
import { getOccurrenceTargetValue } from './occurrenceAccessors'
import type { OccurrenceDisplayStatus } from './types'

export function deriveOccurrenceDisplayStatus(
  occurrence: ContractOccurrence,
): OccurrenceDisplayStatus {
  if (occurrence.approvalStatus === 'approved') return 'approved'
  if (occurrence.approvalStatus === 'ignored_immutable') return 'ignored'
  if (occurrence.approvalStatus === 'rejected_by_user') return 'rejected_by_user'

  const dims = occurrence.validationDimensions
  if (dims) {
    if (dims.source.status === 'invalid') {
      if (
        dims.semantic.status === 'invalid' &&
        (dims.semantic.reasonCode === 'provider_data' ||
          dims.semantic.reasonCode === 'bank_account')
      ) {
        return 'protected_provider_data'
      }
      return 'rejected_invalid_span'
    }
    if (dims.semantic.status === 'invalid') {
      if (
        dims.semantic.reasonCode === 'provider_data' ||
        dims.semantic.reasonCode === 'bank_account'
      ) {
        return 'protected_provider_data'
      }
      return 'rejected_invalid_span'
    }
    if (dims.replacement.status === 'missing_target_value') {
      return 'missing_target_data'
    }
    if (dims.replacement.status === 'manual_text_required') {
      return 'needs_manual_text'
    }
    if (dims.semantic.status === 'needs_review') {
      return 'needs_role_review'
    }
    if (dims.replacement.status === 'ready') {
      return 'ready_for_approval'
    }
  }

  if (occurrence.validationStatus === 'rejected') return 'rejected_invalid_span'
  if (occurrence.validationStatus === 'needs_review') {
    if (occurrence.replacementStrategy === 'CUSTOM_TEXT_REQUIRED') {
      return 'needs_manual_text'
    }
    return 'needs_role_review'
  }
  return 'ready_for_approval'
}

export function displayStatusLabel(status: OccurrenceDisplayStatus): string {
  switch (status) {
    case 'ready_for_approval':
      return 'GOTOWE DO ZATWIERDZENIA'
    case 'needs_role_review':
      return 'WYMAGA SPRAWDZENIA ROLI'
    case 'needs_manual_text':
      return 'WYMAGA TEKSTU RĘCZNEGO'
    case 'missing_target_data':
      return 'BRAK DANYCH DO ZAMIANY'
    case 'rejected_invalid_span':
      return 'ODRZUCONE — NIEPRAWIDŁOWY SPAN'
    case 'protected_provider_data':
      return 'CHRONIONE — DANE WYKONAWCY'
    case 'approved':
      return 'ZATWIERDZONE'
    case 'ignored':
      return 'POMINIĘTE'
    case 'rejected_by_user':
      return 'ODRZUCONE PRZEZ UŻYTKOWNIKA'
  }
}

export function sourceValidityLabel(occurrence: ContractOccurrence): string {
  const dims = occurrence.validationDimensions
  if (!dims) {
    return occurrence.validationStatus === 'rejected' ? 'Nieprawidłowe' : 'Poprawne'
  }
  return dims.source.status === 'valid' ? 'Poprawne' : 'Nieprawidłowe'
}

export function semanticValidityLabel(occurrence: ContractOccurrence): string {
  const dims = occurrence.validationDimensions
  if (!dims) {
    return occurrence.validationStatus === 'needs_review'
      ? 'Wymaga sprawdzenia'
      : 'Poprawna'
  }
  if (dims.semantic.status === 'valid') return 'Poprawna'
  if (dims.semantic.status === 'needs_review') {
    if (dims.semantic.reasonCode === 'grammatical_form') {
      return 'Źródło zawiera odmienioną formę imienia lub nazwiska'
    }
    return 'Wymaga sprawdzenia roli'
  }
  return 'Nieprawidłowa rola'
}

export function replacementReadinessLabel(occurrence: ContractOccurrence): string {
  const dims = occurrence.validationDimensions
  if (!dims) {
    if (occurrence.replacementStrategy === 'CUSTOM_TEXT_REQUIRED') {
      return 'Wymaga tekstu ręcznego'
    }
    return 'Automatyczna'
  }
  switch (dims.replacement.status) {
    case 'ready':
      return 'Automatyczna'
    case 'manual_text_required':
      if (dims.replacement.targetValue?.trim()) {
        return 'Wymaga tekstu ręcznego (sugerowana wartość dostępna)'
      }
      return 'Wymaga tekstu ręcznego'
    case 'missing_target_value':
      return 'Brak danych docelowych'
    case 'not_applicable':
      return '—'
  }
}

export function assertOccurrenceUiConsistency(
  occurrence: ContractOccurrence,
  context: string,
): void {
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) return
  const display = deriveOccurrenceDisplayStatus(occurrence)
  const target = getOccurrenceTargetValue(occurrence)
  const strategy = occurrence.replacementStrategy

  if (display === 'ready_for_approval' && strategy === 'CUSTOM_TEXT_REQUIRED') {
    throw new Error(`[ui-invariant] ready_for_approval + CUSTOM_TEXT_REQUIRED: ${context}`)
  }
  if (strategy === 'AUTO_REPLACE' && display === 'missing_target_data') {
    throw new Error(`[ui-invariant] AUTO_REPLACE + missing target: ${context}`)
  }
  if (strategy === 'CONFIRM_ONLY' && display === 'ready_for_approval') {
    throw new Error(`[ui-invariant] CONFIRM_ONLY + ready_for_approval: ${context}`)
  }
  if (
    strategy === 'CUSTOM_TEXT_REQUIRED' &&
    display === 'ready_for_approval' &&
    !occurrence.customReplacement?.trim()
  ) {
    throw new Error(`[ui-invariant] CUSTOM_TEXT without manual text: ${context}`)
  }
  if (display === 'ready_for_approval' && strategy === 'CUSTOM_TEXT_REQUIRED' && target) {
    throw new Error(`[ui-invariant] ready + custom required despite target: ${context}`)
  }
}

export function canAutoApproveOccurrence(occurrence: ContractOccurrence): boolean {
  const status = deriveOccurrenceDisplayStatus(occurrence)
  if (status !== 'ready_for_approval') return false
  if (occurrence.approvalStatus !== 'pending') return false
  const dims = occurrence.validationDimensions
  if (!dims) {
    return (
      occurrence.validationStatus === 'valid' &&
      occurrence.replacementStrategy !== 'CUSTOM_TEXT_REQUIRED'
    )
  }
  return (
    dims.source.status === 'valid' &&
    dims.semantic.status === 'valid' &&
    dims.replacement.status === 'ready' &&
    occurrence.replacementStrategy !== 'CUSTOM_TEXT_REQUIRED'
  )
}

export function approvalStatusLabel(status: MappingApprovalStatus): string {
  switch (status) {
    case 'approved':
      return 'Zatwierdzone'
    case 'manually_mapped':
      return 'Wskazane ręcznie'
    case 'ignored_immutable':
      return 'Pominięte'
    case 'rejected_by_user':
      return 'Odrzucone'
    default:
      return 'Oczekuje'
  }
}
