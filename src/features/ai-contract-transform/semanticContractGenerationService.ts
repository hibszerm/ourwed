import JSZip from 'jszip'
import { extractCanonicalParagraphText } from '@/features/documents/template/canonicalParagraph'
import { insertAdditionalServicesIntoBlocks } from './insertAdditionalServices'
import { executeSemanticMappings } from './semanticMappingExecutor'
import { indexDocxForTransform } from './indexDocxForTransform'
import { expandBlocksWithParagraphInsertions } from './expandBlocksWithInsertions'
import { groundParsedSemanticMapResponse, parseSemanticMapResponse, buildSemanticMapRequest, type SemanticMapCandidate, type SemanticMapProviderRequest } from './semanticMapModelContract'
import type { SemanticExtrasPlacement } from './semanticExtrasPlacement'
import { writeSemanticMappingDocx } from './docxTransformWriter'
import type { ContractTransformationDataset, RequiresUserInputDate, TransformDocumentBlock } from './types'
import type { ResolvedSemanticMapping } from './semanticMapping'
import { SemanticMapTransportError } from './semanticMapTransportTypes'
import { isValidSemanticExtrasTemplateMetadata } from './semanticExtrasTemplateMetadata'
import type { SemanticExtrasTemplateMetadata } from './semanticExtrasPlacement'

export type SemanticMapProviderResult = Extract<ReturnType<typeof parseSemanticMapResponse>, { ok: true }>
export type SemanticMapProvider = (request: SemanticMapProviderRequest) => Promise<SemanticMapProviderResult>
export type SemanticContractCanonicalDataset = Omit<ContractTransformationDataset, 'clients'> & {
  clients: Omit<ContractTransformationDataset['clients'], 'customers'> & {
    /** Ordered ownership slots are mandatory on the production semantic path. */
    customers: NonNullable<ContractTransformationDataset['clients']['customers']>
  }
}

/** Narrow, already-authoritative snapshot; no Wedding aggregate is retained. */
export type SemanticContractGenerationInput = {
  sourceDocxBytes: ArrayBuffer
  sourceIdentity: { templateId?: string; version?: string; fileName?: string }
  currentDate: string
  /** Build with buildContractTransformationDataset; structured values remain intact. */
  canonicalDataset: SemanticContractCanonicalDataset
  /** Verified structure loaded from this exact template version; never source-hash catalog lookup. */
  extrasTemplateMetadata?: SemanticExtrasTemplateMetadata | null
  /** Model selection is explicit at the future transport boundary. */
  modelCandidate: SemanticMapCandidate
}

export type SemanticGenerationRequirement =
  | { id: string; kind: 'date'; valueType: 'DATE'; label: string; sourceBlockId: string; date: RequiresUserInputDate }
  | { id: string; kind: 'customer_email'; valueType: 'EMAIL'; label: string; customerIndexes: readonly number[]; sourceBlockId: string }

export type SemanticGenerationRequirementValues = Readonly<Record<string, string>>

export type SemanticContractGenerationPendingState = {
  /** Page/session-memory state only. There is intentionally no persistence adapter. */
  sourceDocxBytes: ArrayBuffer
  sourceIdentity: SemanticContractGenerationInput['sourceIdentity']
  currentDate: string
  canonicalDataset: SemanticContractCanonicalDataset
  sourceBlocks: TransformDocumentBlock[]
  sourceParagraphs: Array<{ blockId: string; paragraphXml: string }>
  semanticMappings: ResolvedSemanticMapping[]
  extrasPlacement: SemanticExtrasPlacement | null
  extrasTemplateMetadata: SemanticExtrasTemplateMetadata | null
  requirements: SemanticGenerationRequirement[]
  suppliedValues: Record<string, string>
  documentStateId?: string
}

export type SemanticGenerationResumeInput = {
  pendingState: SemanticContractGenerationPendingState
  suppliedValues: SemanticGenerationRequirementValues
}

export type SemanticGenerationFailureCode =
  | 'source_index_failed'
  | 'provider_invocation_failed'
  | 'provider_protocol_invalid'
  | 'provider_auth_failed'
  | 'provider_transport_failed'
  | 'provider_configuration_failed'
  | 'provider_failed'
  | 'provider_timeout'
  | 'semantic_grounding_failed'
  | 'canonical_data_missing'
  | 'execution_failed'
  | 'resume_values_invalid'
  | 'extras_quality_failed'
  | 'docx_quality_failed'

