import { canonicalizeParagraphText, extractCanonicalParagraphText } from '../documents/template/canonicalParagraph'
import { replaceGroundedTextSpan } from '../documents/template/docxParagraphEditor'
import { formatDateLikeSource, formatMoneyLikeSource } from '@/features/ai-contract-lab/resolveTypedSourceSpan'
import type { ContractTransformationDataset } from './types'
import type { RequiresUserInputDate, SuppliedDateValues } from './types'
import { polishContractMoneyWords } from './polishContractMoneyWords'
import { inspectMoneyWordSourcePresentation } from './moneyWordSourcePresentation'
import { parsePlnAmountInteger } from './quality/plnAmountSurface'
import {
  renderCustomerAddress,
  renderLocationSummary,
} from './quality/locationRendering'
import { renderExactCanonicalIdentity } from './quality/partyFilledIdentity'
import { normalizeForMatch } from './quality/normalize'
import type { ResolvedSemanticMapping } from './semanticMapping'
import { parseFlexibleDate } from '@/features/ai-contract-lab/semanticValueEquality'

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
      spanEdits: Array<{ blockId: string; span: { start: number; end: number }; replacement: string; replacementSegments?: string[] }>
    }
  | { ok: false; code: SemanticMappingExecutionFailureCode; mappingIndex?: number }
  | { ok: false; code: 'requires_user_input'; mappingIndex?: number; documentStateId: string; requiresUserInputDates: RequiresUserInputDate[] }
  | { ok: false; code: 'invalid_supplied_date_values' | 'stale_supplied_date_values' | 'duplicate_supplied_date_id' | 'unknown_supplied_date_id' | 'invalid_supplied_date_value' }

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
  /** Values for unresolved grounded mappings, bound to the original source state. */
  suppliedDateValues?: SuppliedDateValues
}): SemanticMappingExecutionResult {
  const sourceById = new Map<string, string>()
  for (const source of input.sourceParagraphs) {
    if (sourceById.has(source.blockId)) return { ok: false, code: 'source_missing' }
    sourceById.set(source.blockId, source.paragraphXml)
  }

  const prepared: Array<ResolvedSemanticMapping & { replacement: string; replacementSegments?: string[]; inputIndex: number }> = []
  const requiresUserInputDates: RequiresUserInputDate[] = []
  const documentStateId = fingerprintSourceState(input.sourceParagraphs)
  const suppliedById = new Map<string, string>()
  if (input.suppliedDateValues) {
    if (input.suppliedDateValues.documentStateId !== documentStateId || !Array.isArray(input.suppliedDateValues.values)) {
      return { ok: false, code: 'stale_supplied_date_values' }
    }
    for (const supplied of input.suppliedDateValues.values) {
      if (!supplied || typeof supplied.unresolvedDateId !== 'string' || typeof supplied.value !== 'string') {
        return { ok: false, code: 'invalid_supplied_date_values' }
      }
      if (suppliedById.has(supplied.unresolvedDateId)) return { ok: false, code: 'duplicate_supplied_date_id' }
      if (!isCanonicalIsoDate(supplied.value)) return { ok: false, code: 'invalid_supplied_date_value' }
      suppliedById.set(supplied.unresolvedDateId, supplied.value)
    }
  }
  const executionDateMappings = input.resolvedMappings.filter((mapping) => mapping.concept === 'execution_date')
  for (let index = 0; index < input.resolvedMappings.length; index++) {
    const mapping = input.resolvedMappings[index]!
    const xml = sourceById.get(mapping.sourceBlockId)
    if (xml === undefined) return { ok: false, code: 'source_missing', mappingIndex: index }
    const visible = extractCanonicalParagraphText(xml)
    if (visible.slice(mapping.span.start, mapping.span.end) !== canonicalizeParagraphText(mapping.anchor)) {
      return { ok: false, code: 'grounded_span_stale', mappingIndex: index }
    }
    let executionMapping = mapping
    if (isMoneyWordsConcept(mapping.concept)) {
      const presentation = inspectMoneyWordSourcePresentation({ sourceText: visible, span: mapping.span })
      if (presentation.hundredthsSuffix && presentation.replacementSpan.end < mapping.span.end) {
        executionMapping = {
          ...mapping,
          anchor: visible.slice(mapping.span.start, presentation.replacementSpan.end),
          span: presentation.replacementSpan,
        }
      }
    }
    const rendered = renderCanonicalValue(executionMapping, input.canonicalDataset, input.sourceCustomerIdentities, input.evaluationNameFormResolver, executionDateMappings)
    if (!rendered.ok) {
      if (rendered.code === 'requires_user_input') {
        const role = dateRoleForMapping(mapping)
        const unresolvedDateId = stableUnresolvedDateId(mapping, role)
        requiresUserInputDates.push({ unresolvedDateId, documentStateId, sourceBlockId: mapping.sourceBlockId, anchor: mapping.anchor, span: { start: mapping.span.start, end: mapping.span.end }, ...(role ? { role, label: dateRoleLabel(role) } : {}), reason: rendered.reason })
        const suppliedValue = suppliedById.get(unresolvedDateId)
        if (suppliedValue !== undefined) {
          const replacement = formatDatePreservingDuePrefix(suppliedValue, mapping.anchor)
          if (!replacement) return { ok: false, code: 'invalid_supplied_date_value' }
          prepared.push({ ...mapping, replacement, inputIndex: index })
        }
        continue
      }
      return { ok: false, code: rendered.code, mappingIndex: index }
    }
    if (executionMapping.span.segments && executionMapping.span.segments.length > 1) {
      if (!rendered.segments || rendered.segments.length !== executionMapping.span.segments.length || rendered.segments.some((part) => !part.trim())) {
        return { ok: false, code: 'unrenderable_surface', mappingIndex: index }
      }
      prepared.push({ ...executionMapping, replacement: rendered.value, replacementSegments: rendered.segments, inputIndex: index })
    } else {
      prepared.push({ ...executionMapping, replacement: rendered.value, inputIndex: index })
    }
  }

  for (const suppliedId of suppliedById.keys()) {
    if (!requiresUserInputDates.some((item) => item.unresolvedDateId === suppliedId)) {
      return { ok: false, code: 'unknown_supplied_date_id' }
    }
  }
  const stillUnresolved = requiresUserInputDates.filter((item) => !suppliedById.has(item.unresolvedDateId))
  if (stillUnresolved.length > 0) return { ok: false, code: 'requires_user_input', documentStateId, requiresUserInputDates: stillUnresolved }

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
        paragraphXml = replaceGroundedTextSpan(paragraphXml, mapping.span, mapping.replacementSegments ?? mapping.replacement)
      }
      paragraphs.push({ blockId, paragraphXml })
      spanEdits.push(...mappings.map(({ span, replacement, replacementSegments }) => ({
        blockId,
        span: { start: span.start, end: span.end },
        replacement,
        ...(replacementSegments ? { replacementSegments } : {}),
      })))
    }
  } catch {
    return { ok: false, code: 'unsafe_ooxml_mutation' }
  }
  return { ok: true, paragraphs, spanEdits }
}

