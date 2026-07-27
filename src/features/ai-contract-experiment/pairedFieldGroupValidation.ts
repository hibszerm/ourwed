/**
 * Canonical paired-field group validation and normalization.
 */

import type { ContractFieldKey, StructuredAiFieldProposal, ValidatedAiMapping } from './types'

const SAFE_GROUP_ID = /^[a-z][a-z0-9_]*(?:_\d+|\d+)$/

const NUMERIC_WORDS_PAIRS: Array<{
  groupPrefix: string
  numeric: ContractFieldKey
  words: ContractFieldKey
}> = [
  {
    groupPrefix: 'contract_value_pair',
    numeric: 'contract_value_formatted',
    words: 'contract_value_words',
  },
  {
    groupPrefix: 'deposit_value_pair',
    numeric: 'agreed_deposit_formatted',
    words: 'agreed_deposit_words',
  },
  {
    groupPrefix: 'remaining_value_pair',
    numeric: 'remaining_after_deposit_formatted',
    words: 'remaining_after_deposit_words',
  },
]

const REGISTRY_KEYS = new Set<string>([
  'couple_full_names',
  'client_address',
  'client_phone',
  'contract_execution_date',
  'wedding_date',
  'preparation_location',
  'ceremony_location',
  'reception_location',
  'contract_value_formatted',
  'contract_value_words',
  'agreed_deposit_formatted',
  'agreed_deposit_words',
  'remaining_after_deposit_formatted',
  'remaining_after_deposit_words',
  'deposit_due_date',
  'payment_due_date',
  'final_payment_due_date',
])

function pairForField(
  fieldKey: ContractFieldKey,
): { groupPrefix: string; numeric: ContractFieldKey; words: ContractFieldKey } | null {
  return (
    NUMERIC_WORDS_PAIRS.find(
      (p) => p.numeric === fieldKey || p.words === fieldKey,
    ) ?? null
  )
}

function canonicalGroupForPair(
  pair: { groupPrefix: string },
  index = 1,
): string {
  return `${pair.groupPrefix}_${index}`
}

/** Normalize reciprocal registry-key pair references from legacy AI output. */
export function normalizeReciprocalPairGroups(
  proposals: StructuredAiFieldProposal[],
): StructuredAiFieldProposal[] {
  const pairIndexByPrefix = new Map<string, number>()
  return proposals.map((p) => {
    if (!p.pairedFieldGroup || !REGISTRY_KEYS.has(p.pairedFieldGroup)) {
      return p
    }
    const pair = pairForField(p.fieldKey)
    if (!pair) return { ...p, pairedFieldGroup: null }
    const idx = pairIndexByPrefix.get(pair.groupPrefix) ?? 1
    pairIndexByPrefix.set(pair.groupPrefix, idx)
    return { ...p, pairedFieldGroup: canonicalGroupForPair(pair, idx) }
  })
}

function groupMembers(
  mappings: ValidatedAiMapping[],
  groupId: string,
): ValidatedAiMapping[] {
  return mappings.filter((m) => m.pairedFieldGroup === groupId)
}

function invalidateGroup(
  mappings: ValidatedAiMapping[],
  groupId: string,
  reason: string,
): ValidatedAiMapping[] {
  return mappings.map((m) => {
    if (m.pairedFieldGroup !== groupId) return m
    if (m.validationStatus === 'rejected') return m
    return {
      ...m,
      validationStatus: 'needs_review' as const,
      approvalStatus: 'pending' as const,
      rejectionReason: reason,
    }
  })
}

export function validatePairedFieldGroups(
  mappings: ValidatedAiMapping[],
): ValidatedAiMapping[] {
  const groupIds = new Set(
    mappings
      .map((m) => m.pairedFieldGroup)
      .filter((g): g is string => Boolean(g)),
  )

  let out = mappings
  for (const groupId of groupIds) {
    if (!SAFE_GROUP_ID.test(groupId)) {
      out = invalidateGroup(out, groupId, 'invalid_pair_group_id')
      continue
    }

    const members = groupMembers(out, groupId)
    if (members.length < 2) {
      out = invalidateGroup(out, groupId, 'pair_group_too_small')
      continue
    }

    const keys = new Set(members.map((m) => m.fieldKey))
    const contractNumeric = keys.has('contract_value_formatted')
    const contractWords = keys.has('contract_value_words')
    const deposit = keys.has('agreed_deposit_formatted')
    const remaining = keys.has('remaining_after_deposit_formatted')

    if (contractNumeric && (deposit || remaining)) {
      out = invalidateGroup(out, groupId, 'pair_group_mixed_financial_concepts')
      continue
    }
    if (deposit && remaining) {
      out = invalidateGroup(out, groupId, 'pair_group_mixed_financial_concepts')
      continue
    }

    if (contractNumeric && contractWords) {
      const prefix =
        groupId.startsWith('contract_value_pair') || groupId.startsWith('cv')
      if (!prefix) {
        out = invalidateGroup(out, groupId, 'pair_group_id_mismatch')
      }
    }
    if (deposit && keys.has('agreed_deposit_words')) {
      const prefix =
        groupId.startsWith('deposit_value_pair') || groupId.startsWith('dep')
      if (!prefix) {
        out = invalidateGroup(out, groupId, 'pair_group_id_mismatch')
      }
    }
    if (remaining && keys.has('remaining_after_deposit_words')) {
      const prefix =
        groupId.startsWith('remaining_value_pair') || groupId.startsWith('rem')
      if (!prefix) {
        out = invalidateGroup(out, groupId, 'pair_group_id_mismatch')
      }
    }
  }

  return out
}

export function isValidPairGroupId(groupId: string): boolean {
  return SAFE_GROUP_ID.test(groupId)
}

export function pairedFieldKeysForGroup(
  mappings: ValidatedAiMapping[],
  groupId: string,
): ValidatedAiMapping[] {
  return mappings.filter((m) => m.pairedFieldGroup === groupId)
}