export type SemanticGenerationArtifact = {
  docxBytes: ArrayBuffer
  sourceIdentity: SemanticContractGenerationInput['sourceIdentity']
  generatedAt: string
}

export type SemanticContractGenerationResult =
  | { status: 'COMPLETED'; artifact: SemanticGenerationArtifact }
  | { status: 'REQUIRES_USER_INPUT'; requirements: SemanticGenerationRequirement[]; pendingState: SemanticContractGenerationPendingState }
  | { status: 'TECHNICAL_FAILURE'; code: SemanticGenerationFailureCode; message: string }
  | { status: 'PROVIDER_FAILURE'; code: SemanticGenerationFailureCode; message: string }
  | { status: 'QUALITY_FAILURE'; code: SemanticGenerationFailureCode; message: string }

type IndexedSource = { blocks: TransformDocumentBlock[]; paragraphs: Array<{ blockId: string; paragraphXml: string }> }

async function indexSource(sourceDocxBytes: ArrayBuffer): Promise<IndexedSource> {
  const blocks = await indexDocxForTransform(sourceDocxBytes)
  const zip = await JSZip.loadAsync(sourceDocxBytes)
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) throw new Error('missing_document_xml')
  const xmlParagraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
  const byIndex = new Map(blocks.map((block) => [block.paragraphIndex, block]))
  const paragraphs = xmlParagraphs.flatMap((paragraphXml, paragraphIndex) => {
    const block = byIndex.get(paragraphIndex)
    return block ? [{ blockId: block.blockId, paragraphXml }] : []
  })
  if (paragraphs.length !== blocks.length || paragraphs.some((paragraph, index) =>
    extractCanonicalParagraphText(paragraph.paragraphXml) !== blocks[index]?.text)) {
    throw new Error('source_index_mismatch')
  }
  return { blocks, paragraphs }
}

/** Starts one semantic-map-v7 request and then uses only accepted local components. */
export async function startSemanticContractGeneration(
  input: SemanticContractGenerationInput,
  invokeSemanticMap: SemanticMapProvider,
): Promise<SemanticContractGenerationResult> {
  const customers = input.canonicalDataset.clients.customers
  if (customers.length !== input.canonicalDataset.clients.personCount || customers.some((customer) => !customer.displayName.trim())) {
    return failure('TECHNICAL_FAILURE', 'canonical_data_missing', 'Ordered customer identity data is incomplete.')
  }
  let source: IndexedSource
  try {
    source = await indexSource(input.sourceDocxBytes)
  } catch {
    return failure('TECHNICAL_FAILURE', 'source_index_failed', 'The source contract could not be indexed safely.')
  }

  let extrasTemplateMetadata: SemanticExtrasTemplateMetadata | null = null
  if ((input.canonicalDataset.additionalServices?.length ?? 0) > 0) {
    extrasTemplateMetadata = input.extrasTemplateMetadata ?? null
    if (!extrasTemplateMetadata || !isValidSemanticExtrasTemplateMetadata(extrasTemplateMetadata)) {
      return failure('QUALITY_FAILURE', 'extras_quality_failed', 'Selected additional services could not be placed safely.')
    }
  }

  let providerResult: SemanticMapProviderResult
  try {
    const request = buildSemanticMapRequest({ candidate: input.modelCandidate, sourceBlocks: source.blocks, dataset: input.canonicalDataset, extrasAdmissibleRegion: extrasTemplateMetadata })
    providerResult = await invokeSemanticMap(request)
  } catch (error) {
    if (error instanceof SemanticMapTransportError) {
      const providerFailure = error.failure !== 'PROVIDER_CONFIGURATION_FAILURE'
      const code: SemanticGenerationFailureCode = error.failure === 'AUTH_FAILURE' ? 'provider_auth_failed'
        : error.failure === 'TRANSPORT_FAILURE' ? 'provider_transport_failed'
          : error.failure === 'PROVIDER_CONFIGURATION_FAILURE' ? 'provider_configuration_failed'
            : error.failure === 'PROVIDER_TIMEOUT' ? 'provider_timeout'
              : error.failure === 'PROTOCOL_FAILURE' ? 'provider_protocol_invalid' : 'provider_failed'
      return failure(providerFailure ? 'PROVIDER_FAILURE' : 'TECHNICAL_FAILURE', code,
        providerFailure ? 'Semantic contract analysis did not complete.' : 'Semantic contract analysis is not configured.')
    }
    return failure('PROVIDER_FAILURE', 'provider_invocation_failed', 'Semantic contract analysis did not complete.')
  }

  // The P1 transport supplies the strict parser's successful V7 result. Ground
  // that parsed result directly; the parser intentionally normalizes nullable
  // wire fields and the normalized value is not a wire payload to parse again.
  if (providerResult?.ok !== true || !Array.isArray(providerResult.semanticMappings)) {
    return failure('PROVIDER_FAILURE', 'provider_protocol_invalid', 'Semantic contract analysis returned an invalid response.')
  }
  const grounded = groundParsedSemanticMapResponse(providerResult, source.paragraphs, source.blocks)
  if (!grounded.ok) return failure('TECHNICAL_FAILURE', 'semantic_grounding_failed', 'The semantic response did not ground safely to this source contract.')

  return resolveAndRender({
    sourceDocxBytes: input.sourceDocxBytes,
    sourceIdentity: input.sourceIdentity,
    currentDate: input.currentDate,
    canonicalDataset: input.canonicalDataset,
    sourceBlocks: source.blocks,
    sourceParagraphs: source.paragraphs,
    semanticMappings: grounded.mappings,
    extrasPlacement: providerResult.extrasPlacement ?? null,
    extrasTemplateMetadata,
    requirements: [],
    suppliedValues: {},
  })
}

