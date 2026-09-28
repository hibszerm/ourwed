import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { applyBlockOperations, buildBlockIndex } from './blockDocxEditor'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const sourceXml = `<?xml version="1.0"?><w:document xmlns:w="urn:w"><w:body>
<w:p><w:pPr><w:keepNext/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>1)</w:t></w:r><w:r><w:t>stara płatność 30.09.2026</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>2.</w:t><w:tab/></w:r><w:r><w:t>stary tekst</w:t></w:r></w:p>
<w:p><w:r><w:t>1)</w:t></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t>stary podpunkt</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="4"/></w:numPr></w:pPr><w:r><w:t>4.</w:t></w:r><w:r><w:t>stary ustęp</w:t></w:r></w:p>
<w:p><w:r><w:t>2026 budget starts here</w:t></w:r></w:p>
<w:p><w:r><w:t>1)stary tekst</w:t></w:r><w:r><w:t> continued ordinary prose</w:t></w:r></w:p>
<w:p><w:pPr><w:ind w:left="720"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>1) Podpunkt pakietu</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:t>Normalna klauzula</w:t></w:r></w:p>
<w:p><w:r><w:t>Przekazanie zgodnie z § 1 ust. 1.</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Para Młoda</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Filmowiec</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>`
const headerXml = '<w:hdr xmlns:w="urn:w"><w:p><w:r><w:t>Nagłówek</w:t></w:r></w:p></w:hdr>'
const footerXml = '<w:ftr xmlns:w="urn:w"><w:p><w:r><w:t>Stopka</w:t></w:r></w:p></w:ftr>'
const zip = new JSZip()
zip.file('word/document.xml', sourceXml)
zip.file('word/header1.xml', headerXml)
zip.file('word/footer1.xml', footerXml)
zip.file('word/styles.xml', '<w:styles/>')
const sourceBytes = await zip.generateAsync({ type: 'arraybuffer' })
const blocks = await buildBlockIndex(sourceBytes)
const payment = blocks.find((block) => block.text.startsWith('1)stara'))!
const normal = blocks.find((block) => block.text === 'Normalna klauzula')!
const reference = blocks.find((block) => block.text === 'Przekazanie zgodnie z § 1 ust. 1.')!
const tabPrefix = blocks.find((block) => block.text.startsWith('2.'))!
const spacedPrefix = blocks.find((block) => block.text.startsWith('1) stary'))!
const splitPrefix = blocks.find((block) => block.text.startsWith('4.stary'))!
const ordinaryDigits = blocks.find((block) => block.text === '2026 budget starts here')!
const ordinarySplit = blocks.find((block) => block.text.startsWith('1)stary tekst'))!
assert.equal(blocks.find((block) => block.text === 'Para Młoda')?.kind, 'tableCell')
assert.ok(blocks.some((block) => block.kind === 'header' && block.text === 'Nagłówek'))
assert.ok(blocks.some((block) => block.kind === 'footer' && block.text === 'Stopka'))

// A, B, C, D. Complete contextual sentence replacements have no span arithmetic.
const operations = [
  { blockId: payment.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: '1) Pozostała kwota 13 200 zł zostanie zapłacona 20.09.2026 r.' },
  { blockId: normal.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: 'Ceremonia odbędzie się w Zamku Królewskim na Wawelu, a przyjęcie w Hotelu Starym.' },
  { blockId: reference.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: 'Filmowiec przekaże dzieło opisane w § 1 ust. 1 i 2.' },
  { blockId: tabPrefix.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: '2. New clause text' },
  { blockId: spacedPrefix.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: '1) New child text' },
  { blockId: splitPrefix.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: '4. New paragraph text' },
  { blockId: ordinaryDigits.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: '2026 forecast remains unchanged' },
  { blockId: ordinarySplit.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: '1)stary tekst rewritten as prose' },
  { anchorBlockId: normal.blockId, operation: 'INSERT_BLOCK_AFTER' as const, finalText: 'Dodatkowe ujęcia: VHS i dron.', styleSourceBlockId: normal.blockId },
]
const edited = await applyBlockOperations(sourceBytes, operations)
const editedZip = await JSZip.loadAsync(edited)
const doc = await editedZip.file('word/document.xml')!.async('string')
const editedBlocks = await buildBlockIndex(edited)
assert.ok(editedBlocks.some((block) => block.text === '1) Pozostała kwota 13 200 zł zostanie zapłacona 20.09.2026 r.'))
assert.ok(editedBlocks.some((block) => block.text.includes('w Zamku Królewskim') && block.text.includes('w Hotelu Starym')))
assert.ok(editedBlocks.some((block) => block.text === 'Filmowiec przekaże dzieło opisane w § 1 ust. 1 i 2.'))
assert.ok(editedBlocks.some((block) => block.text === '2. New clause text'), 'a source tab remains a visible separator')
assert.ok(editedBlocks.some((block) => block.text === '1) New child text'), 'source whitespace after a structural marker is retained')
assert.ok(editedBlocks.some((block) => block.text === '4. New paragraph text'), 'numbering metadata identifies the boundary when prefix and body are split')
assert.ok(editedBlocks.some((block) => block.text === '2026 forecast remains unchanged'), 'ordinary digit-leading prose is not altered')
assert.ok(editedBlocks.some((block) => block.text === '1)stary tekst rewritten as prose'), 'an ordinary run split is not mistaken for a structural prefix')
const tabbedParagraph = doc.match(/<w:p>[^]*?<w:t[^>]*>2\.<\/w:t>[^]*?<\/w:p>/)?.[0] ?? ''
assert.match(tabbedParagraph, /<w:tab\/>/, 'the source tab convention is retained in the rewritten paragraph')
assert.ok(editedBlocks.some((block) => block.text === 'Dodatkowe ujęcia: VHS i dron.'))
assert.match(doc, /<w:pPr><w:keepNext\/><\/w:pPr>/, 'replacement retains source paragraph properties')
assert.match(doc, /<w:pPr><w:jc w:val="both"\/><\/w:pPr>/, 'insertion takes paragraph alignment from explicit normal-clause source')
assert.doesNotMatch(doc.match(/Dodatkowe ujęcia[\s\S]*?<\/w:p>/)?.[0] ?? '', /w:ind|<w:i\/>/, 'package-child indentation and italics do not leak into insertion')
assert.equal((doc.match(/<w:tbl\b/g) ?? []).length, 1)
assert.equal(await editedZip.file('word/header1.xml')!.async('string'), headerXml)
assert.equal(await editedZip.file('word/footer1.xml')!.async('string'), footerXml)

