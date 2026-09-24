/**
 * Local architecture spike: execute an already-adjudicated binding manifest.
 * This module is not wired into the application generation route.
 */

import JSZip from 'jszip'
import { extractCanonicalParagraphText } from '@/features/documents/template/canonicalParagraph'
import { applyDocxParagraphInsertions } from '@/features/documents/template/docxParagraphEditor'
import { sha256Source } from './semanticExtrasTemplateMetadata'
import { executeSemanticMappings, type CustomerNameFormResolution } from './semanticMappingExecutor'
import { indexDocxForTransform } from './indexDocxForTransform'
import type { ContractTransformationDataset, TransformDocumentBlock } from './types'
import type { ResolvedSemanticMapping, SemanticConcept } from './semanticMapping'
import { writeSemanticMappingDocx } from './docxTransformWriter'
import { renderLocationSummary } from './quality/locationRendering'

export type CompiledTemplateSpikeBinding = {
  id: string
  concept: SemanticConcept
  sourceBlockId: string
  span: { start: number; end: number }
  sourceSampleText: string
  required: boolean
  customerIndex?: 0 | 1
  nameForm?: 'BASE' | 'GENITIVE' | 'INSTRUMENTAL'
  grammaticalIntent?: string
  localContext?: string
}

export type CompiledTemplateSpikeManifest = {
  schemaVersion: 1
  templateVersionId: string
  sourceSha256: string
  bindings: CompiledTemplateSpikeBinding[]
  extras?: {
    anchorBlockId: string
    side: 'before' | 'after'
    styleExemplarBlockId: string
    signatureBoundaryBlockId: string
  }
}

export type CompiledTemplateSpikeRenderer = {
  personName?: (input: {
    canonicalValue: string
    grammaticalForm: 'GENITIVE' | 'INSTRUMENTAL'
    localContext?: string
  }) => CustomerNameFormResolution
  placeName?: (input: {
    concept: 'preparation_location' | 'ceremony_location' | 'reception_location'
    canonicalValue: string
    grammaticalIntent: string
    localContext?: string
  }) => { status: 'RENDERED'; value: string } | { status: 'UNRESOLVED' }
}

export type CompiledTemplateSpikeResult =
  | { status: 'COMPLETED'; docxBytes: ArrayBuffer; bindingReceipts: Array<{ id: string; replacement: string }> }
  | { status: 'UNRESOLVED'; bindingIds: string[]; reason: string }
  | { status: 'FAILED'; reason: string }

type IndexedSource = {
  blocks: TransformDocumentBlock[]
  paragraphs: Array<{ blockId: string; paragraphXml: string }>
  documentXml: string
}

/** Hash and template-version binding use the same source-hash implementation as stored extras metadata. */
export async function createCompiledTemplateSpikeManifest(input: {
  sourceBytes: ArrayBuffer
  templateVersionId: string
  bindings: CompiledTemplateSpikeBinding[]
  extras?: CompiledTemplateSpikeManifest['extras']
}): Promise<CompiledTemplateSpikeManifest> {
  return {
    schemaVersion: 1,
    templateVersionId: input.templateVersionId,
    sourceSha256: await sha256Source(input.sourceBytes),
    bindings: input.bindings.map((binding) => ({ ...binding, span: { ...binding.span } })),
    ...(input.extras ? { extras: { ...input.extras } } : {}),
  }
}

