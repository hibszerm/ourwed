/**
 * Mapping approval workflow — experiment storage only.
 */

import { logMissingDecisionTarget } from './mappingId'
import { EXPERIMENT_REQUIRED_FIELD_KEYS } from './fieldRegistry'
import { pairedFieldKeysForGroup } from './pairedFieldGroupValidation'
import type { ContractFieldKey, ValidatedAiMapping } from './types'

export type UserApprovalAction = 'approved' | 'rejected_by_user'

function isApproved(m: ValidatedAiMapping): boolean {
  return (
    m.validationStatus === 'valid' &&
    (m.approvalStatus === 'approved' || m.approvalStatus === 'manually_mapped')
  )
}

function findMapping(
  mappings: ValidatedAiMapping[],
  fieldKey: ContractFieldKey,
  blockId: string,
): ValidatedAiMapping | undefined {
  return mappings.find((m) => m.fieldKey === fieldKey && m.blockId === blockId)
}

function findMappingById(
  mappings: ValidatedAiMapping[],
  mappingId: string,
): ValidatedAiMapping | undefined {
  return mappings.find((m) => m.id === mappingId)
}

function pairedMembers(
  mappings: ValidatedAiMapping[],
  target: ValidatedAiMapping,
): ValidatedAiMapping[] {
  if (!target.pairedFieldGroup) return [target]
  return pairedFieldKeysForGroup(mappings, target.pairedFieldGroup)
}

function memberKeys(members: ValidatedAiMapping[]): Set<string> {
  return new Set(
    members.map((m) => (m.id ? m.id : `${m.fieldKey}:${m.blockId}`)),
  )
}

function applyToMembers(
  mappings: ValidatedAiMapping[],
  members: ValidatedAiMapping[],
  update: (m: ValidatedAiMapping) => ValidatedAiMapping,
): ValidatedAiMapping[] {
  const keys = memberKeys(members)
  return mappings.map((m) => {
    const key = m.id ?? `${m.fieldKey}:${m.blockId}`
    if (!keys.has(key)) return m
    return update(m)
  })
}

export function approveMapping(
  mappings: ValidatedAiMapping[],
  fieldKey: ContractFieldKey,
  blockId: string,
): ValidatedAiMapping[] {
  const target = findMapping(mappings, fieldKey, blockId)
  if (!target || target.validationStatus !== 'valid') return mappings

  const toApprove = pairedMembers(mappings, target)
  return applyToMembers(mappings, toApprove, (m) => {
    if (m.validationStatus !== 'valid') return m
    return { ...m, approvalStatus: 'approved' as const }
  })
}

export function approveMappingById(input: {
  experimentRunId: string
  mappings: ValidatedAiMapping[]
  mappingId: string
}): ValidatedAiMapping[] {
  const target = findMappingById(input.mappings, input.mappingId)
  if (!target) {
    logMissingDecisionTarget({
      experimentRunId: input.experimentRunId,
      mappingId: input.mappingId,
      action: 'approve',
    })
    return input.mappings
  }
  if (!canApproveMapping(target)) return input.mappings
  return approveMapping(input.mappings, target.fieldKey, target.blockId)
}

export function approvePairedMappingGroup(input: {
  experimentRunId: string
  mappings: ValidatedAiMapping[]
  pairedFieldGroup: string
}): ValidatedAiMapping[] {
  const members = input.mappings.filter(
    (m) =>
      m.pairedFieldGroup === input.pairedFieldGroup && m.validationStatus === 'valid',
  )
  if (members.length === 0) {
    logMissingDecisionTarget({
      experimentRunId: input.experimentRunId,
      mappingId: input.pairedFieldGroup,
      action: 'approvePairedMappingGroup',
    })
    return input.mappings
  }
  if (members.some((m) => m.validationStatus !== 'valid')) return input.mappings
  return applyToMembers(input.mappings, members, (m) => ({
    ...m,
    approvalStatus: 'approved' as const,
  }))
}

export function rejectMapping(
  mappings: ValidatedAiMapping[],
  fieldKey: ContractFieldKey,
  blockId: string,
): ValidatedAiMapping[] {
  const target = findMapping(mappings, fieldKey, blockId)
  if (!target || target.validationStatus === 'rejected') return mappings

  const toReject = pairedMembers(mappings, target)
  return applyToMembers(mappings, toReject, (m) => {
    if (m.validationStatus === 'rejected') return m
    return { ...m, approvalStatus: 'rejected_by_user' as const }
  })
}

export function rejectMappingById(input: {
  experimentRunId: string
  mappings: ValidatedAiMapping[]
  mappingId: string
}): ValidatedAiMapping[] {
  const target = findMappingById(input.mappings, input.mappingId)
  if (!target) {
    logMissingDecisionTarget({
      experimentRunId: input.experimentRunId,
      mappingId: input.mappingId,
      action: 'reject',
    })
    return input.mappings
  }
  return rejectMapping(input.mappings, target.fieldKey, target.blockId)
}

