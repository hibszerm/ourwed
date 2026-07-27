/**
 * Derive display / validation metadata locally from indexed DOCX blocks.
 * Compact v3 AI responses omit these fields to save output tokens.
 */

import { EXPERIMENT_FIELD_LABELS } from './fieldRegistry'
import type { ContractFieldKey, StructuredAiMappingResponse } from './types'

const EVIDENCE_CONTEXT_CHARS = 48
const SPAN_CONTEXT_CHARS = 24

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

export function deriveSemanticRole(fieldKey: ContractFieldKey): string {
  return fieldKey
}

export function deriveEvidenceText(blockText: string, exactValue: string): string {
  const trimmed = exactValue.trim()
  if (!trimmed) return blockText
  if (!blockText.includes(trimmed)) return trimmed
  if (blockText === trimmed) return blockText

  const occurrenceCount = countOccurrences(blockText, trimmed)
  if (occurrenceCount === 1) {
    const idx = blockText.indexOf(trimmed)
    const start = Math.max(0, idx - EVIDENCE_CONTEXT_CHARS)
    const end = Math.min(
      blockText.length,
      idx + trimmed.length + EVIDENCE_CONTEXT_CHARS,
    )
    let slice = blockText.slice(start, end)
    if (start > 0) slice = `…${slice}`
    if (end < blockText.length) slice = `${slice}…`
    if (slice.includes(trimmed)) return slice
  }

  return trimmed
}

export function deriveContextAroundExactValue(
  blockText: string,
  exactValue: string,
): { contextBefore: string; contextAfter: string } {
  const idx = blockText.indexOf(exactValue)
  if (idx < 0) {
    return { contextBefore: '', contextAfter: '' }
  }
  const start = idx
  const end = idx + exactValue.length
  return {
    contextBefore: blockText.slice(
      Math.max(0, start - SPAN_CONTEXT_CHARS),
      start,
    ),
    contextAfter: blockText.slice(
      end,
      Math.min(blockText.length, end + SPAN_CONTEXT_CHARS),
    ),
  }
}

export function deriveFieldReasoning(fieldKey: ContractFieldKey): string {
  return `derived:${fieldKey}`
}

export function enrichCompactFieldProposal(input: {
  fieldKey: ContractFieldKey
  blockId: string
  exactValue: string
  confidence: 'high' | 'medium' | 'low'
  pairedFieldGroup: string | null
  blockText: string
}): {
  fieldKey: ContractFieldKey
  blockId: string
  exactValue: string
  evidenceText: string
  contextBefore: string
  contextAfter: string
  semanticRole: string
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  pairedFieldGroup: string | null
} {
  const evidenceText = deriveEvidenceText(input.blockText, input.exactValue)
  const { contextBefore, contextAfter } = deriveContextAroundExactValue(
    input.blockText,
    input.exactValue,
  )
  return {
    fieldKey: input.fieldKey,
    blockId: input.blockId,
    exactValue: input.exactValue,
    evidenceText,
    contextBefore,
    contextAfter,
    semanticRole: deriveSemanticRole(input.fieldKey),
    confidence: input.confidence,
    reasoning: deriveFieldReasoning(input.fieldKey),
    pairedFieldGroup: input.pairedFieldGroup,
  }
}

const IMMUTABLE_REASON: Record<string, string> = {
  provider_data: 'provider_data',
  bank_account: 'bank_account',
  package_fact: 'package_fact',
  legal_clause: 'legal_clause',
  coverage_fact: 'coverage_fact',
  delivery_fact: 'delivery_fact',
  other_immutable: 'other_immutable',
}

export function enrichCompactImmutableFinding(input: {
  blockId: string
  classification: StructuredAiMappingResponse['immutableFindings'][number]['classification']
  exactValue: string
}): StructuredAiMappingResponse['immutableFindings'][number] {
  return {
    blockId: input.blockId,
    sourceText: input.exactValue,
    classification: input.classification,
    reason: IMMUTABLE_REASON[input.classification] ?? input.classification,
  }
}
export function deriveMappingWarningMessage(input: {
  code: string
  relatedFieldKey?: ContractFieldKey | null
}): string {
  if (input.relatedFieldKey) {
    const label = EXPERIMENT_FIELD_LABELS[input.relatedFieldKey]
    if (input.code === 'missing_required_field') {
      return `Brak mapowania wymaganego pola: ${label} (${input.relatedFieldKey})`
    }
    return `${input.code}: ${label} (${input.relatedFieldKey})`
  }
  return input.code
}
