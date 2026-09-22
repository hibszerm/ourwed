import { canonicalizeParagraphText, extractCanonicalParagraphText } from '../documents/template/canonicalParagraph'
import { locateGroundedTextSpan, type GroundedTextSpan } from '../documents/template/docxParagraphEditor'

/** Closed set of semantic facts currently represented by the contract dataset. */
export const SEMANTIC_CONCEPTS = [
  'customer_1_name',
  'customer_2_name',
  'customer_address',
  'customer_phone',
  'wedding_date',
  'execution_date',
  'total',
  'deposit',
  'remaining',
  'total_words',
  'deposit_words',
  'remaining_words',
  'preparation_location',
  'bride_preparation_location',
  'groom_preparation_location',
  'shared_preparation_location',
  'ceremony_location',
  'reception_location',
] as const

export type SemanticConcept = (typeof SEMANTIC_CONCEPTS)[number]

/** Future model contract only: semantic source anchor, never a value or edit. */
export type SemanticMapping = {
  sourceBlockId: string
  concept: SemanticConcept
  anchor: string
  occurrence?: number
  /** Zero-based customer ownership for customer_address/customer_phone only. */
  customerIndex?: number
}

export type IndexedSourceParagraph = {
  blockId: string
  paragraphXml: string
}

export type ResolvedSemanticMapping = SemanticMapping & {
  /** Exact-match order in canonical visible source text; always resolved. */
  occurrence: number
  span: GroundedTextSpan
}

export type SemanticMappingFailureCode =
  | 'invalid_mapping'
  | 'duplicate_source_block_id'
  | 'unknown_source'
  | 'anchor_missing'
  | 'anchor_ambiguous'
  | 'invalid_occurrence'
  | 'anchor_unmappable'
  | 'span_conflict'
  | 'overlapping_spans'

export type SemanticMappingResolution =
  | { ok: true; mappings: ResolvedSemanticMapping[] }
  | { ok: false; code: SemanticMappingFailureCode; mappingIndex?: number }

function isSemanticConcept(value: unknown): value is SemanticConcept {
  return typeof value === 'string' && (SEMANTIC_CONCEPTS as readonly string[]).includes(value)
}

function isMapping(value: unknown): value is SemanticMapping {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const keys = Object.keys(row)
  const contactConcept = row.concept === 'customer_address' || row.concept === 'customer_phone'
  return keys.every((key) => ['sourceBlockId', 'concept', 'anchor', 'occurrence', 'customerIndex'].includes(key)) &&
    typeof row.sourceBlockId === 'string' && row.sourceBlockId.trim().length > 0 &&
    isSemanticConcept(row.concept) &&
    typeof row.anchor === 'string' && row.anchor.trim().length > 0 &&
    (row.occurrence === undefined || (Number.isInteger(row.occurrence) && (row.occurrence as number) >= 0)) &&
    (contactConcept
      ? Number.isInteger(row.customerIndex) && (row.customerIndex as number) >= 0
      : row.customerIndex === undefined || row.customerIndex === null)
}

/**
 * Resolve model claims against exact indexed source paragraph XML.
 * No semantic interpretation or mutation occurs. Identical claims coalesce;
 * any conflicting or overlapping ownership rejects the complete collection.
 */
export function resolveSemanticMappings(input: {
  mappings: unknown
  sourceBlocks: readonly IndexedSourceParagraph[]
}): SemanticMappingResolution {
  if (!Array.isArray(input.mappings)) return { ok: false, code: 'invalid_mapping' }

  const sourceById = new Map<string, IndexedSourceParagraph>()
  for (const block of input.sourceBlocks) {
    if (sourceById.has(block.blockId)) return { ok: false, code: 'duplicate_source_block_id' }
    sourceById.set(block.blockId, block)
  }

  const resolved: ResolvedSemanticMapping[] = []
  for (let index = 0; index < input.mappings.length; index++) {
    const candidate: unknown = input.mappings[index]
    if (!isMapping(candidate)) return { ok: false, code: 'invalid_mapping', mappingIndex: index }
    const source = sourceById.get(candidate.sourceBlockId)
    if (!source) return { ok: false, code: 'unknown_source', mappingIndex: index }

    const located = locateGroundedTextSpan(source.paragraphXml, candidate.anchor, candidate.occurrence)
    if (!located.ok) {
      const code: SemanticMappingFailureCode = located.reason === 'missing'
        ? 'anchor_missing'
        : located.reason === 'ambiguous'
          ? 'anchor_ambiguous'
          : located.reason === 'invalid_occurrence'
            ? 'invalid_occurrence'
            : 'anchor_unmappable'
      return { ok: false, code, mappingIndex: index }
    }

    const canonicalText = extractCanonicalParagraphText(source.paragraphXml)
    const matchOrder = candidate.occurrence ?? 0
    // Guard the supplied occurrence against any locator/model contract drift.
    if (canonicalText.slice(located.span.start, located.span.end) !== canonicalizeParagraphText(candidate.anchor)) {
      return { ok: false, code: 'anchor_unmappable', mappingIndex: index }
    }
    resolved.push({ ...candidate, occurrence: matchOrder, span: located.span })
  }

  const normalized: ResolvedSemanticMapping[] = []
  for (let index = 0; index < resolved.length; index++) {
    const current = resolved[index]!
    const duplicate = normalized.find((prior) => sameSpan(prior, current))
    if (duplicate) {
      if (duplicate.concept !== current.concept || duplicate.customerIndex !== current.customerIndex) return { ok: false, code: 'span_conflict', mappingIndex: index }
      // Exact-identical claims coalesce so an executor can perform one mutation.
      continue
    }
    normalized.push(current)
  }

  const byBlock = new Map<string, ResolvedSemanticMapping[]>()
  for (const mapping of normalized) {
    const list = byBlock.get(mapping.sourceBlockId) ?? []
    list.push(mapping)
    byBlock.set(mapping.sourceBlockId, list)
  }
  for (const list of byBlock.values()) {
    list.sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end)
    for (let index = 1; index < list.length; index++) {
      if (list[index]!.span.start < list[index - 1]!.span.end) {
        const originalIndex = resolved.indexOf(list[index]!)
        return { ok: false, code: 'overlapping_spans', mappingIndex: originalIndex }
      }
    }
  }

  return { ok: true, mappings: normalized }
}

function sameSpan(a: ResolvedSemanticMapping, b: ResolvedSemanticMapping): boolean {
  return a.sourceBlockId === b.sourceBlockId && a.span.start === b.span.start && a.span.end === b.span.end
}
