/**
 * Numeric + words money pair validation.
 */

import { polishAmountInWords } from '@/features/ai-contract-lab/polishAmountInWords'
import type { ContractGenerationInput, ValidatedAiMapping } from './types'

function parseMoneyAmount(formatted: string): number | null {
  const m = formatted.match(/(\d[\d\s]*)(?:[,.](\d{2}))?\s*(?:zł|PLN)/i)
  if (!m) return null
  const whole = m[1]!.replace(/\s/g, '')
  const frac = m[2] ?? '00'
  const n = Number(`${whole}.${frac}`)
  return Number.isFinite(n) ? Math.round(n) : null
}

function normalizeWords(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .trim()
}

export function validateMoneyPair(input: {
  numeric?: ValidatedAiMapping
  words?: ValidatedAiMapping
  generationInput: ContractGenerationInput
}): { ok: true } | { ok: false; reason: string } {
  const { numeric, words } = input
  if (!numeric || !words) {
    return { ok: false, reason: 'money_pair_incomplete' }
  }
  if (numeric.blockId === words.blockId) {
    if (
      numeric.start < words.end &&
      words.start < numeric.end
    ) {
      return { ok: false, reason: 'money_pair_overlap' }
    }
  }
  if (numeric.sourceText === words.sourceText) {
    return { ok: false, reason: 'money_pair_same_span' }
  }

  const previewNumeric = input.generationInput.finances.contractValueFormatted
  const previewWords = input.generationInput.finances.contractValueWords
  const amount = parseMoneyAmount(previewNumeric)
  if (amount !== null) {
    const expectedWords = normalizeWords(polishAmountInWords(amount))
    const actualWords = normalizeWords(previewWords)
    if (expectedWords !== actualWords) {
      return { ok: false, reason: 'money_pair_preview_mismatch' }
    }
  }

  return { ok: true }
}

export function applyMoneyPairValidation(
  mappings: ValidatedAiMapping[],
  generationInput: ContractGenerationInput,
): ValidatedAiMapping[] {
  const numeric = mappings.find(
    (m) =>
      m.fieldKey === 'contract_value_formatted' &&
      m.validationStatus === 'valid',
  )
  const words = mappings.find(
    (m) =>
      m.fieldKey === 'contract_value_words' && m.validationStatus === 'valid',
  )
  if (!numeric && !words) return mappings
  if (numeric && words) {
    const pair = validateMoneyPair({ numeric, words, generationInput })
    if (!pair.ok) {
      return mappings.map((m) => {
        if (
          m.fieldKey === 'contract_value_formatted' ||
          m.fieldKey === 'contract_value_words'
        ) {
          return {
            ...m,
            validationStatus: 'rejected' as const,
            approvalStatus: 'pending' as const,
            rejectionReason: pair.reason,
          }
        }
        return m
      })
    }
  } else if (numeric || words) {
    const missing = numeric ? 'contract_value_words' : 'contract_value_formatted'
    const existing = mappings.find((m) => m.fieldKey === missing)
    if (!existing || existing.validationStatus !== 'valid') {
      return [
        ...mappings,
        {
          fieldKey: missing as 'contract_value_formatted' | 'contract_value_words',
          blockId: (numeric ?? words)!.blockId,
          paragraphIndex: -1,
          start: -1,
          end: -1,
          sourceText: '',
          aiExactValue: '',
          evidenceText: '',
          resolvedExactValue: '',
          resolutionMethod: 'ai_exact' as const,
          occurrenceCount: 0,
          confidence: 'low' as const,
          confidenceScore: 0.5,
          validationStatus: 'rejected' as const,
          approvalStatus: 'pending' as const,
          rejectionReason: `money_pair_missing_${missing === 'contract_value_words' ? 'words' : 'numeric'}`,
        },
      ]
    }
  }
  return mappings
}