/** Resume deterministic execution from the already-grounded result; no provider is accepted here. */
export async function resumeSemanticContractGeneration(
  input: SemanticGenerationResumeInput,
): Promise<SemanticContractGenerationResult> {
  const pending = input.pendingState
  const mergedValues = { ...pending.suppliedValues }
  const knownIds = new Set(pending.requirements.map((requirement) => requirement.id))
  for (const [id, value] of Object.entries(input.suppliedValues)) {
    if (!knownIds.has(id) || typeof value !== 'string' || !value.trim()) {
      return failure('TECHNICAL_FAILURE', 'resume_values_invalid', 'One or more supplied values are invalid.')
    }
    mergedValues[id] = value.trim()
  }
  const remaining = pending.requirements.filter((requirement) => !mergedValues[requirement.id])
  if (remaining.length > 0) {
    return {
      status: 'REQUIRES_USER_INPUT',
      requirements: remaining,
      pendingState: { ...pending, suppliedValues: mergedValues },
    }
  }
  return resolveAndRender({ ...pending, requirements: pending.requirements, suppliedValues: mergedValues })
}

async function resolveAndRender(state: SemanticContractGenerationPendingState): Promise<SemanticContractGenerationResult> {
  const dataset = applyGenerationOnlyEmailValues(state.canonicalDataset, state.requirements, state.suppliedValues)
  if (!dataset) return failure('TECHNICAL_FAILURE', 'resume_values_invalid', 'A supplied customer email could not be applied to the generation snapshot.')

  const requirements = new Map(state.requirements.map((item) => [item.id, item]))
  const mappingsToInspect = state.semanticMappings.map((mapping, originalIndex) => ({ mapping, originalIndex }))
  const unresolved = new Map<string, SemanticGenerationRequirement>()
  const missingMappingIndexes = new Set<number>()
  let documentStateId: string | undefined
  let finalExecution: ReturnType<typeof executeSemanticMappings> | undefined

  // The accepted executor reports the first non-date missing canonical value.
  // Re-running over a progressively smaller mapping set deterministically
  // aggregates only the two approved user-resolvable classes.
  let active = [...mappingsToInspect]
  for (let pass = 0; pass <= mappingsToInspect.length; pass++) {
    const dateValues = state.semanticMappings.flatMap((mapping) => {
      if (!isDateMapping(mapping)) return []
      const known = state.requirements.find((item): item is Extract<SemanticGenerationRequirement, { kind: 'date' }> =>
        item.kind === 'date' && item.date.sourceBlockId === mapping.sourceBlockId
        && item.date.span.start === mapping.span.start && item.date.span.end === mapping.span.end)
      const id = known?.id ?? stableDateRequirementId(mapping)
      const value = state.suppliedValues[id]
      return value ? [{ unresolvedDateId: id, value }] : []
    })
    const execution = executeSemanticMappings({
      resolvedMappings: active.map((entry) => entry.mapping),
      canonicalDataset: dataset,
      sourceParagraphs: state.sourceParagraphs,
      sourceCustomerIdentities: dataset.clients.customers?.map((customer) => customer.displayName),
      ...(dateValues.length && state.documentStateId ? { suppliedDateValues: { documentStateId: state.documentStateId, values: dateValues } } : {}),
    })
    if (execution.ok) {
      finalExecution = execution
      break
    }
    if (execution.code === 'requires_user_input') {
      documentStateId = execution.documentStateId
      for (const date of execution.requiresUserInputDates) {
        const id = date.unresolvedDateId
        const requirement: SemanticGenerationRequirement = {
          id,
          kind: 'date',
          valueType: 'DATE',
          label: date.label ?? 'Termin umowny',
          sourceBlockId: date.sourceBlockId,
          date,
        }
        unresolved.set(id, requirement)
        const original = active.find((entry) => entry.mapping.sourceBlockId === date.sourceBlockId
          && entry.mapping.span.start === date.span.start && entry.mapping.span.end === date.span.end)
        if (!original) return failure('TECHNICAL_FAILURE', 'execution_failed', 'A date requirement no longer matches its grounded source span.')
        missingMappingIndexes.add(original.originalIndex)
      }
      active = active.filter((entry) => !missingMappingIndexes.has(entry.originalIndex))
      continue
    }
    if (execution.code === 'missing_canonical_value' && execution.mappingIndex !== undefined) {
      const entry = active[execution.mappingIndex]
      if (!entry) return failure('TECHNICAL_FAILURE', 'execution_failed', 'A canonical value could not be resolved safely.')
      const mapping = entry.mapping
      if (mapping.concept !== 'customer_email') {
        return failure('TECHNICAL_FAILURE', 'canonical_data_missing', 'Required authoritative contract data is unavailable.')
      }
      const ownerIndexes = mapping.customerIndexes ? [...mapping.customerIndexes] : mapping.customerIndex !== undefined ? [mapping.customerIndex] : []
      if (ownerIndexes.length === 0) return failure('TECHNICAL_FAILURE', 'execution_failed', 'Customer email ownership is incomplete.')
      const id = stableEmailRequirementId(ownerIndexes)
      const requirement: SemanticGenerationRequirement = {
        id,
        kind: 'customer_email',
        valueType: 'EMAIL',
        label: ownerIndexes.length === 1 ? `E-mail klienta ${ownerIndexes[0]! + 1}` : 'Wspólny e-mail klientów',
        customerIndexes: ownerIndexes,
        sourceBlockId: mapping.sourceBlockId,
      }
      unresolved.set(id, requirement)
      missingMappingIndexes.add(entry.originalIndex)
      active = active.filter((candidate) => candidate.originalIndex !== entry.originalIndex)
      continue
    }
    return failure('TECHNICAL_FAILURE', 'execution_failed', 'The grounded semantic mappings could not be applied safely.')
  }

  const allRequirements = [...requirements.values(), ...unresolved.values()]
  const missingRequirements = allRequirements.filter((item) => !state.suppliedValues[item.id])
  if (missingRequirements.length > 0) {
    return {
      status: 'REQUIRES_USER_INPUT',
      requirements: missingRequirements,
      pendingState: { ...state, canonicalDataset: dataset, requirements: allRequirements, suppliedValues: state.suppliedValues, ...(documentStateId ? { documentStateId } : {}) },
    }
  }
  if (!finalExecution?.ok) return failure('TECHNICAL_FAILURE', 'execution_failed', 'The grounded semantic mappings could not be applied safely.')

  const transformedBlocks = state.sourceBlocks.map((block) => ({ blockId: block.blockId, text: block.text }))
  let extras: ReturnType<typeof insertAdditionalServicesIntoBlocks>
  try {
    extras = insertAdditionalServicesIntoBlocks({
      blocks: transformedBlocks,
      sourceBlocks: state.sourceBlocks,
      dataset,
      placement: state.extrasPlacement,
      ...(state.extrasTemplateMetadata ? { templateMetadata: state.extrasTemplateMetadata } : {}),
    })
  } catch {
    return failure('QUALITY_FAILURE', 'extras_quality_failed', 'Selected additional services could not be placed safely.')
  }
  if (extras.diagnostics.additionalServicesPlacementFailed || extras.diagnostics.additionalServicesInsertedCount !== (dataset.additionalServices?.length ?? 0)) {
    return failure('QUALITY_FAILURE', 'extras_quality_failed', 'Selected additional services could not be placed safely.')
  }
  try {
    const docxBytes = await writeSemanticMappingDocx({
      sourceBytes: state.sourceDocxBytes,
      sourceBlocks: state.sourceBlocks,
      execution: finalExecution,
      paragraphInsertions: extras.paragraphInsertions,
    })
    if (!await validateSemanticOutput({ state, execution: finalExecution, insertions: extras.paragraphInsertions, outputBytes: docxBytes })) {
      return failure('QUALITY_FAILURE', 'docx_quality_failed', 'The generated document failed structural safety checks.')
    }
    return { status: 'COMPLETED', artifact: { docxBytes, sourceIdentity: state.sourceIdentity, generatedAt: state.currentDate } }
  } catch {
    return failure('QUALITY_FAILURE', 'docx_quality_failed', 'The generated document failed structural safety checks.')
  }
}

