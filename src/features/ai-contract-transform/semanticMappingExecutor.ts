import { canonicalizeParagraphText, extractCanonicalParagraphText } from '../documents/template/canonicalParagraph'
import { replaceGroundedTextSpan } from '../documents/template/docxParagraphEditor'
import { formatDateLikeSource, formatMoneyLikeSource } from '@/features/ai-contract-lab/resolveTypedSourceSpan'
import type { ContractTransformationDataset } from './types'
import { polishContractMoneyWords } from './polishContractMoneyWords'
import { parsePlnAmountInteger } from './quality/plnAmountSurface'
import {
  renderCustomerAddress,
  renderLocationSummary,
} from './quality/locationRendering'
import { renderExactCanonicalIdentity } from './quality/partyFilledIdentity'
import { normalizeForMatch } from './quality/normalize'
import type { ResolvedSemanticMapping } from './semanticMapping'

export type SemanticMappingExecutionFailureCode =
  | 'source_missing'
  | 'grounded_span_stale'
  | 'overlapping_spans'
  | 'missing_canonical_value'
  | 'invalid_customer_index'
  | 'shared_canonical_values_mismatch'
  | 'unsupported_shared_ownership'
  | 'unsupported_concept'
  | 'unsupported_name_form'
  | 'unrenderable_surface'
  | 'unsafe_ooxml_mutation'
  | 'ambiguous_date'

export type SemanticMappingExecutionResult =
  | {
      ok: true
      paragraphs: Array<{ blockId: string; paragraphXml: string }>
      /** Exact deterministic edits, for adapters that write the result to a DOCX package. */
      spanEdits: Array<{ blockId: string; span: { start: number; end: number }; replacement: string }>
    }
  | { ok: false; code: SemanticMappingExecutionFailureCode; mappingIndex?: number }

export type EvaluationNameFormResolver = (input: {
  canonicalIdentity: string
  nameForm: 'GENITIVE' | 'INSTRUMENTAL'
}) => string | undefined

/** Apply only canonical dataset values to already-grounded source spans. */
export function executeSemanticMappings(input: {
  resolvedMappings: readonly ResolvedSemanticMapping[]
  canonicalDataset: ContractTransformationDataset
  sourceParagraphs: readonly { blockId: string; paragraphXml: string }[]
  /** Source/example identities ordered to match customer_1_name/customer_2_name. */
  sourceCustomerIdentities?: readonly (string | undefined)[]
  /** Explicit offline-evaluation seam; production callers leave this unset. */
  evaluationNameFormResolver?: EvaluationNameFormResolver
}): SemanticMappingExecutionResult {
  const sourceById = new Map<string, string>()
  for (const source of input.sourceParagraphs) {
    if (sourceById.has(source.blockId)) return { ok: false, code: 'source_missing' }
    sourceById.set(source.blockId, source.paragraphXml)
  }

  const prepared: Array<ResolvedSemanticMapping & { replacement: string; inputIndex: number }> = []
  for (let index = 0; index < input.resolvedMappings.length; index++) {
    const mapping = input.resolvedMappings[index]!
    const xml = sourceById.get(mapping.sourceBlockId)
    if (xml === undefined) return { ok: false, code: 'source_missing', mappingIndex: index }
    const visible = extractCanonicalParagraphText(xml)
    if (visible.slice(mapping.span.start, mapping.span.end) !== canonicalizeParagraphText(mapping.anchor)) {
      return { ok: false, code: 'grounded_span_stale', mappingIndex: index }
    }
    const rendered = renderCanonicalValue(mapping, input.canonicalDataset, input.sourceCustomerIdentities, input.evaluationNameFormResolver)
    if (!rendered.ok) return { ok: false, code: rendered.code, mappingIndex: index }
    prepared.push({ ...mapping, replacement: rendered.value, inputIndex: index })
  }

  const byBlock = new Map<string, typeof prepared>()
  for (const mapping of prepared) {
    const list = byBlock.get(mapping.sourceBlockId) ?? []
    list.push(mapping)
    byBlock.set(mapping.sourceBlockId, list)
  }

  const paragraphs: Array<{ blockId: string; paragraphXml: string }> = []
  const spanEdits: Array<{ blockId: string; span: { start: number; end: number }; replacement: string }> = []
  try {
    for (const [blockId, mappings] of byBlock) {
      const ascending = [...mappings].sort((a, b) => a.span.start - b.span.start)
      for (let index = 1; index < ascending.length; index++) {
        const left = ascending[index - 1]!
        const right = ascending[index]!
        if (right.span.start < left.span.end) {
          return { ok: false, code: 'overlapping_spans', mappingIndex: right.inputIndex }
        }
      }
      const ordered = [...ascending].reverse()
      let paragraphXml = sourceById.get(blockId)!
      for (const mapping of ordered) {
        paragraphXml = replaceGroundedTextSpan(paragraphXml, mapping.span, mapping.replacement)
      }
      paragraphs.push({ blockId, paragraphXml })
      spanEdits.push(...mappings.map(({ span, replacement }) => ({
        blockId,
        span: { start: span.start, end: span.end },
        replacement,
      })))
    }
  } catch {
    return { ok: false, code: 'unsafe_ooxml_mutation' }
  }
  return { ok: true, paragraphs, spanEdits }
}