/** Deterministic execution: this path never accepts or invokes a semantic mapper/provider. */
export async function executeCompiledTemplateSpike(input: {
  sourceBytes: ArrayBuffer
  expectedTemplateVersionId: string
  manifest: CompiledTemplateSpikeManifest
  canonicalDataset: ContractTransformationDataset
  renderers?: CompiledTemplateSpikeRenderer
}): Promise<CompiledTemplateSpikeResult> {
  if (input.manifest.schemaVersion !== 1
    || input.manifest.templateVersionId !== input.expectedTemplateVersionId) {
    return { status: 'FAILED', reason: 'template_version_mismatch' }
  }
  if (input.manifest.sourceSha256 !== await sha256Source(input.sourceBytes)) {
    return { status: 'FAILED', reason: 'template_fingerprint_mismatch' }
  }
  if (!Array.isArray(input.manifest.bindings) || input.manifest.bindings.length === 0) {
    return { status: 'FAILED', reason: 'manifest_bindings_missing' }
  }
  const ids = input.manifest.bindings.map((binding) => binding.id)
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    return { status: 'FAILED', reason: 'manifest_binding_ids_invalid' }
  }

  let source: IndexedSource
  try {
    source = await indexSource(input.sourceBytes)
  } catch {
    return { status: 'FAILED', reason: 'source_index_failed' }
  }
  const blockById = new Map(source.blocks.map((block) => [block.blockId, block]))
  for (const binding of input.manifest.bindings) {
    const block = blockById.get(binding.sourceBlockId)
    if (!block || !Number.isSafeInteger(binding.span.start) || !Number.isSafeInteger(binding.span.end)
      || binding.span.start < 0 || binding.span.end <= binding.span.start
      || block.text.slice(binding.span.start, binding.span.end) !== binding.sourceSampleText) {
      return { status: 'FAILED', reason: 'manifest_binding_source_mismatch' }
    }
    if (binding.required && !binding.sourceSampleText.trim()) {
      return { status: 'FAILED', reason: 'required_binding_sample_empty' }
    }
  }

  const unresolved: string[] = []
  const nameFormValues = new Map<string, string>()
  let dataset = input.canonicalDataset
  const locations = { ...dataset.locations }
  let locationsChanged = false
  for (const binding of input.manifest.bindings) {
    if (binding.concept === 'customer_1_name' || binding.concept === 'customer_2_name') {
      const form = binding.nameForm
      const index = binding.concept === 'customer_1_name' ? 0 : 1
      const canonicalValue = canonicalCustomerName(dataset, index)
      if (!canonicalValue) {
        if (binding.required) unresolved.push(binding.id)
        continue
      }
      if (form === 'BASE') {
        nameFormValues.set(binding.id, canonicalValue)
      } else if (form === 'GENITIVE' || form === 'INSTRUMENTAL') {
        const result = input.renderers?.personName?.({ canonicalValue, grammaticalForm: form, localContext: binding.localContext })
        if (result?.status === 'RESOLVED' && result.value.trim()) nameFormValues.set(binding.id, result.value.trim())
        else if (binding.required) unresolved.push(binding.id)
      } else if (binding.required) {
        unresolved.push(binding.id)
      }
    }

    if (isPlaceConcept(binding.concept)) {
      const location = locations[binding.concept === 'preparation_location' ? 'preparation'
        : binding.concept === 'ceremony_location' ? 'ceremony' : 'reception']
      const canonicalValue = location?.target?.text ?? (location ? renderLocationSummary(location) : '')
      if (!canonicalValue) {
        if (binding.required) unresolved.push(binding.id)
        continue
      }
      if (binding.grammaticalIntent) {
        const result = input.renderers?.placeName?.({
          concept: binding.concept,
          canonicalValue,
          grammaticalIntent: binding.grammaticalIntent,
          localContext: binding.localContext,
        })
        if (result?.status === 'RENDERED' && result.value.trim()) {
          const renderedLocation = { ...location!, target: { text: result.value.trim(), segments: [result.value.trim()] } }
          if (binding.concept === 'preparation_location') locations.preparation = renderedLocation
          else if (binding.concept === 'ceremony_location') locations.ceremony = renderedLocation
          else locations.reception = renderedLocation
          locationsChanged = true
        } else if (binding.required) unresolved.push(binding.id)
      }
    }
  }
  if (unresolved.length) return { status: 'UNRESOLVED', bindingIds: unresolved, reason: 'required_linguistic_rendering_unresolved' }
  if (locationsChanged) dataset = { ...dataset, locations }

  const mappings = input.manifest.bindings.map(toResolvedMapping)
  const nameBindingsByKey = new Map<string, string[]>()
  for (const binding of input.manifest.bindings) {
    if (binding.concept !== 'customer_1_name' && binding.concept !== 'customer_2_name') continue
    const index = binding.concept === 'customer_1_name' ? 0 : 1
    const canonical = canonicalCustomerName(dataset, index)
    const form = binding.nameForm
    if (canonical && (form === 'GENITIVE' || form === 'INSTRUMENTAL')) {
      const key = `${canonical}\u0000${form}`
      nameBindingsByKey.set(key, [...(nameBindingsByKey.get(key) ?? []), binding.id])
    }
  }
  const execution = executeSemanticMappings({
    resolvedMappings: mappings,
    canonicalDataset: dataset,
    sourceParagraphs: source.paragraphs,
    customerNameFormResolver: ({ canonicalIdentity, nameForm }) => {
      const key = `${canonicalIdentity}\u0000${nameForm}`
      const bindingId = nameBindingsByKey.get(key)?.find((id) => nameFormValues.has(id))
      const value = bindingId ? nameFormValues.get(bindingId) : undefined
      return value ? { status: 'RESOLVED', value } : { status: 'UNSUPPORTED' }
    },
  })
  if (!execution.ok) return { status: 'FAILED', reason: `executor_${execution.code}` }
  if (execution.spanEdits.length !== input.manifest.bindings.length) {
    return { status: 'FAILED', reason: 'binding_execution_count_mismatch' }
  }

  const receipts = input.manifest.bindings.map((binding) => {
    const edit = execution.spanEdits.find((item) => item.blockId === binding.sourceBlockId
      && item.span.start === binding.span.start
      && (item.span.end === binding.span.end
        || (binding.concept === 'total_words' || binding.concept === 'deposit_words' || binding.concept === 'remaining_words')
          && item.span.end < binding.span.end))
    return edit ? { id: binding.id, replacement: edit.replacement } : null
  })
  if (receipts.some((receipt) => receipt === null)) return { status: 'FAILED', reason: 'binding_execution_receipt_missing' }

  let editedBytes: ArrayBuffer
  try {
    editedBytes = await writeSemanticMappingDocx({ sourceBytes: input.sourceBytes, sourceBlocks: source.blocks, execution })
    if (input.manifest.extras) editedBytes = await insertCompiledExtras({
      bytes: editedBytes,
      sourceBlocks: source.blocks,
      extras: dataset.additionalServices ?? [],
      structure: input.manifest.extras,
    })
  } catch {
    return { status: 'FAILED', reason: 'docx_write_failed' }
  }

  try {
    const output = await indexSource(editedBytes)
    const expected = expectedParagraphTexts(source.blocks, execution.spanEdits)
    if (input.manifest.extras) {
      const { anchorBlockId, side } = input.manifest.extras
      const anchor = blockById.get(anchorBlockId)!
      const inserted = (dataset.additionalServices ?? []).map((extra) => extra.name)
      const insertionIndex = anchor.paragraphIndex + (side === 'after' ? 1 : 0)
      expected.splice(insertionIndex, 0, ...inserted)
    }
    const actual = output.blocks.map((block) => block.text)
    if (actual.length !== expected.length || actual.some((text, index) => text !== expected[index])) {
      return { status: 'FAILED', reason: 'output_content_validation_failed' }
    }
    if (!hasSameTableStructure(source.documentXml, output.documentXml)) {
      return { status: 'FAILED', reason: 'output_structure_validation_failed' }
    }
    for (const block of source.blocks) {
      if (input.manifest.bindings.some((binding) => binding.sourceBlockId === block.blockId)) continue
      const paragraphXml = source.paragraphs.find((paragraph) => paragraph.blockId === block.blockId)?.paragraphXml
      if (paragraphXml && !output.documentXml.includes(paragraphXml)) {
        return { status: 'FAILED', reason: 'unbound_source_paragraph_changed' }
      }
    }
  } catch {
    return { status: 'FAILED', reason: 'output_reopen_failed' }
  }

  return { status: 'COMPLETED', docxBytes: editedBytes, bindingReceipts: receipts as Array<{ id: string; replacement: string }> }
}

