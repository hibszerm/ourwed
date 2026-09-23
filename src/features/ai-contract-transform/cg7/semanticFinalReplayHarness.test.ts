import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { locateGroundedTextSpan } from '@/features/documents/template/docxParagraphEditor'
import { extractCanonicalParagraphText } from '@/features/documents/template/canonicalParagraph'
import { indexDocxForTransform } from '@/features/ai-contract-transform/indexDocxForTransform'
import { writeSemanticMappingDocx } from '@/features/ai-contract-transform/docxTransformWriter'
import { extractSemanticParagraphTextSlots } from './semanticSpanReplayAudit'
import { auditSemanticReplayParagraph, continueSemanticReplayDocx } from './semanticFinalReplayHarness'

const paragraphXmls = (xml: string) => [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0]!)
async function documentXml(bytes: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  return zip.file('word/document.xml')!.async('string')
}

const cases = [
  { name: 'name, street, city, legal suffix', prefix: 'Old Name', newPrefix: 'New Name', street: 'Old Street 1', city: 'Old City', newStreet: 'New Street 2', newCity: 'New City', suffix: 'LEGAL', breaks: 3 },
  { name: 'street and city', prefix: '', newPrefix: '', street: 'Old Street 1', city: 'Old City', newStreet: 'New Street 2', newCity: 'New City', suffix: '', breaks: 1 },
  { name: 'name, street, city', prefix: 'Old Name', newPrefix: 'New Name', street: 'Old Street 1', city: 'Old City', newStreet: 'New Street 2', newCity: 'New City', suffix: '', breaks: 2 },
] as const

for (const fixture of cases) {
  const sourceSlots = [fixture.prefix, fixture.street, fixture.city, fixture.suffix].filter(Boolean)
  const sourceParagraph = `<w:p><w:r>${sourceSlots.map((slot) => `<w:t>${slot}</w:t>`).join('<w:br/>')}</w:r></w:p>`
  const zip = new JSZip()
  zip.file('word/document.xml', `<w:document xmlns:w="urn:w"><w:body>${sourceParagraph}<w:p><w:r><w:t>EXTRAS</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`)
  const sourceBytes = await zip.generateAsync({ type: 'arraybuffer' })
  const sourceBlocks = await indexDocxForTransform(sourceBytes)
  const target = sourceBlocks.find((block) => block.paragraphIndex === 0)!
  const extrasTarget = sourceBlocks.find((block) => block.text === 'EXTRAS')!
  const address = locateGroundedTextSpan(sourceParagraph, fixture.street + fixture.city)
  assert.equal(address.ok, true)
  if (!address.ok) throw new Error('address span missing')
  const edits = [
    ...(fixture.prefix ? [{ blockId: target.blockId, span: { start: 0, end: fixture.prefix.length }, replacement: fixture.newPrefix }] : []),
    { blockId: target.blockId, span: address.span, replacement: `${fixture.newStreet}, ${fixture.newCity}`, replacementSegments: [fixture.newStreet, fixture.newCity] },
  ]
  const mappings = edits.map((edit) => ({ sourceBlockId: edit.blockId, span: edit.span }))
  const semanticBytes = await writeSemanticMappingDocx({
    sourceBytes,
    sourceBlocks,
    execution: { ok: true, paragraphs: [], spanEdits: edits },
  })
  const semanticParagraph = paragraphXmls(await documentXml(semanticBytes))[0]!
  assert.equal(sourceParagraph.includes(', '), false, `${fixture.name}: no source delimiter`)
  auditSemanticReplayParagraph({
    sourceParagraphXml: sourceParagraph,
    outputParagraphXml: semanticParagraph,
    blockId: target.blockId,
    edits,
    mappings,
  })
  const semanticBlocks = await indexDocxForTransform(semanticBytes)
  const extraBlocks = semanticBlocks.map((block) => ({ blockId: block.blockId, text: block.blockId === extrasTarget.blockId ? 'EXTRAS: approved' : block.text }))
  const finalBytes = await continueSemanticReplayDocx({
    semanticBytes,
    sourceBlocks,
    semanticBlocks: semanticBlocks.map((block) => ({ blockId: block.blockId, text: block.text })),
    extraBlocks,
    paragraphInsertions: [{ afterParagraphIndex: extrasTarget.paragraphIndex, paragraphs: ['additional extra'], listNumbering: 'detach' }],
    groundedEditBlockIds: [target.blockId],
  })
  const finalXml = await documentXml(finalBytes)
  const finalParagraphs = paragraphXmls(finalXml)
  const finalTarget = finalParagraphs[0]!
  const finalSlots = extractSemanticParagraphTextSlots(finalTarget)
  assert.equal((finalTarget.match(/<w:br\b/g) ?? []).length, fixture.breaks, `${fixture.name}: breaks preserved`)
  assert.deepEqual(finalSlots, [fixture.newPrefix, fixture.newStreet, fixture.newCity, fixture.suffix].filter(Boolean), `${fixture.name}: physical slots preserved`)
  assert.equal(finalTarget.includes(', '), false, `${fixture.name}: no synthetic comma-space written at break`)
  assert.equal(finalTarget, semanticParagraph, `${fixture.name}: final continuation leaves grounded paragraph untouched`)
  assert.ok(finalParagraphs.some((paragraph) => extractCanonicalParagraphText(paragraph) === 'EXTRAS: approved'), `${fixture.name}: in-place extra retained`)
  assert.ok(finalParagraphs.some((paragraph) => extractCanonicalParagraphText(paragraph) === 'additional extra'), `${fixture.name}: extra insertion retained`)
}

console.log('semantic final replay harness: segment-aware audit and structural continuation PASS')