/** Non-mutating structural/content check; it never rediscovers semantic targets. */
async function validateSemanticOutput(input: {
  state: SemanticContractGenerationPendingState
  execution: Extract<ReturnType<typeof executeSemanticMappings>, { ok: true }>
  insertions: ReturnType<typeof insertAdditionalServicesIntoBlocks>['paragraphInsertions']
  outputBytes: ArrayBuffer
}): Promise<boolean> {
  const sourceZip = await JSZip.loadAsync(input.state.sourceDocxBytes)
  const outputZip = await JSZip.loadAsync(input.outputBytes)
  const sourceXml = await sourceZip.file('word/document.xml')?.async('string')
  const outputXml = await outputZip.file('word/document.xml')?.async('string')
  if (!sourceXml || !outputXml) return false
  const sourceTableCount = [...sourceXml.matchAll(/<w:tbl\b/g)].length
  const outputTableCount = [...outputXml.matchAll(/<w:tbl\b/g)].length
  if (sourceTableCount !== outputTableCount) return false

  const executedParagraphs = new Map(input.execution.paragraphs.map((paragraph) => [paragraph.blockId, paragraph.paragraphXml]))
  const transformed = input.state.sourceBlocks.map((block) => ({
    blockId: block.blockId,
    text: executedParagraphs.has(block.blockId)
      ? extractCanonicalParagraphText(executedParagraphs.get(block.blockId)!)
      : block.text,
  }))
  const expected = expandBlocksWithParagraphInsertions({
    sourceBlocks: input.state.sourceBlocks,
    blocks: transformed,
    insertions: input.insertions,
  }).map((block) => block.text)
  const actual = [...outputXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => extractCanonicalParagraphText(match[0]!))
  return actual.length === expected.length && actual.every((text, index) => text === expected[index])
}