function isMoneyWordsConcept(concept: ResolvedSemanticMapping['concept']): boolean {
  return concept === 'total_words' || concept === 'deposit_words' || concept === 'remaining_words'
}

type RenderResult =
  | { ok: true; value: string; segments?: string[] }
  | { ok: false; code: 'invalid_customer_index' | 'missing_canonical_value' | 'unsupported_concept' | 'unsupported_name_form' | 'unrenderable_surface' | 'shared_canonical_values_mismatch' | 'unsupported_shared_ownership' | 'ambiguous_date' }
  | { ok: false; code: 'requires_user_input'; reason: string }

function renderCanonicalValue(
  mapping: ResolvedSemanticMapping,
  dataset: ContractTransformationDataset,
  sourceCustomerIdentities?: readonly (string | undefined)[],
  evaluationNameFormResolver?: EvaluationNameFormResolver,
  executionDateMappings: readonly ResolvedSemanticMapping[] = [],
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
        const firstCustomer = dataset.clients.customers?.[0]
        const secondCustomer = dataset.clients.customers?.[1]
        const firstRendered = firstCustomer?.addressTarget?.text ?? renderCustomerAddress(first)
        const secondRendered = secondCustomer?.addressTarget?.text ?? renderCustomerAddress(second)
        if (!firstRendered || !secondRendered) return { ok: false, code: 'unrenderable_surface' }
        if (firstRendered !== secondRendered) return { ok: false, code: 'shared_canonical_values_mismatch' }
        return { ok: true, value: firstRendered, ...(firstCustomer?.addressTarget ? { segments: firstCustomer.addressTarget.segments } : {}) }
      }
      const customer = getOwnedCustomer(mapping, dataset)
      if (!customer.ok) return customer
      const address = customer.customer.address?.trim()
      if (!address) return { ok: false, code: 'missing_canonical_value' }
      const target = customer.customer.addressTarget
      const value = target?.text ?? renderCustomerAddress(address)
      return value ? { ok: true, value, ...(target ? { segments: target.segments } : {}) } : { ok: false, code: 'unrenderable_surface' }
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
      const value = formatDatePreservingDuePrefix(date, mapping.anchor)
      return value ? { ok: true, value } : { ok: false, code: 'unrenderable_surface' }
    }
    case 'final_payment_due_date':
    case 'delivery_due_date': {
      const date = mapping.concept === 'final_payment_due_date' ? dataset.dates.finalPaymentDueDate : dataset.dates.deliveryDueDate
      if (!date?.trim()) return { ok: false, code: 'requires_user_input', reason: `No authoritative ${mapping.concept} is available` }
      const value = formatDatePreservingDuePrefix(date, mapping.anchor)
      return value ? { ok: true, value } : { ok: false, code: 'unrenderable_surface' }
    }
    case 'deposit_due_date':
      return resolveDepositDueDate({ mapping, executionDateMappings, currentExecutionDate: dataset.dates.contractExecutionDate })
    case 'fixed_date':
      return { ok: false, code: 'requires_user_input', reason: 'No authoritative value or supported relation is available' }
    case 'ambiguous_date':
      return { ok: false, code: 'requires_user_input', reason: 'Date role or authority is unresolved' }
    case 'dependent_date':
      return { ok: false, code: 'requires_user_input', reason: 'A model-supplied date offset is not an authoritative source' }
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
      const value = location.target?.text ?? renderLocationSummary(location)
      return value ? { ok: true, value, ...(location.target ? { segments: location.target.segments } : {}) } : { ok: false, code: 'unrenderable_surface' }
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
      const value = location.target?.text ?? renderLocationSummary({ fullAddress: location.fullAddress })
      return value ? { ok: true, value, ...(location.target ? { segments: location.target.segments } : {}) } : { ok: false, code: 'unrenderable_surface' }
    }
    case 'ceremony_location':
    case 'reception_location': {
      const location = mapping.concept === 'ceremony_location' ? dataset.locations.ceremony : dataset.locations.reception
      if (!location) return { ok: false, code: 'missing_canonical_value' }
      const value = location.target?.text ?? renderLocationSummary(location)
      return value ? { ok: true, value, ...(location.target ? { segments: location.target.segments } : {}) } : { ok: false, code: 'unrenderable_surface' }
    }
    default:
      return { ok: false, code: 'unsupported_concept' }
  }
}

