/**
 * Bridge AI analyzer output → Mapping Wizard DetectedField (composition-compatible).
 */

import { getVariableDef } from '@/features/documents/registry/variableRegistry'
import type {
  AiDocumentAnalysisResult,
  DetectedDocumentField,
} from './types'
import type { DetectedField } from '@/features/documents/mapping/types'
import type { DocumentStructure } from '@/features/documents/mapping/preview/documentNodes'

function confidenceBand(n: number): 'high' | 'medium' | 'low' {
  if (n >= 0.9) return 'high'
  if (n >= 0.75) return 'medium'
  return 'low'
}

function offsetsForField(
  field: DetectedDocumentField,
  structure?: DocumentStructure | null,
): { start: number; end: number } | undefined {
  const pIdx = field.paragraphIndex ?? field.location?.paragraphIndex
  if (
    structure &&
    typeof pIdx === 'number' &&
    pIdx >= 0 &&
    pIdx < structure.blocks.length
  ) {
    const block = structure.blocks[pIdx]!
    return { start: block.start, end: block.end }
  }

  const needle =
    field.value?.trim() ||
    field.extractedValue?.trim() ||
    field.location?.text?.trim()
  if (needle && structure?.plainText) {
    const idx = structure.plainText.indexOf(needle)
    if (idx >= 0) {
      return { start: idx, end: idx + needle.length }
    }
  }
  return undefined
}

export function aiFieldToDetectedField(
  field: DetectedDocumentField,
  structure?: DocumentStructure | null,
): DetectedField {
  const key = field.registryKey
  const def = key ? getVariableDef(key) : undefined
  const sample =
    field.value ?? field.extractedValue ?? field.location?.text ?? null

  // AI already mapped to a registry key → treat as discovered for draft generation.
  // Unmapped suggestions stay needs_configuration (edge / custom Add flow).
  const status =
    field.status === 'rejected'
      ? 'ignored'
      : key
        ? 'connected'
        : field.status === 'confirmed'
          ? 'connected'
          : 'needs_configuration'

  const pct = Math.round(field.confidence * 100)

  return {
    id: field.id,
    label: field.label || def?.labelPl || key || 'Pole',
    rawToken: sample,
    suggestedKey: key,
    mappedKey: key,
    status,
    origin: 'ai',
    confidence: confidenceBand(field.confidence),
    confidenceScore: field.confidence,
    suggestionReason: `AI · ${pct}% pewności`,
    reason: key
      ? `Wykryto jako „${def?.labelPl ?? key}” na podstawie treści kontraktu.`
      : 'Wykryto element dynamiczny — wybierz pole OurWed lub pomiń.',
    paragraphIndex: field.paragraphIndex ?? field.location?.paragraphIndex ?? null,
    offsets: offsetsForField(field, structure),
  }
}

export function aiAnalysisToDetectedFields(
  result: AiDocumentAnalysisResult,
  structure?: DocumentStructure | null,
): DetectedField[] {
  return result.fields.map((f) => aiFieldToDetectedField(f, structure))
}

export function syncAiFieldStatus(
  aiFields: DetectedDocumentField[],
  fieldId: string,
  status: DetectedDocumentField['status'],
  registryKey?: string | null,
): DetectedDocumentField[] {
  return aiFields.map((f) => {
    if (f.id !== fieldId) return f
    return {
      ...f,
      status,
      registryKey: registryKey !== undefined ? registryKey : f.registryKey,
    }
  })
}
