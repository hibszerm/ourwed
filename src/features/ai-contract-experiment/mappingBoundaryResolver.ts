/**
 * Exact-span resolution and safe refinement for scalar field proposals.
 */

import {
  extractCompleteMoneyTokens,
  extractMoneyWordsTokens,
  validateCompleteMoneySpan,
  validateMoneyWordsSpan,
} from './completeMoneySpanValidator'
import {
  extractPolishDateTokens,
  validatePolishContractDateToken,
} from './polishContractDateValidator'
import {
  refineClientAddressBoundary,
  refineClientPhoneBoundary,
} from './clientContactBoundaryRefinement'
import type {
  ContractFieldKey,
  ExactSpanResolution,
  MappingBoundaryResolution,
  StructuredAiFieldProposal,
} from './types'

const LOCATION_LABEL =
  /^(?:Miejsce przyjęcia|Ceremonia|Przygotowania|Miejsce|Lokalizacja)\s*:\s*/i

const IDENTITY_LABEL = /^(?:Zamawiający|Klienci|Klient|Narzeczeni)\s*:?\s*/i

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let from = 0
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from)
    if (idx < 0) break
    count += 1
    from = idx + Math.max(1, needle.length)
  }
  return count
}

function isDateField(key: ContractFieldKey): boolean {
  return [
    'contract_execution_date',
    'wedding_date',
    'deposit_due_date',
    'payment_due_date',
    'final_payment_due_date',
  ].includes(key)
}

function isMoneyNumeric(key: ContractFieldKey): boolean {
  return [
    'contract_value_formatted',
    'agreed_deposit_formatted',
    'remaining_after_deposit_formatted',
  ].includes(key)
}

function isLocationField(key: ContractFieldKey): boolean {
  return [
    'preparation_location',
    'ceremony_location',
    'reception_location',
  ].includes(key)
}

function refineExactValue(input: {
  fieldKey: ContractFieldKey
  blockText: string
  aiExactValue: string
  evidenceText: string
}): MappingBoundaryResolution | null {
  const { fieldKey, blockText, aiExactValue, evidenceText } = input
  const searchIn = evidenceText.includes(aiExactValue) ? evidenceText : blockText

  if (isDateField(fieldKey)) {
    if (validatePolishContractDateToken(aiExactValue).valid) {
      return {
        originalExactValue: aiExactValue,
        resolvedExactValue: aiExactValue,
        resolutionMethod: 'ai_exact',
      }
    }
    const candidates = extractPolishDateTokens(searchIn)
    if (candidates.length === 1) {
      return {
        originalExactValue: aiExactValue,
        resolvedExactValue: candidates[0]!,
        resolutionMethod: 'refined_by_validator',
      }
    }
    return null
  }

  if (isMoneyNumeric(fieldKey)) {
    if (validateCompleteMoneySpan({
      exactValue: aiExactValue,
      blockText,
      start: blockText.indexOf(aiExactValue),
      end: blockText.indexOf(aiExactValue) + aiExactValue.length,
    }).valid) {
      return {
        originalExactValue: aiExactValue,
        resolvedExactValue: aiExactValue,
        resolutionMethod: 'ai_exact',
      }
    }
    const candidates = extractCompleteMoneyTokens(searchIn)
    if (candidates.length === 1) {
      return {
        originalExactValue: aiExactValue,
        resolvedExactValue: candidates[0]!,
        resolutionMethod: 'refined_by_validator',
      }
    }
    return null
  }

  if (fieldKey === 'contract_value_words') {
    if (validateMoneyWordsSpan(aiExactValue).valid) {
      return {
        originalExactValue: aiExactValue,
        resolvedExactValue: aiExactValue,
        resolutionMethod: 'ai_exact',
      }
    }
    const candidates = extractMoneyWordsTokens(searchIn)
    if (candidates.length === 1) {
      return {
        originalExactValue: aiExactValue,
        resolvedExactValue: candidates[0]!,
        resolutionMethod: 'refined_by_validator',
      }
    }
    return null
  }

  if (isLocationField(fieldKey)) {
    let resolved = aiExactValue
    if (LOCATION_LABEL.test(resolved)) {
      resolved = resolved.replace(LOCATION_LABEL, '').trim()
    }
    if (resolved && blockText.includes(resolved) && resolved !== aiExactValue) {
      return {
        originalExactValue: aiExactValue,
        resolvedExactValue: resolved,
        resolutionMethod: 'refined_by_validator',
      }
    }
    if (blockText.includes(aiExactValue)) {
      return {
        originalExactValue: aiExactValue,
        resolvedExactValue: aiExactValue,
        resolutionMethod: 'ai_exact',
      }
    }
    return null
  }

  if (fieldKey === 'couple_full_names') {
    let resolved = aiExactValue.replace(IDENTITY_LABEL, '').trim()
    resolved = resolved.replace(/,\s*zam\..*$/i, '').trim()
    if (resolved && blockText.includes(resolved) && resolved.length < aiExactValue.length) {
      return {
        originalExactValue: aiExactValue,
        resolvedExactValue: resolved,
        resolutionMethod: 'refined_by_validator',
      }
    }
    if (blockText.includes(aiExactValue)) {
      return {
        originalExactValue: aiExactValue,
        resolvedExactValue: aiExactValue,
        resolutionMethod: 'ai_exact',
      }
    }
    return null
  }

  if (fieldKey === 'client_address') {
    return refineClientAddressBoundary({ aiExactValue, blockText })
  }

  if (fieldKey === 'client_phone') {
    return refineClientPhoneBoundary({ aiExactValue, blockText })
  }

  if (blockText.includes(aiExactValue)) {
    return {
      originalExactValue: aiExactValue,
      resolvedExactValue: aiExactValue,
      resolutionMethod: 'ai_exact',
    }
  }
  return null
}

export function resolveExactSpan(input: {
  proposal: StructuredAiFieldProposal
  blockText: string
  manualExactValue?: string
}): {
  boundary: MappingBoundaryResolution
  span: ExactSpanResolution
} {
  const manual = input.manualExactValue?.trim()
  const boundary: MappingBoundaryResolution = manual
    ? {
        originalExactValue: input.proposal.exactValue,
        resolvedExactValue: manual,
        resolutionMethod: 'manual',
      }
    : refineExactValue({
        fieldKey: input.proposal.fieldKey,
        blockText: input.blockText,
        aiExactValue: input.proposal.exactValue,
        evidenceText: input.proposal.evidenceText,
      }) ?? {
        originalExactValue: input.proposal.exactValue,
        resolvedExactValue: input.proposal.exactValue,
        resolutionMethod: 'ai_exact',
      }

  const exact = boundary.resolvedExactValue
  if (!exact || !input.blockText.includes(exact)) {
    return {
      boundary,
      span: { status: 'not_found', occurrenceCount: 0 },
    }
  }

  const occurrenceCount = countOccurrences(input.blockText, exact)
  if (occurrenceCount === 0) {
    return {
      boundary,
      span: { status: 'not_found', occurrenceCount: 0 },
    }
  }
  if (occurrenceCount > 1) {
    return {
      boundary,
      span: { status: 'ambiguous', occurrenceCount },
    }
  }

  const start = input.blockText.indexOf(exact)
  return {
    boundary,
    span: {
      status: 'resolved',
      occurrenceCount: 1,
      start,
      end: start + exact.length,
    },
  }
}
