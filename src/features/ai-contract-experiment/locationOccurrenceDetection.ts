/**
 * Detect related location occurrences (canonical + inflected forms).
 */

import { deriveLocationReplacementCapability } from './locationReplacementCapability'
import type {
  ContractFieldKey,
  ContractGenerationInput,
  IndexedDocxBlock,
  PhysicalOccurrenceReplacementMode,
  ValidatedAiMapping,
} from './types'

export type DetectedLocationOccurrence = {
  fieldKey: ContractFieldKey
  blockId: string
  paragraphIndex: number
  tableIndex?: number
  rowIndex?: number
  cellIndex?: number
  start: number
  end: number
  exactValue: string
  evidenceText: string
  grammaticalForm: 'canonical' | 'inflected' | 'unknown'
  semanticContext: string
  occurrenceReplacementMode: PhysicalOccurrenceReplacementMode
  relatedPrimaryMappingId?: string
}

const LOCATION_CONTEXT =
  /\b(?:w|we|na|do|przy|gości\s+w|powitanie\s+gości\s+w|wjazd\s+i)\s+/i

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractAnchors(value: string): string[] {
  return value
    .split(/[,;]/)
    .flatMap((part) => part.split(/\s+/))
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(t))
}

function isInflectedForm(exact: string, canonical: string): boolean {
  if (exact === canonical) return false
  const anchors = extractAnchors(canonical)
  if (anchors.length === 0) return false
  const main = anchors.sort((a, b) => b.length - a.length)[0]!
  return exact.includes(main) && exact !== canonical
}

function findInflectedSpan(
  blockText: string,
  canonical: string,
): { start: number; end: number; exact: string } | null {
  const anchors = extractAnchors(canonical)
  if (anchors.length === 0) return null
  const main = anchors.sort((a, b) => b.length - a.length)[0]!

  const patterns = [
    new RegExp(`\\b[\\wĄĆĘŁŃÓŚŹŻąćęłńóśźż]+\\s+${escapeRegex(main)}\\b`, 'gi'),
    new RegExp(`\\b${escapeRegex(main)}\\b`, 'gi'),
  ]

  for (const re of patterns) {
    const match = re.exec(blockText)
    if (!match) continue
    const exact = match[0]
    if (exact === canonical) continue
    if (!isInflectedForm(exact, canonical)) continue
    return { start: match.index, end: match.index + exact.length, exact }
  }
  return null
}

function spanKey(m: { blockId: string; start: number; end: number }): string {
  return `${m.blockId}:${m.start}:${m.end}`
}

export function classifyOccurrenceReplacementMode(
  mapping: Pick<
    ValidatedAiMapping,
    'fieldKey' | 'blockId' | 'resolvedExactValue' | 'sourceText' | 'grammaticalForm'
  > & { start?: number },
  block: IndexedDocxBlock | undefined,
  generationInput?: ContractGenerationInput,
): PhysicalOccurrenceReplacementMode {
  const exact = mapping.resolvedExactValue || mapping.sourceText
  const isLocationField =
    mapping.fieldKey === 'reception_location' ||
    mapping.fieldKey === 'ceremony_location' ||
    mapping.fieldKey === 'preparation_location'

  if (block?.kind === 'tableCell') return 'direct_value'
  if (!isLocationField) return 'direct_value'
  if (mapping.grammaticalForm === 'inflected') {
    const cap = generationInput
      ? deriveLocationReplacementCapability(generationInput, mapping.fieldKey)
      : { venueName: undefined }
    if (cap.venueName) return 'location_name_inflected'
    return 'manual_review_required'
  }
  if (isInflectedForm(exact, exact)) return 'manual_review_required'
  if (block && LOCATION_CONTEXT.test(block.text.slice(0, mapping.start ?? 0))) {
    const cap = generationInput
      ? deriveLocationReplacementCapability(generationInput, mapping.fieldKey)
      : { venueName: undefined }
    if (!cap.venueName) return 'manual_review_required'
    return 'location_name_inflected'
  }
  return 'direct_value'
}

export function detectRelatedLocationOccurrences(input: {
  primary: ValidatedAiMapping
  blocks: IndexedDocxBlock[]
  existingMappings: ValidatedAiMapping[]
  generationInput?: ContractGenerationInput
}): DetectedLocationOccurrence[] {
  const canonical = input.primary.resolvedExactValue || input.primary.sourceText
  if (!canonical.trim()) return []

  const occupied = new Set(input.existingMappings.map(spanKey))
  const found: DetectedLocationOccurrence[] = []

  for (const block of input.blocks) {
    if (block.id === input.primary.blockId) continue

    let span: { start: number; end: number; exact: string } | null = null
    let grammaticalForm: DetectedLocationOccurrence['grammaticalForm'] = 'canonical'

    const idx = block.text.indexOf(canonical)
    if (idx >= 0) {
      span = { start: idx, end: idx + canonical.length, exact: canonical }
    } else {
      const inflected = findInflectedSpan(block.text, canonical)
      if (inflected) {
        span = inflected
        grammaticalForm = 'inflected'
      }
    }

    if (!span) continue
    if (occupied.has(spanKey({ blockId: block.id, start: span.start, end: span.end }))) {
      continue
    }

    if (grammaticalForm === 'inflected' && !LOCATION_CONTEXT.test(block.text)) {
      continue
    }

    const mode = classifyOccurrenceReplacementMode(
      {
        fieldKey: input.primary.fieldKey,
        blockId: block.id,
        resolvedExactValue: span.exact,
        sourceText: span.exact,
        grammaticalForm,
        start: span.start,
      },
      block,
      input.generationInput,
    )

    found.push({
      fieldKey: input.primary.fieldKey,
      blockId: block.id,
      paragraphIndex: block.paragraphIndex,
      tableIndex: block.kind === 'tableCell' ? block.tableIndex : undefined,
      rowIndex: block.kind === 'tableCell' ? block.rowIndex : undefined,
      cellIndex: block.kind === 'tableCell' ? block.cellIndex : undefined,
      start: span.start,
      end: span.end,
      exactValue: span.exact,
      evidenceText: block.text,
      grammaticalForm,
      semanticContext: block.text,
      occurrenceReplacementMode: mode,
      relatedPrimaryMappingId: input.primary.id,
    })
  }

  return found
}

export function detectedOccurrenceToMapping(
  detected: DetectedLocationOccurrence,
  primary: ValidatedAiMapping,
): ValidatedAiMapping {
  const needsReview = detected.occurrenceReplacementMode === 'manual_review_required'
  return {
    fieldKey: detected.fieldKey,
    blockId: detected.blockId,
    paragraphIndex: detected.paragraphIndex,
    tableIndex: detected.tableIndex,
    rowIndex: detected.rowIndex,
    cellIndex: detected.cellIndex,
    start: detected.start,
    end: detected.end,
    sourceText: detected.exactValue,
    aiExactValue: detected.exactValue,
    evidenceText: detected.evidenceText,
    resolvedExactValue: detected.exactValue,
    resolutionMethod: 'refined_by_validator',
    occurrenceCount: 1,
    contextBefore: '',
    contextAfter: '',
    semanticRole: 'related_occurrence',
    reasoning: `validator_detected:${primary.blockId}`,
    confidence: 'medium',
    confidenceScore: 0.75,
    validationStatus: needsReview ? 'needs_review' : 'valid',
    approvalStatus: 'pending',
    occurrenceReplacementMode: detected.occurrenceReplacementMode,
    occurrenceOrigin: 'validator_detected',
    relatedPrimaryMappingId: primary.id,
    grammaticalForm: detected.grammaticalForm,
  }
}