function applyGenerationOnlyEmailValues(
  dataset: SemanticContractCanonicalDataset,
  requirements: readonly SemanticGenerationRequirement[],
  values: Readonly<Record<string, string>>,
): SemanticContractCanonicalDataset | null {
  const customers = dataset.clients.customers.map((customer) => ({ ...customer }))
  for (const requirement of requirements) {
    if (requirement.kind !== 'customer_email') continue
    const supplied = values[requirement.id]
    if (!supplied?.trim()) continue
    if (!customers || requirement.customerIndexes.some((index) => !customers[index])) return null
    for (const index of requirement.customerIndexes) customers[index] = { ...customers[index]!, email: supplied.trim() }
  }
  return { ...dataset, clients: { ...dataset.clients, customers } }
}

function isDateMapping(mapping: ResolvedSemanticMapping): boolean {
  return mapping.concept === 'ambiguous_date' || mapping.concept === 'fixed_date' || mapping.concept === 'dependent_date'
    || mapping.concept === 'final_payment_due_date' || mapping.concept === 'delivery_due_date' || mapping.concept === 'deposit_due_date'
}

function stableDateRequirementId(mapping: ResolvedSemanticMapping): string {
  const role = 'dateRole' in mapping ? mapping.dateRole ?? '' : mapping.concept
  const relation = 'relation' in mapping ? JSON.stringify(mapping.relation ?? null) : ''
  return ['unresolved-date-v1', encodeURIComponent(mapping.sourceBlockId), `${mapping.span.start}-${mapping.span.end}`,
    encodeURIComponent(mapping.concept), encodeURIComponent(role), encodeURIComponent('baseDateConcept' in mapping ? mapping.baseDateConcept ?? '' : ''),
    encodeURIComponent(relation), String(mapping.occurrence ?? 0)].join(':')
}

function stableEmailRequirementId(ownerIndexes: readonly number[]): string {
  return `customer-email-v1:${[...ownerIndexes].sort().join('-')}`
}

function failure(status: 'TECHNICAL_FAILURE' | 'PROVIDER_FAILURE' | 'QUALITY_FAILURE', code: SemanticGenerationFailureCode, message: string): SemanticContractGenerationResult {
  return { status, code, message }
}
