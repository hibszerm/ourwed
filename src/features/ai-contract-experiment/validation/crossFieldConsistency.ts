/**
 * Cross-field consistency — needs_review, never rejects physically valid source spans.
 */

import type { ContractFieldKey, ValidatedAiMapping } from '../types'
import { getFieldDefinition } from './fieldDefinitionRegistry'
import {
  moneyAmountsConsistent,
  parsePolishMoneyAmount,
  parsePolishMoneyWords,
} from './polishMoneyParser'
import type { SemanticValidity } from './types'

function findMapping(
  mappings: ValidatedAiMapping[],
  key: ContractFieldKey,
): ValidatedAiMapping | undefined {
  return mappings.find(
    (m) => m.fieldKey === key && m.validationStatus !== 'rejected',
  )
}

function pairConsistency(
  numeric?: ValidatedAiMapping,
  words?: ValidatedAiMapping,
): SemanticValidity {
  if (!numeric && !words) return { status: 'valid' }
  if (!numeric || !words) {
    return { status: 'needs_review', reasonCode: 'money_pair_incomplete' }
  }
  const n = parsePolishMoneyAmount(numeric.sourceText)
  const w = parsePolishMoneyWords(words.sourceText)
  if (n && w && !moneyAmountsConsistent(n.amount, w)) {
    return { status: 'needs_review', reasonCode: 'money_pair_mismatch' }
  }
  return { status: 'valid' }
}

export function evaluateCrossFieldConsistency(
  mappings: ValidatedAiMapping[],
): Map<number, SemanticValidity> {
  const adjustments = new Map<number, SemanticValidity>()

  const families = [
    ['contract_value_formatted', 'contract_value_words'] as const,
    ['agreed_deposit_formatted', 'agreed_deposit_words'] as const,
    ['remaining_after_deposit_formatted', 'remaining_after_deposit_words'] as const,
  ]

  for (const [numericKey, wordsKey] of families) {
    const numeric = findMapping(mappings, numericKey)
    const words = findMapping(mappings, wordsKey)
    const result = pairConsistency(numeric, words)
    if (result.status !== 'valid') {
      for (const m of [numeric, words]) {
        if (!m) continue
        const idx = mappings.indexOf(m)
        if (idx >= 0) adjustments.set(idx, result)
      }
    }
  }

  const total = findMapping(mappings, 'contract_value_formatted')
  const deposit = findMapping(mappings, 'agreed_deposit_formatted')
  const remaining = findMapping(mappings, 'remaining_after_deposit_formatted')

  if (total && deposit && remaining) {
    const tn = parsePolishMoneyAmount(total.sourceText)?.amount
    const dn = parsePolishMoneyAmount(deposit.sourceText)?.amount
    const rn = parsePolishMoneyAmount(remaining.sourceText)?.amount
    if (tn != null && dn != null && rn != null && !moneyAmountsConsistent(tn - dn, rn)) {
      const msg: SemanticValidity = {
        status: 'needs_review',
        reasonCode: 'cross_field_conflict',
      }
      for (const m of [total, deposit, remaining]) {
        const idx = mappings.indexOf(m!)
        if (idx >= 0) adjustments.set(idx, msg)
      }
    }
  }

  return adjustments
}

export function applyCrossFieldConsistency(
  mappings: ValidatedAiMapping[],
): ValidatedAiMapping[] {
  const adjustments = evaluateCrossFieldConsistency(mappings)
  if (adjustments.size === 0) return mappings

  return mappings.map((m, idx) => {
    const adj = adjustments.get(idx)
    if (!adj || adj.status === 'valid') return m
    if (m.validationStatus === 'rejected') return m
    return {
      ...m,
      validationStatus: adj.status === 'needs_review' ? 'needs_review' : m.validationStatus,
      fieldValidation: adj.reasonCode,
      validationDimensions: m.validationDimensions
        ? {
            ...m.validationDimensions,
            semantic: adj,
          }
        : undefined,
    }
  })
}

export function getPairedFieldKey(key: ContractFieldKey): ContractFieldKey | undefined {
  return getFieldDefinition(key).pairKey
}