// Word fields are protected structural parts of an editable block. The planner
// sees cached display text plus field metadata; execution preserves field XML.
const fieldZip = new JSZip()
const fieldParagraph = '<w:p><w:r><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="16"/></w:rPr><w:t>Page </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/><w:instrText xml:space="preserve"> PAGE </w:instrText><w:fldChar w:fldCharType="separate"/><w:t>1</w:t><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t xml:space="preserve"> z </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/><w:instrText xml:space="preserve"> NUMPAGES </w:instrText><w:fldChar w:fldCharType="separate"/><w:t>1</w:t><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t xml:space="preserve"> document </w:t></w:r><w:fldSimple w:instr="DOCPROPERTY &quot;Title&quot;"><w:r><w:t>OurWed</w:t></w:r></w:fldSimple></w:p>'
fieldZip.file('word/document.xml', `<w:document xmlns:w="urn:w"><w:body>${fieldParagraph}<w:sectPr/></w:body></w:document>`)
fieldZip.file('word/header1.xml', '<w:hdr xmlns:w="urn:w"><w:p><w:r><w:t>Draft </w:t></w:r><w:fldSimple w:instr="DATE"><w:r><w:t>2026-09-28</w:t></w:r></w:fldSimple><w:r><w:t xml:space="preserve"> header</w:t></w:r></w:p></w:hdr>')
const fieldBytes = await fieldZip.generateAsync({ type: 'arraybuffer' })
const fieldBlocks = await buildBlockIndex(fieldBytes)
const fieldBlock = fieldBlocks.find((block) => block.text === 'Page 1 z 1 document OurWed')!
const fieldHeader = fieldBlocks.find((block) => block.kind === 'header')!
assert.deepEqual(fieldBlock.textParts?.filter((part) => part.kind === 'protected_field').map((part) => part.kind === 'protected_field' ? [part.fieldKind, part.instruction, part.cachedText] : []), [
  ['complex', 'PAGE', '1'], ['complex', 'NUMPAGES', '1'], ['simple', 'DOCPROPERTY "Title"', 'OurWed'],
], 'the block index distinguishes editable text from protected field structure without exposing XML')
assert.deepEqual(fieldHeader.textParts?.filter((part) => part.kind === 'protected_field').map((part) => part.kind === 'protected_field' ? [part.fieldKind, part.instruction, part.cachedText] : []), [['simple', 'DATE', '2026-09-28']])
const fieldEditedBytes = await applyBlockOperations(fieldBytes, [
  { blockId: fieldBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Final page 1 z 1 for OurWed report' },
  { blockId: fieldHeader.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Final 2026-09-28 header revised' },
])
const fieldEditedZip = await JSZip.loadAsync(fieldEditedBytes)
const fieldEditedXml = await fieldEditedZip.file('word/document.xml')!.async('string')
const fieldEditedHeaderXml = await fieldEditedZip.file('word/header1.xml')!.async('string')
const fieldEditedBlocks = await buildBlockIndex(fieldEditedBytes)
assert.ok(fieldEditedBlocks.some((block) => block.text === 'Final page 1 z 1 for OurWed report'))
assert.ok(fieldEditedBlocks.some((block) => block.kind === 'header' && block.text === 'Final 2026-09-28 header revised'))
assert.match(fieldEditedXml, /<w:instrText[^>]*> PAGE <\/w:instrText>/)
assert.match(fieldEditedXml, /<w:instrText[^>]*> NUMPAGES <\/w:instrText>/)
assert.match(fieldEditedXml, /<w:fldSimple w:instr="DOCPROPERTY &quot;Title&quot;">[\s\S]*?<w:t>OurWed<\/w:t>[\s\S]*?<\/w:fldSimple>/, 'an unrelated document-property field remains structurally intact')
assert.match(fieldEditedHeaderXml, /<w:fldSimple w:instr="DATE">[\s\S]*?<w:t>2026-09-28<\/w:t>[\s\S]*?<\/w:fldSimple>/, 'a simple date field in a header survives editing')
assert.equal((fieldEditedXml.match(/<w:fldChar w:fldCharType="begin"\/>/g) ?? []).length, 2)
assert.equal((fieldEditedXml.match(/<w:fldChar w:fldCharType="end"\/>/g) ?? []).length, 2)
assert.equal((fieldEditedXml.match(/<w:t>1<\/w:t>/g) ?? []).length, 2, 'cached page labels remain inside their original field structures')
await assert.rejects(() => applyBlockOperations(fieldBytes, [{ blockId: fieldBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Fields omitted from this replacement' }]), /Cannot safely map cached text|cannot be mapped|ambiguous/i, 'unmappable fields fail closed instead of becoming literal text')

// E. Explicit block style-source ID controls insertion formatting.
const inserted = editedBlocks.find((block) => block.text === 'Dodatkowe ujęcia: VHS i dron.')!
assert.equal(inserted.kind, 'body')

// F. The block operation replaces a complete adjacent text block, never concatenating stale fragments.
assert.ok(!editedBlocks.some((block) => block.text.includes('stara płatność') || block.text.includes('30.09.2026')))

// G. Actual fixture package/package child text and table/signature structure remain intact offline.
const fixture = await readFile(fileURLToPath(new URL('./fixtures/source-video-standard.docx', import.meta.url)))
const fixtureBuffer = fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength)
const fixtureBlocks = await buildBlockIndex(fixtureBuffer)
assert.ok(fixtureBlocks.some((block) => block.text.includes('Video Standard')))
const fixtureZip = await JSZip.loadAsync(fixtureBuffer)
const fixtureDoc = await fixtureZip.file('word/document.xml')!.async('string')
const originalPackageText = fixtureBlocks.filter((block) => /Video Standard|teledysku ślubnego o długości|filmy ślubnego o długości/.test(block.text)).map((block) => block.text)
const firstEditable = fixtureBlocks.find((block) => block.kind === 'body' && block.text.trim())!
const fixtureEdited = await applyBlockOperations(fixtureBuffer, [{ blockId: firstEditable.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: firstEditable.text }])
const fixtureEditedZip = await JSZip.loadAsync(fixtureEdited)
const fixtureEditedDoc = await fixtureEditedZip.file('word/document.xml')!.async('string')
const afterBlocks = await buildBlockIndex(fixtureEdited)
assert.deepEqual(afterBlocks.filter((block) => /Video Standard|teledysku ślubnego o długości|filmy ślubnego o długości/.test(block.text)).map((block) => block.text), originalPackageText)
assert.equal((fixtureEditedDoc.match(/<w:tbl\b/g) ?? []).length, (fixtureDoc.match(/<w:tbl\b/g) ?? []).length)
for (const part of Object.keys(fixtureZip.files).filter((path) => /^word\/(header|footer|styles)/.test(path))) {
  assert.equal(await fixtureEditedZip.file(part)!.async('string'), await fixtureZip.file(part)!.async('string'))
}

// Focused pagination regression: retain the authored page break and one spacer,
// while removing only the redundant empty paragraph that can occupy a page alone.
const layoutZip = new JSZip()
layoutZip.file('word/document.xml', '<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Edited clause</w:t></w:r></w:p><w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="522"/></w:tabs></w:pPr><w:r><w:t></w:t></w:r></w:p><w:p><w:r><w:t></w:t></w:r></w:p><w:p><w:pPr><w:pageBreakBefore w:val="1"/></w:pPr><w:r><w:t>§ 2</w:t></w:r></w:p><w:sectPr/></w:body></w:document>')
const layoutBytes = await layoutZip.generateAsync({ type: 'arraybuffer' })
const layoutBlocks = await buildBlockIndex(layoutBytes)
const layoutEdited = await applyBlockOperations(layoutBytes, [{ blockId: layoutBlocks[0]!.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Edited clause updated' }])
const layoutEditedZip = await JSZip.loadAsync(layoutEdited)
const layoutXml = await layoutEditedZip.file('word/document.xml')!.async('string')
const beforeSectionBreak = layoutXml.slice(0, layoutXml.indexOf('<w:pageBreakBefore'))
assert.equal((beforeSectionBreak.match(/<w:p\b/g) ?? []).length - 1, 2, 'only one empty spacer remains before the explicit page break')
assert.match(layoutXml, /<w:pageBreakBefore w:val="1"\/>/, 'the authored §2 page break is preserved')

console.log('PASS block DOCX editor: whole contextual edits, package preservation, explicit insertion style, tables, signatures, header/footer')
