import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { applyBlockOperations, buildBlockIndex } from './blockDocxEditor'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const sourceXml = `<?xml version="1.0"?><w:document xmlns:w="urn:w"><w:body>
<w:p><w:pPr><w:keepNext/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>1)</w:t></w:r><w:r><w:t>stara płatność 30.09.2026</w:t></w:r></w:p>
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
assert.equal(blocks.find((block) => block.text === 'Para Młoda')?.kind, 'tableCell')
assert.ok(blocks.some((block) => block.kind === 'header' && block.text === 'Nagłówek'))
assert.ok(blocks.some((block) => block.kind === 'footer' && block.text === 'Stopka'))

// A, B, C, D. Complete contextual sentence replacements have no span arithmetic.
const operations = [
  { blockId: payment.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: '1) Pozostała kwota 13 200 zł zostanie zapłacona 20.09.2026 r.' },
  { blockId: normal.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: 'Ceremonia odbędzie się w Zamku Królewskim na Wawelu, a przyjęcie w Hotelu Starym.' },
  { blockId: reference.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: 'Filmowiec przekaże dzieło opisane w § 1 ust. 1 i 2.' },
  { anchorBlockId: normal.blockId, operation: 'INSERT_BLOCK_AFTER' as const, finalText: 'Dodatkowe ujęcia: VHS i dron.', styleSourceBlockId: normal.blockId },
]
const edited = await applyBlockOperations(sourceBytes, operations)
const editedZip = await JSZip.loadAsync(edited)
const doc = await editedZip.file('word/document.xml')!.async('string')
const editedBlocks = await buildBlockIndex(edited)
assert.ok(editedBlocks.some((block) => block.text === '1) Pozostała kwota 13 200 zł zostanie zapłacona 20.09.2026 r.'))
assert.ok(editedBlocks.some((block) => block.text.includes('w Zamku Królewskim') && block.text.includes('w Hotelu Starym')))
assert.ok(editedBlocks.some((block) => block.text === 'Filmowiec przekaże dzieło opisane w § 1 ust. 1 i 2.'))
assert.ok(editedBlocks.some((block) => block.text === 'Dodatkowe ujęcia: VHS i dron.'))
assert.match(doc, /<w:pPr><w:keepNext\/><\/w:pPr>/, 'replacement retains source paragraph properties')
assert.match(doc, /<w:pPr><w:jc w:val="both"\/><\/w:pPr>/, 'insertion takes paragraph alignment from explicit normal-clause source')
assert.doesNotMatch(doc.match(/Dodatkowe ujęcia[\s\S]*?<\/w:p>/)?.[0] ?? '', /w:ind|<w:i\/>/, 'package-child indentation and italics do not leak into insertion')
assert.equal((doc.match(/<w:tbl\b/g) ?? []).length, 1)
assert.equal(await editedZip.file('word/header1.xml')!.async('string'), headerXml)
assert.equal(await editedZip.file('word/footer1.xml')!.async('string'), footerXml)

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
