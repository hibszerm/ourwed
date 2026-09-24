import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { blocksFromPlainParagraphs } from './indexDocxForTransform'
import { insertAdditionalServicesIntoBlocks } from './insertAdditionalServices'
import { expandBlocksWithParagraphInsertions } from './expandBlocksWithInsertions'
import { resolveSemanticExtrasPlacement } from './semanticExtrasPlacement'
import {
  createStoredSemanticExtrasTemplateMetadata,
  getGoldenSemanticExtrasTemplateMetadataSeedForTest,
  isValidSemanticExtrasTemplateMetadata,
  resolveGoldenSemanticExtrasTemplateMetadataSeed,
  resolveStoredSemanticExtrasTemplateMetadata,
  withStoredSemanticExtrasTemplateMetadata,
} from './semanticExtrasTemplateMetadata'
import { writeTransformedDocx } from './docxTransformWriter'
import { buildSemanticMapResponseSchema, parseSemanticMapResponse, SEMANTIC_MAP_SYSTEM_PROMPT } from './semanticMapModelContract'
import type { ContractTransformationDataset, TransformDocumentBlock } from './types'

const dataset = { additionalServices: [{ name: 'sesja narzeczeńska' }, { name: 'album rodzinny' }] } as ContractTransformationDataset
const source = blocksFromPlainParagraphs(['8 Usługi dodatkowe', '8.1 SOURCE catalog: 1200 zł', '8.2 SOURCE clause'])
const identity = (blocks: TransformDocumentBlock[]) => blocks.map((block) => ({ blockId: block.blockId, text: block.text }))
const insert = (blocks: TransformDocumentBlock[], placement?: { sourceBlockId: string; side: 'before' | 'after' }) =>
  insertAdditionalServicesIntoBlocks({ blocks: identity(blocks), sourceBlocks: blocks, dataset, placement })

const schema = buildSemanticMapResponseSchema()
assert.deepEqual(schema.schema.required, ['semanticMappings', 'extrasPlacement'])
for (const variant of schema.schema.properties.semanticMappings.items.anyOf) assert(variant.required.includes('rendering'))
assert.match(SEMANTIC_MAP_SYSTEM_PROMPT, /standalone additional-services block/)
assert.deepEqual(parseSemanticMapResponse({ semanticMappings: [], extrasPlacement: { sourceBlockId: 'para-0', side: 'after' } }), {
  ok: true, semanticMappings: [], extrasPlacement: { sourceBlockId: 'para-0', side: 'after' },
})
assert.deepEqual(parseSemanticMapResponse({ semanticMappings: [], extrasPlacement: { sourceBlockId: 'para-0', side: 'inside' } }), { ok: true, semanticMappings: [], extrasPlacement: null })
assert.deepEqual(parseSemanticMapResponse({ semanticMappings: [], extrasPlacement: { sourceBlockId: 'para-0', side: 'after', text: 'secret' } }), { ok: true, semanticMappings: [], extrasPlacement: null })

const selected = insert(source, { sourceBlockId: 'para-0', side: 'after' })
assert.equal(selected.placement?.mode, 'model')
assert.equal(selected.placement?.sourceBlockId, 'para-0')
assert.deepEqual(selected.blocks, identity(source), 'heading and SOURCE catalog remain untouched')
assert.equal(selected.paragraphInsertions[0]?.afterParagraphIndex, 0)
assert.equal(selected.paragraphInsertions[0]?.paragraphs.length, 3)
assert.ok(selected.paragraphInsertions[0]!.paragraphs[0]!.includes('zakres umowy obejmuje'))
assert.equal(selected.paragraphInsertions[0]!.paragraphs.join(' ').includes('Zamawiający'), false, 'neutral intro does not invent a party role')
assert.equal(selected.paragraphInsertions[0]?.paragraphs.join('\n').includes('1200 zł'), false)
assert.equal(selected.paragraphInsertions[0]?.paragraphs.join('\n').includes('unselected extra'), false)
for (const name of dataset.additionalServices!) {
  assert.equal(selected.paragraphInsertions[0]!.paragraphs.join('\n').split(name.name).length - 1, 1)
}
const expanded = expandBlocksWithParagraphInsertions({ sourceBlocks: source, blocks: selected.blocks, insertions: selected.paragraphInsertions })
assert.equal(expanded[0]?.text, '8 Usługi dodatkowe')
assert.equal(expanded[1]?.text.startsWith('Ponadto'), true)
assert.equal(expanded[4]?.text, '8.1 SOURCE catalog: 1200 zł')