type RenderResult =
  | { ok: true; value: string }
  | { ok: false; code: 'invalid_customer_index' | 'missing_canonical_value' | 'unsupported_concept' | 'unsupported_name_form' | 'unrenderable_surface' | 'shared_canonical_values_mismatch' | 'unsupported_shared_ownership' | 'ambiguous_date' }

function renderCanonicalValue(
  mapping: ResolvedSemanticMapping,
  dataset: ContractTransformationDataset,
  sourceCustomerIdentities?: readonly (string | undefined)[],
  evaluationNameFormResolver?: EvaluationNameFormResolver,
): RenderResult {
  const source = mapping.anchor
  switch (mapping.concept) {
    case 'customer_1_name':
    case 'customer_2_name': {
      const names = dataset.clients.displayNames.trim().split(/\s+i\s+|\s+oraz\s+|,\s*/i).filter(Boolean)
      const personIndex = mapping.concept === 'customer_1_name' ? 0 : 1
      const canonicalName = names[personIndex]
      if (!canonicalName || names.length !== dataset.clients.personCount || (personIndex === 1 && dataset.clients.personCount !== 2)) {
        return { ok: false, code: 'missing_canonical_value' }
      }
      if (mapping.nameForm !== 'BASE') {
        if (!evaluationNameFormResolver) return { ok: false, code: 'unsupported_name_form' }
        const evaluatedValue = evaluationNameFormResolver({
          canonicalIdentity: canonicalName,
          nameForm: mapping.nameForm,
        })
        return evaluatedValue?.trim()
          ? { ok: true, value: evaluatedValue }
          : { ok: false, code: 'unsupported_name_form' }
      }
      const exactName = renderExactCanonicalIdentity(source, sourceCustomerIdentities?.[personIndex], canonicalName)
      if (exactName) return { ok: true, value: exactName }
      return normalizeForMatch(source) === normalizeForMatch(canonicalName)
        ? { ok: true, value: canonicalName }
        : { ok: false, code: 'unrenderable_surface' }
    }
    case 'customer_address': {
      if (mapping.customerIndexes !== undefined) {
        if (!isSharedCustomerOwnership(mapping.customerIndexes) || dataset.clients.personCount !== 2) {
          return { ok: false, code: 'invalid_customer_index' }
        }
        const first = dataset.clients.customers?.[0]?.address?.trim()
        const second = dataset.clients.customers?.[1]?.address?.trim()
        if (!first || !second) return { ok: false, code: 'missing_canonical_value' }
        const firstRendered = renderCustomerAddress(first)
        const secondRendered = renderCustomerAddress(second)
        if (!firstRendered || !secondRendered) return { ok: false, code: 'unrenderable_surface' }
        if (firstRendered !== secondRendered) return { ok: false, code: 'shared_canonical_values_mismatch' }
        return { ok: true, value: firstRendered }
      }
      const customer = getOwnedCustomer(mapping, dataset)
      if (!customer.ok) return customer
      const address = customer.customer.address?.trim()
      if (!address) return { ok: false, code: 'missing_canonical_value' }
      const value = renderCustomerAddress(address)
      return value ? { ok: true, value } : { ok: false, code: 'unrenderable_surface' }
    }
    case 'customer_phone': {
      if (mapping.customerIndexes !== undefined) {
        if (!isSharedCustomerOwnership(mapping.customerIndexes) || dataset.clients.personCount !== 2) {
          return { ok: false, code: 'invalid_customer_index' }
        }
        for (const customerIndex of mapping.customerIndexes) {
          const phone = dataset.clients.customers?.[customerIndex]?.phone?.trim()
          if (phone) return { ok: true, value: phone }
        }
        return { ok: false, code: 'missing_canonical_value' }
      }
      const customer = getOwnedCustomer(mapping, dataset)
      if (!customer.ok) return customer
      const phone = customer.customer.phone?.trim()
      return phone ? { ok: true, value: phone } : { ok: false, code: 'missing_canonical_value' }
    }
    case 'customer_email': {
      if (mapping.customerIndexes !== undefined) {
        if (!isSharedCustomerOwnership(mapping.customerIndexes) || dataset.clients.personCount !== 2) {
          return { ok: false, code: 'invalid_customer_index' }
        }
        for (const customerIndex of mapping.customerIndexes) {
          const email = dataset.clients.customers?.[customerIndex]?.email?.trim()
          if (email) return { ok: true, value: email }
        }
        return { ok: false, code: 'missing_canonical_value' }
      }
      const customer = getOwnedCustomer(mapping, dataset)
      if (!customer.ok) return customer
      const email = customer.customer.email?.trim()
      return email ? { ok: true, value: email } : { ok: false, code: 'missing_canonical_value' }
    }
    case 'wedding_date':
    case 'execution_date': {
      const date = (mapping.concept === 'wedding_date' ? dataset.dates.weddingDate : dataset.dates.contractExecutionDate).trim()
      if (!date) return { ok: false, code: 'missing_canonical_value' }
      const value = formatDateLikeSource({ canonicalDate: date, sourceText: source })
      return value ? { ok: true, value } : { ok: false, code: 'unrenderable_surface' }
    }
    case 'fixed_date':
      return { ok: true, value: source }
    case 'ambiguous_date':
      return { ok: false, code: 'ambiguous_date' }
    case 'dependent_date': {
      if (!mapping.baseDateConcept || !mapping.relation || mapping.relation.amount < 0) return { ok: false, code: 'unsupported_concept' }
      if (mapping.relation.unit !== 'calendar_days' && mapping.relation.unit !== 'calendar_weeks') return { ok: false, code: 'unsupported_concept' }
      const baseText = mapping.baseDateConcept === 'wedding_date' ? dataset.dates.weddingDate : dataset.dates.contractExecutionDate
      const base = new Date(`${baseText}T00:00:00Z`)
      if (Number.isNaN(base.getTime())) return { ok: false, code: 'unrenderable_surface' }
      const days = mapping.relation.amount * (mapping.relation.unit === 'calendar_weeks' ? 7 : 1) * (mapping.relation.direction === 'before' ? -1 : 1)
      base.setUTCDate(base.getUTCDate() + days)
      const iso = base.toISOString().slice(0, 10)
      const value = formatDateLikeSource({ canonicalDate: iso, sourceText: source })
      return value ? { ok: true, value } : { ok: false, code: 'unrenderable_surface' }
    }
    case 'total':
    case 'deposit':
    case 'remaining':
    case 'total_words':
    case 'deposit_words':
    case 'remaining_words': {
      const formatted = mapping.concept.startsWith('total')
        ? dataset.finances.contractValueFormatted
        : mapping.concept.startsWith('deposit')
          ? dataset.finances.depositFormatted
          : dataset.finances.remainingFormatted
      if (!formatted?.trim()) return { ok: false, code: 'missing_canonical_value' }
      const amount = parsePlnAmountInteger(formatted)
      if (amount == null) return { ok: false, code: 'unrenderable_surface' }
      if (mapping.concept.endsWith('_words')) {
        const words = polishContractMoneyWords(amount)
        return words ? { ok: true, value: words } : { ok: false, code: 'unrenderable_surface' }
      }
      const value = formatMoneyLikeSource({ canonicalAmount: amount, sourceText: source })
      return value ? { ok: true, value } : { ok: false, code: 'unrenderable_surface' }
    }
    case 'preparation_location': {
      const location = dataset.locations.preparation
      if (!location) return { ok: false, code: 'missing_canonical_value' }
      const value = renderLocationSummary(location)
      return value ? { ok: true, value } : { ok: false, code: 'unrenderable_surface' }
    }
    case 'bride_preparation_location':
    case 'groom_preparation_location':
    case 'shared_preparation_location': {
      const person = mapping.concept === 'bride_preparation_location'
        ? 'bride'
        : mapping.concept === 'groom_preparation_location'
          ? 'groom'
          : 'shared'
      const location = dataset.locations.preparationLocations?.find((entry) => entry.person === person)
      if (!location) return { ok: false, code: 'missing_canonical_value' }
      const value = renderLocationSummary({ fullAddress: location.fullAddress })
      return value ? { ok: true, value } : { ok: false, code: 'unrenderable_surface' }
    }
    case 'ceremony_location':
    case 'reception_location': {
      const location = mapping.concept === 'ceremony_location' ? dataset.locations.ceremony : dataset.locations.reception
      if (!location) return { ok: false, code: 'missing_canonical_value' }
      const value = renderLocationSummary(location)
      return value ? { ok: true, value } : { ok: false, code: 'unrenderable_surface' }
    }
    default:
      return { ok: false, code: 'unsupported_concept' }
  }
}

function isSharedCustomerOwnership(value: readonly number[]): value is readonly [0, 1] {
  return Array.isArray(value) && value.length === 2 && value[0] === 0 && value[1] === 1
}

function getOwnedCustomer(
  mapping: ResolvedSemanticMapping,
  dataset: ContractTransformationDataset,
): { ok: true; customer: NonNullable<ContractTransformationDataset['clients']['customers']>[number] } | { ok: false; code: 'invalid_customer_index' } {
  if (!Number.isInteger(mapping.customerIndex) || (mapping.customerIndex ?? -1) < 0) {
    return { ok: false, code: 'invalid_customer_index' }
  }
  const customer = dataset.clients.customers?.[mapping.customerIndex!]
  return customer ? { ok: true, customer } : { ok: false, code: 'invalid_customer_index' }
}
