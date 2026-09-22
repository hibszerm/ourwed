import { canonicalizeParagraphText, extractCanonicalParagraphText } from '../documents/template/canonicalParagraph'
import { locateGroundedTextSpan, type GroundedTextSpan } from '../documents/template/docxParagraphEditor'

/** Closed set of semantic facts currently represented by the contract dataset. */
export const SEMANTIC_CONCEPTS = [
  'customer_1_name',
  'customer_2_name',
  'customer_address',
  'customer_phone',
  'customer_email',
  'wedding_date',
  'execution_date',
  'dependent_date',
  'fixed_date',
  'ambiguous_date',
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

export const DATE_ROLES = ['payment_due_date', 'brief_due_date', 'schedule_confirmation_date', 'delivery_due_date', 'album_due_date', 'preview_due_date', 'other_contractual_date'] as const
export type DateRole = (typeof DATE_ROLES)[number]
export const DATE_BASE_CONCEPTS = ['wedding_date', 'execution_date'] as const
export type DateBaseConcept = (typeof DATE_BASE_CONCEPTS)[number]
export const DATE_RELATION_DIRECTIONS = ['before', 'after'] as const
export type DateRelationDirection = (typeof DATE_RELATION_DIRECTIONS)[number]
export const DATE_RELATION_UNITS = ['calendar_days', 'calendar_weeks'] as const
export type DateRelationUnit = (typeof DATE_RELATION_UNITS)[number]

export const CUSTOMER_NAME_FORMS = ['BASE', 'GENITIVE', 'INSTRUMENTAL'] as const
export type CustomerNameForm = (typeof CUSTOMER_NAME_FORMS)[number]

type SemanticMappingBase = {
  sourceBlockId: string
  anchor: string
  occurrence?: number
}

type CustomerContactConcept = 'customer_address' | 'customer_phone' | 'customer_email'
export type NonContactConcept = Exclude<SemanticConcept, 'customer_1_name' | 'customer_2_name' | CustomerContactConcept | 'dependent_date' | 'fixed_date' | 'ambiguous_date'>
export type DateSemanticMapping = SemanticMappingBase & {
  concept: 'dependent_date' | 'fixed_date' | 'ambiguous_date'
  dateRole: DateRole
  baseDateConcept?: DateBaseConcept
  relation?: { direction: DateRelationDirection; amount: number; unit: DateRelationUnit }
}

/** Future model contract only: semantic source anchor, never a value or edit. */
export type SemanticMapping =
  | (SemanticMappingBase & {
      concept: 'customer_1_name' | 'customer_2_name'
      nameForm: CustomerNameForm
      customerIndex?: never
      customerIndexes?: never
    })
  | (SemanticMappingBase & {
      concept: CustomerContactConcept
      /** Zero-based sole owner for a contact source span. */
      customerIndex: 0 | 1
      customerIndexes?: never
      nameForm?: never
    })
  | (SemanticMappingBase & {
      concept: CustomerContactConcept
      /** Both customers jointly own the same contact source span. */
      customerIndexes: readonly [0, 1]
      customerIndex?: never
      nameForm?: never
    })
  | (SemanticMappingBase & {
      concept: NonContactConcept
      customerIndex?: never
      customerIndexes?: never
      nameForm?: never
    })
  | DateSemanticMapping

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
  const contactConcept = row.concept === 'customer_address' || row.concept === 'customer_phone' || row.concept === 'customer_email'
  const customerNameConcept = row.concept === 'customer_1_name' || row.concept === 'customer_2_name'
  const dateConcept = row.concept === 'dependent_date' || row.concept === 'fixed_date' || row.concept === 'ambiguous_date'
  const validNameForm = (CUSTOMER_NAME_FORMS as readonly unknown[]).includes(row.nameForm)
  const hasNameForm = Object.hasOwn(row, 'nameForm')
  const allowedKeys = ['sourceBlockId', 'concept', 'anchor', 'occurrence', 'customerIndex', 'customerIndexes', 'nameForm', 'dateRole', 'baseDateConcept', 'relation']
  const singleOwner = Number.isInteger(row.customerIndex) && (row.customerIndex === 0 || row.customerIndex === 1) && row.customerIndexes === undefined
  const sharedOwners = row.customerIndex === undefined && Array.isArray(row.customerIndexes) &&
    row.customerIndexes.length === 2 && row.customerIndexes[0] === 0 && row.customerIndexes[1] === 1
  const validDateClaim = !dateConcept || (
    Object.hasOwn(row, 'dateRole') &&
    (row.dateRole === null || (typeof row.dateRole === 'string' && (DATE_ROLES as readonly string[]).includes(row.dateRole))) &&
    row.customerIndex === undefined && row.customerIndexes === undefined && row.nameForm === undefined &&
    (row.concept !== 'dependent_date'
      ? row.baseDateConcept === undefined && row.relation === undefined
      : typeof row.baseDateConcept === 'string' && (DATE_BASE_CONCEPTS as readonly string[]).includes(row.baseDateConcept) &&
        !!row.relation && typeof row.relation === 'object' && Number.isInteger((row.relation as any).amount) &&
        (row.relation as any).amount >= 0 && (DATE_RELATION_DIRECTIONS as readonly string[]).includes((row.relation as any).direction) &&
        (DATE_RELATION_UNITS as readonly string[]).includes((row.relation as any).unit) && row.dateRole !== null)
  )
  return keys.every((key) => allowedKeys.includes(key)) &&
    typeof row.sourceBlockId === 'string' && row.sourceBlockId.trim().length > 0 &&
    isSemanticConcept(row.concept) &&
    typeof row.anchor === 'string' && row.anchor.trim().length > 0 &&
    (row.occurrence === undefined || (Number.isInteger(row.occurrence) && (row.occurrence as number) >= 0)) &&
    validDateClaim && (customerNameConcept
      ? hasNameForm && validNameForm && row.customerIndex === undefined && row.customerIndexes === undefined
      : !hasNameForm && (contactConcept ? singleOwner || sharedOwners : row.customerIndex === undefined && row.customerIndexes === undefined))
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
      if (duplicate.concept !== current.concept || !sameOwnership(duplicate, current) || duplicate.nameForm !== current.nameForm) return { ok: false, code: 'span_conflict', mappingIndex: index }
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

function sameOwnership(a: ResolvedSemanticMapping, b: ResolvedSemanticMapping): boolean {
  if (a.customerIndex !== b.customerIndex) return false
  const left = a.customerIndexes
  const right = b.customerIndexes
  return left === undefined ? right === undefined : right !== undefined && left[0] === right[0] && left[1] === right[1]
}
