import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { extractCanonicalParagraphText } from '../../documents/template/canonicalParagraph'
import { buildContractTransformationDataset } from '../transformationDataset'
import { executeSemanticMappings } from '../semanticMappingExecutor'
import { parseLegacySemanticMapResponse as parseSemanticMapResponse } from '../semanticMapModelContract'
import { resolveSemanticMappings } from '../semanticMapping'
import { indexDocxForTransform } from '../indexDocxForTransform'
import { writeSemanticMappingDocx } from '../docxTransformWriter'
import { buildGoldenScenarios } from './goldenScenarios'

const root = process.cwd()
const evidence = JSON.parse(readFileSync(join(root, 'tmp/golden-contract-validation-run2/EVIDENCE/SEMANTIC_MAP_TERRA_FINAL_CONTRACT/G06.json'), 'utf8')) as {
  parsedMappings: Array<{
    sourceBlockId: string
    concept: string
    anchor: string
    occurrence: number | null
    customerIndex: number | null
    customerIndexes: number[] | null
    nameForm: 'BASE' | 'GENITIVE' | 'INSTRUMENTAL' | null
  }>
  groundingResult: { groundedMappings: Array<{
    sourceBlockId: string
    concept: string
    anchor: string
    occurrence: number
    customerIndex: number | null
    customerIndexes: number[] | null
    nameForm: 'BASE' | 'GENITIVE' | 'INSTRUMENTAL' | null
    span: { start: number; end: number }
  }> }
}
const sourceBytesRaw = readFileSync(join(root, 'tmp/golden-contract-validation-run2/SOURCE/Golden_06_Minimal_Contemporary.docx'))
const sourceBytes = sourceBytesRaw.buffer.slice(sourceBytesRaw.byteOffset, sourceBytesRaw.byteOffset + sourceBytesRaw.byteLength)
const indexed = await indexDocxForTransform(sourceBytes)
const sourceZip = await JSZip.loadAsync(sourceBytes)
const sourceXml = await sourceZip.file('word/document.xml')!.async('string')
const sourceParagraphsXml = [...sourceXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
const sourceParagraphs = indexed.map(({ blockId, paragraphIndex }) => ({ blockId, paragraphXml: sourceParagraphsXml[paragraphIndex]! }))
const sharedContacts = evidence.parsedMappings.filter((mapping) =>
  (mapping.concept === 'customer_phone' || mapping.concept === 'customer_address') && mapping.customerIndexes?.length === 2,
)
assert.equal(sharedContacts.length, 2, 'captured final semantic map contains shared address and phone mappings')
const parsed = parseSemanticMapResponse({ semanticMappings: sharedContacts })
assert.equal(parsed.ok, true, 'captured shared contact claims satisfy current semantic schema')
if (!parsed.ok) throw new Error(`G06 contact parse failed: ${parsed.code}`)
const grounded = resolveSemanticMappings({ mappings: parsed.semanticMappings, sourceBlocks: sourceParagraphs })
assert.equal(grounded.ok, true, 'captured shared contact mappings ground in the G06 source')
if (!grounded.ok) throw new Error(`G06 contact grounding failed: ${grounded.code}`)
const scenario = buildGoldenScenarios().find((item) => item.caseId === 'G06')!
const canonicalDataset = buildContractTransformationDataset({ wedding: scenario.wedding, package: scenario.package, extras: scenario.extras, currentDate: '2026-11-05' })
const executed = executeSemanticMappings({ resolvedMappings: grounded.mappings, canonicalDataset, sourceParagraphs })
assert.equal(executed.ok, true, 'G06 captured shared address and phone both execute')
if (!executed.ok) throw new Error(`G06 contact execution failed: ${executed.code}`)
const outBytes = await writeSemanticMappingDocx({ sourceBytes, sourceBlocks: indexed, execution: executed })
const outZip = await JSZip.loadAsync(outBytes)
const outXml = await outZip.file('word/document.xml')!.async('string')
const outputParagraphs = [...outXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
const outputText = (blockId: string) => {
  const paragraphIndex = indexed.find((block) => block.blockId === blockId)!.paragraphIndex
  return extractCanonicalParagraphText(outputParagraphs[paragraphIndex]!)
}
const phone = canonicalDataset.clients.customers![0]!.phone!
const phoneBlockId = sharedContacts.find((mapping) => mapping.concept === 'customer_phone')!.sourceBlockId
assert.equal(outputText(phoneBlockId).split(phone).length - 1, 1, 'one G06 template phone surface receives customer 0 phone exactly once')
assert(!outputText(phoneBlockId).includes(canonicalDataset.clients.customers![1]!.phone!), 'second customer phone is not combined into the single surface')
const addressBlockId = sharedContacts.find((mapping) => mapping.concept === 'customer_address')!.sourceBlockId
const expectedAddress = canonicalDataset.clients.customers![0]!.address!
assert.equal(outputText(addressBlockId).split(expectedAddress).length - 1, 1, 'shared address behavior remains executable once')
console.log('PASS captured G06 shared contact semantic-map replay')