export function approveAllValidMappings(
  mappings: ValidatedAiMapping[],
): ValidatedAiMapping[] {
  return mappings.map((m) =>
    m.validationStatus === 'valid' &&
    m.approvalStatus === 'pending' &&
    canApproveMapping(m)
      ? { ...m, approvalStatus: 'approved' as const }
      : m,
  )
}

export function restoreMappingDecision(
  mappings: ValidatedAiMapping[],
  fieldKey: ContractFieldKey,
  blockId: string,
): ValidatedAiMapping[] {
  const target = findMapping(mappings, fieldKey, blockId)
  if (!target) return mappings

  const toRestore = pairedMembers(mappings, target)
  return applyToMembers(mappings, toRestore, (m) => {
    if (m.validationStatus !== 'valid') return m
    return { ...m, approvalStatus: 'pending' as const }
  })
}

export function restoreMappingDecisionById(input: {
  experimentRunId: string
  mappings: ValidatedAiMapping[]
  mappingId: string
}): ValidatedAiMapping[] {
  const target = findMappingById(input.mappings, input.mappingId)
  if (!target) {
    logMissingDecisionTarget({
      experimentRunId: input.experimentRunId,
      mappingId: input.mappingId,
      action: 'restore',
    })
    return input.mappings
  }
  return restoreMappingDecision(input.mappings, target.fieldKey, target.blockId)
}

export function ignoreMappingAsImmutable(input: {
  experimentRunId: string
  mappings: ValidatedAiMapping[]
  mappingId: string
}): ValidatedAiMapping[] {
  const target = findMappingById(input.mappings, input.mappingId)
  if (!target) {
    logMissingDecisionTarget({
      experimentRunId: input.experimentRunId,
      mappingId: input.mappingId,
      action: 'ignore_immutable',
    })
    return input.mappings
  }
  return input.mappings.map((m) =>
    m.id === input.mappingId
      ? { ...m, approvalStatus: 'ignored_immutable' as const }
      : m,
  )
}

export function setCustomReplacementValue(input: {
  experimentRunId: string
  mappings: ValidatedAiMapping[]
  mappingId: string
  value: string
}): ValidatedAiMapping[] {
  const target = findMappingById(input.mappings, input.mappingId)
  if (!target) {
    logMissingDecisionTarget({
      experimentRunId: input.experimentRunId,
      mappingId: input.mappingId,
      action: 'set_custom_replacement',
    })
    return input.mappings
  }
  return input.mappings.map((m) =>
    m.id === input.mappingId
      ? {
          ...m,
          customReplacementValue: input.value,
          validationStatus:
            m.validationStatus === 'needs_review' ? ('valid' as const) : m.validationStatus,
        }
      : m,
  )
}

export function canApproveMapping(m: ValidatedAiMapping): boolean {
  if (m.validationStatus === 'rejected') return false
  if (
    m.occurrenceReplacementMode === 'manual_review_required' &&
    !m.customReplacementValue?.trim()
  ) {
    return false
  }
  return m.validationStatus === 'valid' || m.validationStatus === 'needs_review'
}

export function canContinueMappingReview(mappings: ValidatedAiMapping[]): boolean {
  for (const key of EXPERIMENT_REQUIRED_FIELD_KEYS) {
    const approved = mappings.find((m) => m.fieldKey === key && isApproved(m))
    if (!approved) return false
  }

  const words = mappings.find((m) => m.fieldKey === 'contract_value_words')
  if (words?.validationStatus === 'valid') {
    if (!isApproved(words)) return false
    const numeric = mappings.find(
      (m) => m.fieldKey === 'contract_value_formatted' && m.validationStatus === 'valid',
    )
    if (numeric && !isApproved(numeric)) return false
  }

  const numericApproved = mappings.find(
    (m) =>
      m.fieldKey === 'contract_value_formatted' &&
      m.validationStatus === 'valid' &&
      isApproved(m),
  )
  if (numericApproved) {
    const wordsMapping = mappings.find(
      (m) => m.fieldKey === 'contract_value_words' && m.validationStatus === 'valid',
    )
    if (wordsMapping && !isApproved(wordsMapping)) return false
  }

  const userRejectedRequired = EXPERIMENT_REQUIRED_FIELD_KEYS.some((key) => {
    const m = mappings.find((x) => x.fieldKey === key)
    return m?.approvalStatus === 'rejected_by_user'
  })
  if (userRejectedRequired) return false

  return true
}

export function isUserRejected(m: ValidatedAiMapping): boolean {
  return m.approvalStatus === 'rejected_by_user'
}