function resolveDepositDueDate(input: {
  mapping: ResolvedSemanticMapping
  executionDateMappings: readonly ResolvedSemanticMapping[]
  currentExecutionDate: string
}): RenderResult {
  if (input.executionDateMappings.length === 0) {
    return { ok: false, code: 'requires_user_input', reason: 'A grounded source execution date is required to derive the deposit deadline' }
  }
  const parsedExecutionValues = input.executionDateMappings.map((mapping) => parseValidDate(mapping.anchor)?.toISOString().slice(0, 10) ?? null)
  if (parsedExecutionValues.some((value) => value === null)) {
    return { ok: false, code: 'requires_user_input', reason: 'A grounded source execution date cannot be parsed safely' }
  }
  const sourceExecutionValues = new Set(parsedExecutionValues)
  if (sourceExecutionValues.size !== 1) {
    return { ok: false, code: 'requires_user_input', reason: 'Grounded source execution dates do not establish one value for the deposit deadline' }
  }
  const sourceExecution = parseValidDate([...sourceExecutionValues][0]!)
  const sourceDeposit = parseValidDate(input.mapping.anchor)
  const currentExecution = parseValidDate(input.currentExecutionDate)
  if (!sourceExecution || !sourceDeposit || !currentExecution) {
    return { ok: false, code: 'requires_user_input', reason: 'Source dates do not establish a supported calendar-day offset' }
  }
  const offsetDays = Math.round((sourceDeposit.getTime() - sourceExecution.getTime()) / 86_400_000)
  currentExecution.setUTCDate(currentExecution.getUTCDate() + offsetDays)
  const canonical = currentExecution.toISOString().slice(0, 10)
  const value = formatDatePreservingDuePrefix(canonical, input.mapping.anchor)
  return value ? { ok: true, value } : { ok: false, code: 'unrenderable_surface' }
}