const numbered = blocksFromPlainParagraphs(['§ 5 Payment', '1. Honorarium', '2. Payment', '3. Remaining', '§ 6 Delivery'])
assert.equal(resolveSemanticExtrasPlacement(numbered, { sourceBlockId: 'para-1', side: 'after' }).mode, 'structural_fallback')
assert.equal(resolveSemanticExtrasPlacement(numbered, { sourceBlockId: 'para-2', side: 'before' }).mode, 'structural_fallback')
const wordNumbered = blocksFromPlainParagraphs(['Clause one', 'Clause two']).map((block) => ({ ...block, numberingKey: '9:0' }))
assert.equal(resolveSemanticExtrasPlacement(wordNumbered, { sourceBlockId: 'para-0', side: 'after' }).mode, 'structural_fallback')

const table: TransformDocumentBlock[] = [
  { blockId: 'para-0', paragraphIndex: 0, kind: 'paragraph', text: 'Team' },
  { blockId: 'table-0-row-0-cell-0-p-0', paragraphIndex: 1, kind: 'tableCell', text: 'Role' },
  { blockId: 'para-2', paragraphIndex: 2, kind: 'paragraph', text: 'Later body' },
]
assert.equal(resolveSemanticExtrasPlacement(table, { sourceBlockId: table[1]!.blockId, side: 'after' }).mode, 'structural_fallback')
assert.equal(resolveSemanticExtrasPlacement(table, { sourceBlockId: 'para-0', side: 'after' }).mode, 'structural_fallback')
assert.equal(resolveSemanticExtrasPlacement(table, { sourceBlockId: 'absent', side: 'after' }).mode, 'structural_fallback')
assert.equal(resolveSemanticExtrasPlacement(table, { sourceBlockId: 'para-0', side: 'inside' } as never).mode, 'structural_fallback')
assert.equal(insert(source, { sourceBlockId: 'absent', side: 'after' }).insertedNames.length, 2)
assert.throws(() => insert([{ blockId: 'table-0-row-0-cell-0-p-0', paragraphIndex: 0, kind: 'tableCell', text: 'Only table' }]), /SAFE_PLACEMENT_NOT_FOUND/)
assert.throws(() => insertAdditionalServicesIntoBlocks({ blocks: identity(source), sourceBlocks: source, dataset: { additionalServices: [{ name: 'Dron 800 zł' }] } as ContractTransformationDataset }), /UNSAFE_CRM_NAME/)

const bounded = blocksFromPlainParagraphs(['Package description', 'Body section', 'Second body section', 'Signature'])
const metadata = {
  packageDescriptionRegion: { startParagraphIndex: 0, endParagraphIndex: 0 },
  mainContractualBodyRegion: { startParagraphIndex: 0, endParagraphIndex: 2 },
  signatureBoundaryParagraphIndex: 3,
  fallbackBoundaryParagraphIndex: 1,
}
assert.equal(resolveSemanticExtrasPlacement(bounded, { sourceBlockId: 'para-1', side: 'after' }, metadata).mode, 'model')
for (const invalid of [
  { sourceBlockId: 'para-3', side: 'after' as const },
  { sourceBlockId: 'para-0', side: 'before' as const },
  { sourceBlockId: 'unknown', side: 'after' as const },
]) {
  const fallback = resolveSemanticExtrasPlacement(bounded, invalid, metadata)
  assert.equal(fallback.mode, 'structural_fallback', 'invalid model boundary uses fixed metadata fallback')
  assert.equal(fallback.paragraphIndex, 1)
}
const metadataInsertion = insertAdditionalServicesIntoBlocks({
  blocks: identity(bounded),
  sourceBlocks: bounded,
  dataset,
  placement: { sourceBlockId: 'para-3', side: 'after' },
  templateMetadata: metadata,
})
assert.equal(metadataInsertion.placement?.mode, 'structural_fallback')
assert.equal(metadataInsertion.placement?.paragraphIndex, 1, 'fallback stays after package details and inside the contractual body')
assert.equal(metadataInsertion.diagnostics.additionalServicesInsertedCount, 2)
const metadataExpanded = expandBlocksWithParagraphInsertions({ sourceBlocks: bounded, blocks: metadataInsertion.blocks, insertions: metadataInsertion.paragraphInsertions })
const signatureIndex = metadataExpanded.findIndex((block) => block.text === 'Signature')
const extrasIndexes = metadataExpanded.flatMap((block, index) => block.text.includes('sesja narzeczeńska') || block.text.includes('album rodzinny') ? [index] : [])
assert.equal(extrasIndexes.length, 2, 'each selected CRM extra appears once')
assert.ok(extrasIndexes.every((index) => index < signatureIndex), 'extras stay before the signature section')
assert.ok(metadataInsertion.paragraphInsertions[0]!.paragraphs.every((paragraph) => !/\d[\d\s]*\s*zł|\bPLN\b/i.test(paragraph)), 'inserted CRM text contains no extra prices')
const goldenHashes = [
  'd8f5b95eae9586adc5c37b681f2ba108ab2464fcc78f2ab8214a6d57a6710fee',
  '617275318f49790e9b2ba3faa4093b96486f0bf1b2b72a2082f0eed94cb9a6ae',
  '1d4035dafdde597b308af923a1061ba3409141420d8dd6d699df1578ae5d6637',
  '63358621714ef99f88392be4174e2e498dcaf4555749a698ec94904c0925feb4',
  '6feb4a760e42d1a8ef6e61d4721e3c021d5eb8df9278e4cf188a76db2fafb91c',
  '14b917a31e67eab720bc94df91db84611ee5da3bb68ef0bb49cfc1102466a012',
]
for (const hash of goldenHashes) assert.ok(getGoldenSemanticExtrasTemplateMetadataSeedForTest(hash), 'Golden seed metadata remains available')
assert.equal(getGoldenSemanticExtrasTemplateMetadataSeedForTest('0'.repeat(64)), null, 'custom templates do not get inferred metadata')
assert.equal(await resolveGoldenSemanticExtrasTemplateMetadataSeed(new ArrayBuffer(4)), null, 'custom source hash is not an eligibility failure or metadata source')
assert.equal(isValidSemanticExtrasTemplateMetadata(metadata), true)
assert.equal(isValidSemanticExtrasTemplateMetadata({ ...metadata, fallbackBoundaryParagraphIndex: 4 }), false, 'fallback after signature is invalid')
const customVersionSource = new ArrayBuffer(5)
const customVersionMetadata = await createStoredSemanticExtrasTemplateMetadata(customVersionSource, metadata)
assert.ok(customVersionMetadata, 'verified structural metadata can be stored on a version')
const versionSlotMap = withStoredSemanticExtrasTemplateMetadata({ version: 1, slots: [], unrelated: true }, customVersionMetadata)
assert.equal(versionSlotMap.unrelated, true, 'existing version slot map fields are preserved')
assert.deepEqual(await resolveStoredSemanticExtrasTemplateMetadata(versionSlotMap, customVersionSource), metadata, 'custom version resolves metadata from its own slot map')
assert.equal(await resolveStoredSemanticExtrasTemplateMetadata({}, customVersionSource), null, 'custom version without trusted metadata fails closed')
assert.equal(await resolveStoredSemanticExtrasTemplateMetadata(versionSlotMap, new ArrayBuffer(6)), null, 'version metadata does not apply to different source bytes')