function toResolvedMapping(binding: CompiledTemplateSpikeBinding): ResolvedSemanticMapping {
  return {
    sourceBlockId: binding.sourceBlockId,
    concept: binding.concept,
    anchor: binding.sourceSampleText,
    occurrence: 0,
    span: { ...binding.span },
    ...(binding.concept === 'customer_1_name' || binding.concept === 'customer_2_name'
      ? { nameForm: binding.nameForm ?? 'BASE' }
      : binding.customerIndex !== undefined ? { customerIndex: binding.customerIndex } : {}),
  } as ResolvedSemanticMapping
}

function isPlaceConcept(concept: SemanticConcept): concept is 'preparation_location' | 'ceremony_location' | 'reception_location' {
  return concept === 'preparation_location' || concept === 'ceremony_location' || concept === 'reception_location'
}

function canonicalCustomerName(dataset: ContractTransformationDataset, index: number): string {
  const structured = dataset.clients.customers?.[index]?.displayName?.trim()
  if (structured) return structured
  return dataset.clients.displayNames.trim().split(/\s+i\s+|\s+oraz\s+|,\s*/i).filter(Boolean)[index]?.trim() ?? ''
}

async function indexSource(bytes: ArrayBuffer): Promise<IndexedSource> {
  const blocks = await indexDocxForTransform(bytes)
  const zip = await JSZip.loadAsync(bytes)
  const documentXml = await zip.file('word/document.xml')?.async('string')
  if (!documentXml) throw new Error('missing_document_xml')
  const paragraphs = [...documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
  const indexedParagraphs = blocks.map((block) => {
    const paragraphXml = paragraphs[block.paragraphIndex]
    if (!paragraphXml || extractCanonicalParagraphText(paragraphXml) !== block.text) throw new Error('source_index_mismatch')
    return { blockId: block.blockId, paragraphXml }
  })
  return { blocks, paragraphs: indexedParagraphs, documentXml }
}

async function insertCompiledExtras(input: {
  bytes: ArrayBuffer
  sourceBlocks: readonly TransformDocumentBlock[]
  extras: readonly { name: string }[]
  structure: NonNullable<CompiledTemplateSpikeManifest['extras']>
}): Promise<ArrayBuffer> {
  if (!input.extras.length) return input.bytes
  const byId = new Map(input.sourceBlocks.map((block) => [block.blockId, block]))
  const anchor = byId.get(input.structure.anchorBlockId)
  const exemplar = byId.get(input.structure.styleExemplarBlockId)
  const signature = byId.get(input.structure.signatureBoundaryBlockId)
  if (!anchor || anchor.kind !== 'paragraph' || !exemplar || exemplar.kind !== 'paragraph'
    || !signature || signature.kind !== 'paragraph') throw new Error('compiled_extras_anchor_missing')
  const insertionBoundary = anchor.paragraphIndex + (input.structure.side === 'after' ? 1 : 0)
  if (insertionBoundary > signature.paragraphIndex) throw new Error('compiled_extras_after_signature')
  return applyDocxParagraphInsertions(input.bytes, [{
    afterIndex: anchor.paragraphIndex,
    ...(input.structure.side === 'before' ? { beforeIndex: anchor.paragraphIndex } : {}),
    paragraphs: input.extras.map((extra) => extra.name),
    listNumbering: 'detach',
    presentation: 'inherit',
    styleExemplarIndex: exemplar.paragraphIndex,
  }])
}

function expectedParagraphTexts(
  blocks: readonly TransformDocumentBlock[],
  edits: readonly { blockId: string; span: { start: number; end: number }; replacement: string }[],
): string[] {
  return blocks.map((block) => {
    const relevant = edits.filter((edit) => edit.blockId === block.blockId).sort((a, b) => b.span.start - a.span.start)
    return relevant.reduce((text, edit) => text.slice(0, edit.span.start) + edit.replacement + text.slice(edit.span.end), block.text)
  })
}

function hasSameTableStructure(before: string, after: string): boolean {
  const counts = (xml: string) => ['tbl', 'tr', 'tc'].map((tag) => [...xml.matchAll(new RegExp(`<w:${tag}(?:\\s|>)`, 'g'))].length)
  return counts(before).every((count, index) => count === counts(after)[index])
}