function stableUnresolvedDateId(mapping: ResolvedSemanticMapping, role?: string): string {
  const baseDateConcept = 'baseDateConcept' in mapping ? mapping.baseDateConcept ?? '' : ''
  const relation = 'relation' in mapping ? JSON.stringify(mapping.relation ?? null) : ''
  return [
    'unresolved-date-v1',
    encodeURIComponent(mapping.sourceBlockId),
    `${mapping.span.start}-${mapping.span.end}`,
    encodeURIComponent(mapping.concept),
    encodeURIComponent(role ?? ''),
    encodeURIComponent(baseDateConcept),
    encodeURIComponent(relation),
    String(mapping.occurrence ?? 0),
  ].join(':')
}

function fingerprintSourceState(sourceParagraphs: readonly { blockId: string; paragraphXml: string }[]): string {
  const serialized = JSON.stringify([...sourceParagraphs]
    .map(({ blockId, paragraphXml }) => [blockId, paragraphXml])
    .sort(([a], [b]) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0))
  // A 128-bit FNV-1a fingerprint makes the resume token deterministic without
  // retaining source prose or introducing a Node-only crypto dependency.
  let fingerprint = 0x6c62272e07bb014262b821756295c58dn
  const prime = 0x0000000001000000000000000000013bn
  for (let index = 0; index < serialized.length; index++) {
    fingerprint ^= BigInt(serialized.charCodeAt(index))
    fingerprint = BigInt.asUintN(128, fingerprint * prime)
  }
  return `source-state-v1:${fingerprint.toString(16).padStart(32, '0')}`
}

function isCanonicalIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return parseFlexibleDate(value) === value
}

function formatDatePreservingDuePrefix(canonicalDate: string, sourceText: string): string | null {
  const formatted = formatDateLikeSource({ canonicalDate, sourceText })
  if (!formatted) return null
  const duePrefix = sourceText.match(/^\s*(do)\s+/i)?.[1]
  const yearSuffix = /\s+roku\s*$/i.test(sourceText) ? ' roku' : ''
  return `${duePrefix ? `${duePrefix} ` : ''}${formatted}${yearSuffix}`
}

function parseValidDate(value: string): Date | null {
  const iso = parseFlexibleDate(value)
  if (!iso) return null
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(`${iso}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null
  return date
}

function dateRoleForMapping(mapping: ResolvedSemanticMapping): string | undefined {
  if (mapping.concept === 'fixed_date' || mapping.concept === 'ambiguous_date' || mapping.concept === 'dependent_date') return mapping.dateRole ?? undefined
  if (mapping.concept === 'deposit_due_date' || mapping.concept === 'final_payment_due_date' || mapping.concept === 'delivery_due_date') return mapping.concept
  return undefined
}

function dateRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    payment_due_date: 'Termin płatności',
    brief_due_date: 'Termin przekazania briefu',
    schedule_confirmation_date: 'Termin potwierdzenia harmonogramu',
    delivery_due_date: 'Termin przekazania materiału',
    album_due_date: 'Termin albumu',
    preview_due_date: 'Termin podglądu',
    other_contractual_date: 'Termin umowny',
    deposit_due_date: 'Termin zadatku',
    final_payment_due_date: 'Termin płatności końcowej',
  }
  return labels[role] ?? 'Termin umowny'
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