const zip = new JSZip()
zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/><w:numPr><w:numId w:val="3"/></w:numPr></w:pPr><w:r><w:t>8 Usługi dodatkowe</w:t></w:r></w:p><w:p><w:r><w:t>8.1 SOURCE catalog: 1200 zł</w:t></w:r></w:p><w:p><w:r><w:t>8.2 SOURCE clause</w:t></w:r></w:p></w:body></w:document>`)
const bytes = await zip.generateAsync({ type: 'arraybuffer' })
const output = await writeTransformedDocx({ sourceBytes: bytes, sourceBlocks: source, transformedBlocks: selected.blocks, paragraphInsertions: selected.paragraphInsertions })
const sourceXml = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')
const finalXml = await (await JSZip.loadAsync(output)).file('word/document.xml')!.async('string')
const sourceParagraphs = [...sourceXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
const finalParagraphs = [...finalXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
assert.deepEqual([finalParagraphs[0], ...finalParagraphs.slice(4)], sourceParagraphs, 'all SOURCE paragraphs are byte-identical')
assert.equal(finalParagraphs.length, sourceParagraphs.length + 3)
assert.equal(finalParagraphs.slice(1, 4).some((paragraph) => paragraph.includes('<w:numPr')), false)
assert.equal(finalParagraphs.slice(1, 4).some((paragraph) => paragraph.includes('Heading1')), false)
assert.equal(finalXml.includes('1200 zł'), true, 'SOURCE-authored price remains')
assert.equal(finalParagraphs.slice(1, 4).some((paragraph) => paragraph.includes('1200 zł')), false, 'CRM insertion has no price')

const before = insert(source, { sourceBlockId: 'para-2', side: 'before' })
assert.equal(before.paragraphInsertions[0]?.beforeParagraphIndex, 2)
const beforeOutput = await writeTransformedDocx({ sourceBytes: bytes, sourceBlocks: source, transformedBlocks: before.blocks, paragraphInsertions: before.paragraphInsertions })
const beforeXml = await (await JSZip.loadAsync(beforeOutput)).file('word/document.xml')!.async('string')
assert.ok(beforeXml.indexOf('sesja narzeczeńska') < beforeXml.indexOf('8.2 SOURCE clause'))

console.log('semantic extras placement metadata: PASS')
