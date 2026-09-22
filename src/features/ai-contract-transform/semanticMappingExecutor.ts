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
import { renderCanonicalIdentityLikeSource } from './quality/partyFilledIdentity'
import type { ResolvedSemanticMapping } from './semanticMapping'

export type SemanticMappingExecutionFailureCode =
  | 'source_missing'
  | 'grounded_span_stale'
  | 'overlapping_spans'
  | 'missing_canonical_value'
  | 'invalid_customer_index'
  | 'unsupported_concept'
  | 'unrenderable_surface'
  | 'unsafe_ooxml_mutation'

export type SemanticMappingExecutionResult =
  | {
      ok: true
      paragraphs: Array<{ blockId: string; paragraphXml: string }>
      /** Exact deterministic edits, for adapters that write the result to a DOCX package. */
      spanEdits: Array<{ blockId: string; span: { start: number; end: number }; replacement: string }>
    }
  | { ok: false; code: SemanticMappingExecutionFailureCode; mappingIndex?: number }

/** Apply only canonical dataset values to already-grounded source spans. */
export function executeSemanticMappings(input: {
  resolvedMappings: readonly ResolvedSemanticMapping[]
  canonicalDataset: ContractTransformationDataset
  sourceParagraphs: readonly { blockId: string; paragraphXml: string }[]
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
    const rendered = renderCanonicalValue(mapping, input.canonicalDataset)
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
  | { ok: false; code: 'invalid_customer_index' | 'missing_canonical_value' | 'unsupported_concept' | 'unrenderable_surface' }

function renderCanonicalValue(
  mapping: ResolvedSemanticMapping,
  dataset: ContractTransformationDataset,
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
      const value = renderCanonicalIdentityLikeSource(source, canonicalName)
      return value && identityRenderingUsesSupportedForms(source, canonicalName, value)
        ? { ok: true, value }
        : { ok: false, code: 'unrenderable_surface' }
    }
    case 'customer_address': {
      const customer = getOwnedCustomer(mapping, dataset)
      if (!customer.ok) return customer
      const address = customer.customer.address?.trim()
      if (!address) return { ok: false, code: 'missing_canonical_value' }
      const value = renderCustomerAddress(address)
      return value ? { ok: true, value } : { ok: false, code: 'unrenderable_surface' }
    }
    case 'customer_phone': {
      const customer = getOwnedCustomer(mapping, dataset)
      if (!customer.ok) return customer
      const phone = customer.customer.phone?.trim()
      return phone ? { ok: true, value: phone } : { ok: false, code: 'missing_canonical_value' }
    }
    case 'wedding_date':
    case 'execution_date': {
      const date = (mapping.concept === 'wedding_date' ? dataset.dates.weddingDate : dataset.dates.contractExecutionDate).trim()
      if (!date) return { ok: false, code: 'missing_canonical_value' }
      const value = formatDateLikeSource({ canonicalDate: date, sourceText: source })
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

/** The shared renderer has a broader legacy rule; accept only its proven forms here. */
function identityRenderingUsesSupportedForms(source: string, canonical: string, rendered: string): boolean {
  const split = (value: string) => value.split(/\s+i\s+|\s+oraz\s+/i).map((part) => part.trim().split(/\s+/))
  const sourcePeople = split(source)
  const canonicalPeople = split(canonical)
  const renderedPeople = split(rendered)
  if (sourcePeople.length !== canonicalPeople.length || sourcePeople.length !== renderedPeople.length) return false
  return sourcePeople.every((sourceTokens, personIndex) => {
    const canonicalTokens = canonicalPeople[personIndex]!
    const renderedTokens = renderedPeople[personIndex]!
    if (sourceTokens.length !== canonicalTokens.length || sourceTokens.length !== renderedTokens.length) return false
    return sourceTokens.every((sourceToken, tokenIndex) => {
      const canonicalToken = canonicalTokens[tokenIndex]!
      const renderedToken = renderedTokens[tokenIndex]!
      return sourceToken === canonicalToken
        ? renderedToken === canonicalToken
        : (sourceToken.endsWith('ą') || sourceToken.endsWith('ę')) && canonicalToken.endsWith('a') &&
          renderedToken === `${canonicalToken.slice(0, -1)}${tokenIndex === 0 ? 'ę' : 'ą'}` ||
          sourceToken.endsWith('ego') && canonicalToken.endsWith('y') && renderedToken === `${canonicalToken.slice(0, -1)}ego`
    })
  })
}
