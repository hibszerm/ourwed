import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { buildContractTransformationDataset } from '../transformationDataset'
import { executeSemanticMappings } from '../semanticMappingExecutor'
import { writeSemanticMappingDocx } from '../docxTransformWriter'
import { extractCanonicalParagraphText } from '../../documents/template/canonicalParagraph'
import { buildGoldenScenarios } from './goldenScenarios'
import { resolveSemanticMappings } from '../semanticMapping'
import { parseSemanticMapResponse } from '../semanticMapModelContract'

const root = process.cwd()
const evidencePath = join(root, 'tmp/golden-contract-validation-run2/EVIDENCE/G03_SEMANTIC_AB/TERRA.json')
const sourcePath = join(root, 'tmp/golden-contract-validation-run2/SOURCE/Golden_03_Long_Photo_Video.docx')
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as {
  semanticMappings: Array<{ sourceBlockId: string; concept: string; anchor: string; occurrence?: number | null; customerIndex?: number; customerIndexes?: number[] | null }>
  mappingGrounding: Array<{ index: number; grounded: boolean; failure?: string }>
}
const previousFailures = evidence.mappingGrounding.filter((entry) => !entry.grounded)
assert.equal(previousFailures.length, 6)
assert.deepEqual(previousFailures.map((entry) => entry.failure), Array(6).fill('anchor_unmappable'))

const rawSource = readFileSync(sourcePath)
const sourceBytes = rawSource.buffer.slice(rawSource.byteOffset, rawSource.byteOffset + rawSource.byteLength)
const indexed = await indexDocxForTransform(sourceBytes)
const zip = await JSZip.loadAsync(sourceBytes)
const documentXml = await zip.file('word/document.xml')!.async('string')
const paragraphXmls = [...documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
// HISTORICAL_CAPTURE is immutable; construct a separate test-only fixture with ownership
// supplied by the ordered G03 CRM customers and the captured source's two customer rows.
assert.equal(evidence.semanticMappings.some((mapping) => mapping.customerIndex !== undefined), false)
const ownerByContactBlock: Record<string, number> = {
  'table-1-row-1-cell-1-p-0': 0,
  'table-1-row-1-cell-2-p-0': 0,
  'table-1-row-2-cell-1-p-0': 1,
  'table-1-row-2-cell-2-p-0': 1,
}
const ownershipAugmentedOfflineFixture = {
  semanticMappings: evidence.semanticMappings.map((mapping) => ({
    sourceBlockId: mapping.sourceBlockId,
    concept: mapping.concept,
    anchor: mapping.anchor,
    occurrence: mapping.occurrence ?? null,
    customerIndex: Object.hasOwn(ownerByContactBlock, mapping.sourceBlockId)
      ? ownerByContactBlock[mapping.sourceBlockId]!
      : null,
    customerIndexes: null,
    nameForm: mapping.concept === 'customer_1_name' || mapping.concept === 'customer_2_name'
      ? (mapping.anchor === 'Maja Przykładowa' || mapping.anchor === 'Kacper Modelowy' ? 'BASE' : 'INSTRUMENTAL')
      : null,
  })),
}
const response = ownershipAugmentedOfflineFixture
const parsed = parseSemanticMapResponse(response)
assert.equal(parsed.ok, true, 'captured provider-shaped mappings parse unchanged')
if (!parsed.ok) throw new Error('captured G03 semantic mappings did not parse')

const sourceParagraphs = indexed.map(({ blockId, paragraphIndex }) => ({ blockId, paragraphXml: paragraphXmls[paragraphIndex]! }))
const resolved = resolveSemanticMappings({ mappings: parsed.semanticMappings, sourceBlocks: sourceParagraphs })
assert.equal(resolved.ok, true, 'all captured G03 mappings ground after internal w:br support')
if (!resolved.ok) throw new Error(`captured G03 mappings failed grounding: ${resolved.code}`)
assert.equal(resolved.mappings.length, evidence.semanticMappings.length)
assert.equal(previousFailures.filter((entry) =>
  resolved.mappings[entry.index]?.sourceBlockId === evidence.semanticMappings[entry.index]?.sourceBlockId,
).length, 6)

const scenario = buildGoldenScenarios().find((item) => item.caseId === 'G03')!
const canonicalDataset = buildContractTransformationDataset({
  wedding: scenario.wedding,
  package: scenario.package,
  extras: scenario.extras,
  currentDate: '2026-11-05',
})
assert.deepEqual(canonicalDataset.clients.customers?.map((customer) => customer.displayName), ['Natalia Brzegowa', 'Filip Brzegowy'])
assert.equal(resolved.mappings[3]?.concept, 'customer_2_name')
assert.equal(resolved.mappings[3]?.anchor, 'Kacprem Modelowym')
assert.equal(resolved.mappings[2]?.nameForm, 'INSTRUMENTAL')
assert.equal(resolved.mappings[3]?.nameForm, 'INSTRUMENTAL')
const sourceCustomerIdentities = ['Maja Przykładowa', 'Kacper Modelowy']
const knownKacperExecution = executeSemanticMappings({
  resolvedMappings: [resolved.mappings[3]!],
  canonicalDataset,
  sourceParagraphs,
  sourceCustomerIdentities,
})
assert.equal(knownKacperExecution.ok, false)
if (!knownKacperExecution.ok) assert.equal(knownKacperExecution.code, 'unsupported_name_form', 'Kacprem Modelowym remains blocked without an approved instrumental variant')
const fullExecution = executeSemanticMappings({ resolvedMappings: resolved.mappings, canonicalDataset, sourceParagraphs, sourceCustomerIdentities })
assert.equal(fullExecution.ok, false, 'full G03 remains fail-closed at the unrelated known name limitation')
if (!fullExecution.ok) {
  assert.equal(fullExecution.code, 'unsupported_name_form')
  assert.equal(fullExecution.mappingIndex, 2)
}

const exactNameMappings = resolved.mappings.filter((mapping) =>
  (mapping.concept === 'customer_1_name' || mapping.concept === 'customer_2_name') &&
  mapping.nameForm === 'BASE' && sourceCustomerIdentities.includes(mapping.anchor),
)
assert.equal(exactNameMappings.length, 4, 'the four exact G03 table/signature names are selected')
const exactNameExecution = executeSemanticMappings({
  resolvedMappings: exactNameMappings,
  canonicalDataset,
  sourceParagraphs,
  sourceCustomerIdentities,
})
assert.equal(exactNameExecution.ok, true, 'the four exact G03 customer names render deterministically')
if (!exactNameExecution.ok) throw new Error(`G03 exact names failed: ${exactNameExecution.code}`)
for (const edit of exactNameExecution.spanEdits) {
  const mapping = exactNameMappings.find((item) => item.sourceBlockId === edit.blockId && item.span.start === edit.span.start)!
  const expected = mapping.concept === 'customer_1_name' ? 'Natalia Brzegowa' : 'Filip Brzegowy'
  assert.equal(edit.replacement, expected, 'exact G03 name uses its CRM-owned identity')
}

// Scoped ownership proof: keep the historical capture unchanged and execute only the
// four contact claims with ownership added by this test fixture.
const contactBlockIds = Object.keys(ownerByContactBlock)
const contactMappings = parsed.semanticMappings.filter((mapping) => contactBlockIds.includes(mapping.sourceBlockId))
assert.equal(contactMappings.length, 4)
const contactGrounding = resolveSemanticMappings({ mappings: contactMappings, sourceBlocks: sourceParagraphs })
assert.equal(contactGrounding.ok, true, 'all four G03 customer contacts ground')
if (!contactGrounding.ok) throw new Error(`G03 contact grounding failed: ${contactGrounding.code}`)
assert.deepEqual(contactGrounding.mappings.map((mapping) => [mapping.concept, mapping.customerIndex]), [
  ['customer_address', 0], ['customer_phone', 0], ['customer_address', 1], ['customer_phone', 1],
])
const contactExecution = executeSemanticMappings({ resolvedMappings: contactGrounding.mappings, canonicalDataset, sourceParagraphs })
assert.equal(contactExecution.ok, true, contactExecution.ok ? '' : `G03 contact execution failed: ${contactExecution.code}`)
if (!contactExecution.ok) throw new Error(`G03 contact execution failed: ${contactExecution.code}`)
const outputBytes = await writeSemanticMappingDocx({ sourceBytes, sourceBlocks: indexed, execution: contactExecution })
const outZip = await JSZip.loadAsync(outputBytes)
const outputXml = await outZip.file('word/document.xml')!.async('string')
const outputParagraphs = [...outputXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
const outputByIndex = new Map(indexed.map((block) => [block.paragraphIndex, extractCanonicalParagraphText(outputParagraphs[block.paragraphIndex]!) ]))
const mappedBlockIds = new Set(contactGrounding.mappings.map((mapping) => mapping.sourceBlockId))
for (const block of indexed) {
  if (!mappedBlockIds.has(block.blockId)) assert.equal(outputParagraphs[block.paragraphIndex], paragraphXmls[block.paragraphIndex], `unmapped source remains unchanged: ${block.blockId}`)
}
const visibleBlock = (blockId: string) => outputByIndex.get(indexed.find((block) => block.blockId === blockId)!.paragraphIndex)!
const c1Address = canonicalDataset.clients.customers![0]!.address!
const c1Phone = canonicalDataset.clients.customers![0]!.phone!
const c2Address = canonicalDataset.clients.customers![1]!.address!
const c2Phone = canonicalDataset.clients.customers![1]!.phone!
assert.equal(visibleBlock('table-1-row-1-cell-1-p-0'), c1Address, 'customer 1 address comes only from customerIndex 0')
assert.equal(visibleBlock('table-1-row-2-cell-1-p-0'), c2Address, 'customer 2 address comes only from customerIndex 1')
const expectedSurfaceReplacement = (blockId: string, canonicalValue: string) => {
  const mapping = contactGrounding.mappings.find((item) => item.sourceBlockId === blockId)!
  const sourceText = indexed.find((block) => block.blockId === blockId)!.text
  return sourceText.slice(0, mapping.span.start) + canonicalValue + sourceText.slice(mapping.span.end)
}
assert.equal(visibleBlock('table-1-row-1-cell-2-p-0'), expectedSurfaceReplacement('table-1-row-1-cell-2-p-0', c1Phone), 'customer 1 phone comes only from customerIndex 0; adjacent source email remains')
assert.equal(visibleBlock('table-1-row-2-cell-2-p-0'), expectedSurfaceReplacement('table-1-row-2-cell-2-p-0', c2Phone), 'customer 2 phone comes only from customerIndex 1; adjacent source email remains')
assert(!visibleBlock('table-1-row-1-cell-1-p-0').includes(c2Address) && !visibleBlock('table-1-row-1-cell-2-p-0').includes(c2Phone), 'customer 2 values did not enter customer 1 surfaces')
assert(!visibleBlock('table-1-row-2-cell-1-p-0').includes(c1Address) && !visibleBlock('table-1-row-2-cell-2-p-0').includes(c1Phone), 'customer 1 values did not enter customer 2 surfaces')
for (const mapping of contactGrounding.mappings.filter((item) => item.concept === 'customer_address')) {
  const paragraphIndex = indexed.find((block) => block.blockId === mapping.sourceBlockId)!.paragraphIndex
  assert(paragraphXmls[paragraphIndex]!.includes('<w:br/>'), 'G03 source address crosses internal w:br')
  assert(!outputParagraphs[paragraphIndex]!.includes('<w:br/>'), 'grounded internal address w:br consumed')
  assert(!visibleBlock(mapping.sourceBlockId).includes(mapping.anchor), 'old source address removed')
}
for (const mapping of contactGrounding.mappings.filter((item) => item.concept === 'customer_phone')) {
  assert(!visibleBlock(mapping.sourceBlockId).includes(mapping.anchor), 'old source phone removed')
}
for (const tag of ['w:tbl', 'w:tr', 'w:tc']) {
  const countTags = (xml: string) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s|>)`, 'g'))].length
  assert.equal(countTags(outputXml), countTags(documentXml), `${tag} structure preserved`)
}
console.log('PASS G03 scoped contact ownership and exact-name replay; full G03 remains blocked by unresolved instrumental name forms')
