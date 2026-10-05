import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { applyBlockOperations, buildBlockIndex } from './blockDocxEditor'
import { readSource, validateOptionBCandidate } from './generator'
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
  { anchorBlockId: splitPrefix.blockId, operation: 'INSERT_BLOCK_AFTER' as const, finalText: 'Purchased extra, presented separately from base scope.', styleSourceBlockId: splitPrefix.blockId },
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
assert.doesNotMatch(tabbedParagraph, /<w:tab\/>/, 'a source tab is not reintroduced when the requested text has no separator')
assert.ok(editedBlocks.some((block) => block.text === 'Dodatkowe ujęcia: VHS i dron.'))
assert.ok(editedBlocks.some((block) => block.text === 'Purchased extra, presented separately from base scope.'), 'inserted content remains the supplied unnumbered text')
const insertedAfterNumberedSource = doc.match(/<w:p>(?:(?!<w:p>).)*?Purchased extra, presented separately from base scope\.(?:(?!<w:p>).)*?<\/w:p>/s)?.[0] ?? ''
assert.ok(insertedAfterNumberedSource, 'inserted paragraph is present after a numbered source paragraph')
assert.doesNotMatch(insertedAfterNumberedSource, /<w:numPr\b|<w:numId\b/, 'insertion strips numbering inherited from its numbered style source')
assert.match(doc, /<w:pPr><w:keepNext\/><\/w:pPr>/, 'replacement retains source paragraph properties')
assert.match(doc, /<w:pPr><w:jc w:val="both"\/><\/w:pPr>/, 'insertion takes paragraph alignment from explicit normal-clause source')
assert.doesNotMatch(doc.match(/Dodatkowe ujęcia[\s\S]*?<\/w:p>/)?.[0] ?? '', /w:ind|<w:i\/>/, 'package-child indentation and italics do not leak into insertion')
assert.equal((doc.match(/<w:tbl\b/g) ?? []).length, 1)
assert.equal(await editedZip.file('word/header1.xml')!.async('string'), headerXml)
assert.equal(await editedZip.file('word/footer1.xml')!.async('string'), footerXml)

// A numbered paragraph style can carry numbering through w:pStyle even when
// the source paragraph itself has no direct w:numPr. Plain inserted text must
// keep useful style formatting while explicitly opting out of that numbering.
const styleNumberedZip = new JSZip()
const styleNumberedDocument = '<w:document xmlns:w="urn:w"><w:body><w:p><w:pPr><w:pStyle w:val="NumberedChild"/></w:pPr><w:r><w:t>Base scope item</w:t></w:r></w:p><w:sectPr/></w:body></w:document>'
const styleNumberedStyles = '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="NumberedChild"><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="4"/></w:numPr><w:ind w:left="720"/></w:pPr></w:style></w:styles>'
const styleNumberingDefinitions = '<w:numbering xmlns:w="urn:w"><w:abstractNum w:abstractNumId="3"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="4"><w:abstractNumId w:val="3"/></w:num></w:numbering>'
styleNumberedZip.file('word/document.xml', styleNumberedDocument)
styleNumberedZip.file('word/styles.xml', styleNumberedStyles)
styleNumberedZip.file('word/numbering.xml', styleNumberingDefinitions)
const styleNumberedBytes = await styleNumberedZip.generateAsync({ type: 'arraybuffer' })
const numberedAnchor = (await buildBlockIndex(styleNumberedBytes)).find((block) => block.text === 'Base scope item')!
const styleNumberedOutput = await applyBlockOperations(styleNumberedBytes, [{
  anchorBlockId: numberedAnchor.blockId,
  operation: 'INSERT_BLOCK_AFTER',
  finalText: 'Unnumbered additional item.',
  styleSourceBlockId: numberedAnchor.blockId,
}])
const styleNumberedOutputZip = await JSZip.loadAsync(styleNumberedOutput)
const styleNumberedOutputXml = await styleNumberedOutputZip.file('word/document.xml')!.async('string')
const styleInsertedParagraph = styleNumberedOutputXml.match(/<w:p>(?:(?!<w:p>).)*?Unnumbered additional item\.(?:(?!<w:p>).)*?<\/w:p>/s)?.[0] ?? ''
assert.ok(styleInsertedParagraph, 'the plain insertion is present in the DOCX')
assert.match(styleInsertedParagraph, /<w:pStyle w:val="NumberedChild"\/>/, 'the numbered paragraph style is otherwise retained')
assert.match(styleInsertedParagraph, /<w:numPr><w:numId w:val="0"\/><\/w:numPr>/, 'an explicit no-numbering override defeats numbering inherited through the paragraph style')
assert.match(styleNumberedStyles, /w:styleId="NumberedChild"[^]*?<w:numId w:val="4"\/>/, 'the synthetic paragraph style carries list numbering')
assert.match(styleNumberingDefinitions, /w:numId="4"/, 'the synthetic numbering definition resolves the style numbering reference')
assert.equal(await styleNumberedOutputZip.file('word/styles.xml')!.async('string'), styleNumberedStyles, 'the source style definition remains untouched')
assert.equal(await styleNumberedOutputZip.file('word/numbering.xml')!.async('string'), styleNumberingDefinitions, 'the source numbering definition remains untouched')
assert.ok((await buildBlockIndex(styleNumberedOutput)).some((block) => block.text === 'Unnumbered additional item.'), 'the output paragraph contains only the supplied plain text')

// Mixed pPr children verify the suppression override is inserted at the
// schema position without losing formatting that follows that position.
const mixedStyleZip = new JSZip()
const mixedStyleDocument = '<w:document xmlns:w="urn:w"><w:body><w:p><w:pPr><w:pStyle w:val="NumberedMixed"/><w:keepNext/><w:keepLines/><w:numPr><w:numId w:val="4"/></w:numPr><w:spacing w:after="120"/><w:ind w:left="720"/><w:jc w:val="both"/></w:pPr><w:r><w:t>Mixed source paragraph</w:t></w:r></w:p><w:sectPr/></w:body></w:document>'
const mixedStyleStyles = '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="NumberedMixed"><w:pPr><w:numPr><w:numId w:val="4"/></w:numPr></w:pPr></w:style></w:styles>'
mixedStyleZip.file('word/document.xml', mixedStyleDocument)
mixedStyleZip.file('word/styles.xml', mixedStyleStyles)
const mixedBytes = await mixedStyleZip.generateAsync({ type: 'arraybuffer' })
const mixedAnchor = (await buildBlockIndex(mixedBytes)).find((block) => block.text === 'Mixed source paragraph')!
const mixedOutput = await applyBlockOperations(mixedBytes, [{ anchorBlockId: mixedAnchor.blockId, operation: 'INSERT_BLOCK_AFTER', finalText: 'Mixed plain insertion', styleSourceBlockId: mixedAnchor.blockId }])
const mixedZip = await JSZip.loadAsync(mixedOutput)
const mixedXml = await mixedZip.file('word/document.xml')!.async('string')
const mixedInserted = mixedXml.match(/<w:p>(?:(?!<w:p>).)*?Mixed plain insertion(?:(?!<w:p>).)*?<\/w:p>/s)?.[0] ?? ''
const mixedPPr = mixedInserted.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1] ?? ''
const mixedChildren = [...mixedPPr.matchAll(/<w:([A-Za-z0-9]+)\b[^>]*(?:\/>|>[\s\S]*?<\/w:\1>)/g)].map((match) => match[1])
assert.equal((mixedPPr.match(/<w:numPr\b/g) ?? []).length, 1, 'the inserted paragraph has exactly one numbering override')
assert.match(mixedPPr, /<w:numPr><w:numId w:val="0"\/><\/w:numPr>/, 'the mixed-property insertion uses numId zero')
assert.deepEqual(mixedChildren, ['pStyle', 'keepLines', 'numPr', 'spacing', 'ind', 'jc'], 'numPr follows preceding properties and precedes following properties in schema order')
assert.match(mixedPPr, /<w:keepLines\/>[\s\S]*<w:spacing w:after="120"\/>[\s\S]*<w:ind w:left="720"\/>[\s\S]*<w:jc w:val="both"\/>/, 'the non-numbering formatting surrounding numPr is preserved')
assert.equal(mixedXml.match(/<w:p>(?:(?!<w:p>).)*?Mixed source paragraph(?:(?!<w:p>).)*?<\/w:p>/s)?.[0], mixedStyleDocument.match(/<w:p>(?:(?!<w:p>).)*?Mixed source paragraph(?:(?!<w:p>).)*?<\/w:p>/s)?.[0], 'the source paragraph is unchanged')
assert.ok((await buildBlockIndex(mixedOutput)).some((block) => block.text === 'Mixed plain insertion'), 'the edited DOCX remains parseable by the document indexer')

// Style traversal supports alternate valid namespace prefixes, multiple
// basedOn levels, missing parents, and cycles without inventing numbering.
const inheritedZip = new JSZip()
inheritedZip.file('word/document.xml', '<w:document xmlns:w="urn:w"><w:body><w:p><w:pPr><w:pStyle w:val="StyleC"/></w:pPr><w:r><w:t>Inherited target</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="CycleA"/></w:pPr><w:r><w:t>Cycle target</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="MissingParentChild"/></w:pPr><w:r><w:t>Missing parent target</w:t></w:r></w:p><w:sectPr/></w:body></w:document>')
const inheritedStyles = '<x:styles xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><x:style x:type="paragraph" x:styleId="StyleA"><x:pPr><x:numPr><x:numId x:val="9"/></x:numPr></x:pPr></x:style><x:style x:type="paragraph" x:styleId="StyleB"><x:basedOn x:val="StyleA"/></x:style><x:style x:type="paragraph" x:styleId="StyleC"><x:basedOn x:val="StyleB"/></x:style><x:style x:type="paragraph" x:styleId="CycleA"><x:basedOn x:val="CycleB"/></x:style><x:style x:type="paragraph" x:styleId="CycleB"><x:basedOn x:val="CycleA"/></x:style><x:style x:type="paragraph" x:styleId="MissingParentChild"><x:basedOn x:val="NoSuchStyle"/></x:style></x:styles>'
inheritedZip.file('word/styles.xml', inheritedStyles)
const inheritedBytes = await inheritedZip.generateAsync({ type: 'arraybuffer' })
const inheritedBlocks = await buildBlockIndex(inheritedBytes)
const inheritedOperations = inheritedBlocks.filter((block) => ['Inherited target', 'Cycle target', 'Missing parent target'].includes(block.text)).map((block) => ({ anchorBlockId: block.blockId, operation: 'INSERT_BLOCK_AFTER' as const, finalText: `plain ${block.text}`, styleSourceBlockId: block.blockId }))
const inheritedOutput = await applyBlockOperations(inheritedBytes, inheritedOperations)
const inheritedOutputZip = await JSZip.loadAsync(inheritedOutput)
const inheritedXml = await inheritedOutputZip.file('word/document.xml')!.async('string')
const inheritedInserted = inheritedXml.match(/<w:p>(?:(?!<w:p>).)*?plain Inherited target(?:(?!<w:p>).)*?<\/w:p>/s)?.[0] ?? ''
const cycleInserted = inheritedXml.match(/<w:p>(?:(?!<w:p>).)*?plain Cycle target(?:(?!<w:p>).)*?<\/w:p>/s)?.[0] ?? ''
const missingParentInserted = inheritedXml.match(/<w:p>(?:(?!<w:p>).)*?plain Missing parent target(?:(?!<w:p>).)*?<\/w:p>/s)?.[0] ?? ''
assert.match(inheritedInserted, /<w:numPr><w:numId w:val="0"\/><\/w:numPr>/, 'alternate-prefix style and multi-level basedOn numbering are detected')
assert.doesNotMatch(cycleInserted, /<w:numPr\b/, 'a non-numbered basedOn cycle terminates without claiming numbering')
assert.doesNotMatch(missingParentInserted, /<w:numPr\b/, 'an unknown basedOn parent is not treated as numbered')
assert.equal(await inheritedOutputZip.file('word/styles.xml')!.async('string'), inheritedStyles, 'alternate-prefix source styles remain untouched')

const noStylesZip = new JSZip()
noStylesZip.file('word/document.xml', '<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>No styles source</w:t></w:r></w:p><w:sectPr/></w:body></w:document>')
const noStylesBytes = await noStylesZip.generateAsync({ type: 'arraybuffer' })
const noStylesBlocks = await buildBlockIndex(noStylesBytes)
const noStylesOutput = await applyBlockOperations(noStylesBytes, [{ anchorBlockId: noStylesBlocks[0]!.blockId, operation: 'INSERT_BLOCK_AFTER', finalText: 'No styles insertion', styleSourceBlockId: noStylesBlocks[0]!.blockId }])
assert.ok((await buildBlockIndex(noStylesOutput)).some((block) => block.text === 'No styles insertion'), 'missing styles.xml is safe')

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

// Uncached fields remain opaque OOXML at deterministic boundaries. Their
// field instructions are never interpreted or replaced with static text.
async function editUncachedField(part: 'body' | 'header' | 'footer', paragraph: string, finalText: string) {
  const uncachedZip = new JSZip()
  const path = part === 'body' ? 'word/document.xml' : `word/${part}1.xml`
  const root = part === 'body' ? `<w:document xmlns:w="urn:w"><w:body>${paragraph}<w:sectPr/></w:body></w:document>`
    : part === 'header' ? `<w:hdr xmlns:w="urn:w">${paragraph}</w:hdr>` : `<w:ftr xmlns:w="urn:w">${paragraph}</w:ftr>`
  uncachedZip.file(path, root)
  const input = await uncachedZip.generateAsync({ type: 'arraybuffer' })
  const block = (await buildBlockIndex(input)).find((candidate) => candidate.part === path)!
  const output = await applyBlockOperations(input, [{ blockId: block.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText }])
  const resultZip = await JSZip.loadAsync(output)
  return { output, xml: await resultZip.file(path)!.async('string'), blocks: await buildBlockIndex(output), blockId: block.blockId }
}

const exactCase04Page = '<w:fldSimple w:instr="PAGE"/>'
const case04UncachedFooter = await editUncachedField('footer',
  `<w:p><w:r><w:t xml:space="preserve">LUMEN STORIES  •  Umowa nr 18/2027  |  </w:t></w:r>${exactCase04Page}</w:p>`,
  'LUMEN STORIES  •  Umowa nr 01/2028  |  ')
assert.ok(case04UncachedFooter.blocks.some((block) => block.text === 'LUMEN STORIES  •  Umowa nr 01/2028  |  '))
assert.doesNotMatch(case04UncachedFooter.xml, /18\/2027/)
assert.match(case04UncachedFooter.xml, /<w:fldSimple w:instr="PAGE"\/>/)
assert.equal((case04UncachedFooter.xml.match(/<w:fldSimple w:instr="PAGE"\/>/g) ?? []).length, 1)
assert.doesNotMatch(case04UncachedFooter.xml, /<w:fldSimple w:instr="PAGE"[^>]*>[\s\S]*?<w:t/)

const uncachedBody = await editUncachedField('body',
  `<w:p><w:r><w:t xml:space="preserve">Body label </w:t></w:r>${exactCase04Page}</w:p>`, 'Changed body label ')
assert.match(uncachedBody.xml, /<w:fldSimple w:instr="PAGE"\/>/)
const uncachedHeader = await editUncachedField('header',
  `<w:p>${exactCase04Page}<w:r><w:t xml:space="preserve"> header label</w:t></w:r></w:p>`, 'header label revised')
assert.match(uncachedHeader.xml, /<w:fldSimple w:instr="PAGE"\/>/)
assert.ok(uncachedHeader.blocks.some((block) => block.kind === 'header' && block.text === 'header label revised'))

const uncachedBetweenText = await editUncachedField('body',
  `<w:p><w:r><w:t xml:space="preserve">prefix Left</w:t></w:r>${exactCase04Page}<w:r><w:t xml:space="preserve"> Right suffix</w:t></w:r></w:p>`,
  'Edited prefix Left Right suffix')
assert.match(uncachedBetweenText.xml, /Edited prefix Left[\s\S]*<w:fldSimple w:instr="PAGE"\/>[\s\S]*Right suffix/)

const uncachedComplexXml = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> REF _Ref1 </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>'
const uncachedComplex = await editUncachedField('body', `<w:p><w:r><w:t>Complex </w:t></w:r>${uncachedComplexXml}</w:p>`, 'Complex revised ')
assert.ok(uncachedComplex.xml.includes(uncachedComplexXml), 'an uncached complex field region is preserved verbatim')
const multipleUncached = await editUncachedField('body',
  `<w:p><w:r><w:t>A</w:t></w:r>${exactCase04Page}<w:r><w:t>B</w:t></w:r><w:fldSimple w:instr="REF _Ref2"/><w:r><w:t>C end</w:t></w:r></w:p>`,
  'Edited ABC end')
assert.ok(multipleUncached.xml.indexOf(exactCase04Page) < multipleUncached.xml.indexOf('<w:fldSimple w:instr="REF _Ref2"/>'), 'multiple uncached fields retain source order')
const adjacentUncached = await editUncachedField('body',
  `<w:p><w:r><w:t>Left</w:t></w:r>${exactCase04Page}<w:fldSimple w:instr="REF _Ref3"/><w:r><w:t>Right</w:t></w:r></w:p>`,
  'Edited LeftRight')
assert.ok(adjacentUncached.xml.indexOf(exactCase04Page) < adjacentUncached.xml.indexOf('<w:fldSimple w:instr="REF _Ref3"/>'))
assert.match(adjacentUncached.xml, /Left[\s\S]*<w:fldSimple w:instr="PAGE"\/><w:fldSimple w:instr="REF _Ref3"\/>[\s\S]*Right/)

const mixedUncachedAndCached = await editUncachedField('body',
  `<w:p><w:r><w:t>Left</w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>${exactCase04Page}<w:r><w:t>Right</w:t></w:r></w:p>`,
  'Left1Right')
assert.match(mixedUncachedAndCached.xml, /<w:fldSimple w:instr="PAGE"><w:r><w:t>1<\/w:t><\/w:r><\/w:fldSimple><w:fldSimple w:instr="PAGE"\/>/)

const ambiguousZip = new JSZip()
ambiguousZip.file('word/document.xml', `<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Left</w:t></w:r>${exactCase04Page}<w:r><w:t>Right</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`)
const ambiguousBytes = await ambiguousZip.generateAsync({ type: 'arraybuffer' })
const ambiguousBlock = (await buildBlockIndex(ambiguousBytes))[0]!
await assert.rejects(() => applyBlockOperations(ambiguousBytes, [{ blockId: ambiguousBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Left changed Right' }]), /cannot be mapped|safely map|ambiguous/i, 'the editor rejects a changed two-sided boundary that cannot be located exactly')

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
const fixtureDocumentBlocks = fixtureBlocks.filter((block) => block.part === 'word/document.xml')
assert.equal(fixtureDocumentBlocks.length, 55, 'the XML-aware editor indexes every actual source paragraph exactly once')
assert.equal(new Set(fixtureDocumentBlocks.map((block) => block.blockId)).size, 55, 'all source paragraph IDs are unique')
assert.equal(fixtureDocumentBlocks.find((block) => block.blockId === 'word/document.xml#p23')?.text, 'Para młoda', 'the first historical signature block ID still maps to its exact paragraph')
assert.equal(fixtureDocumentBlocks.find((block) => block.blockId === 'word/document.xml#p44')?.text, 'Para młoda', 'the second historical signature block ID still maps to its exact paragraph')
const fixtureZip = await JSZip.loadAsync(fixtureBuffer)
const fixtureDoc = await fixtureZip.file('word/document.xml')!.async('string')
assert.equal((fixtureDoc.match(/<w:tbl\b/g) ?? []).length, 2)
assert.equal((fixtureDoc.match(/<w:tr\b/g) ?? []).length, 4)
assert.equal((fixtureDoc.match(/<w:tc\b/g) ?? []).length, 12)
assert.equal((fixtureDoc.match(/<w:trHeight w:val="564"/g) ?? []).length, 2, 'the two signature spacer rows are present in the source')

// Regression from the exact production template source: w:tab inside w:pPr/w:tabs
// is a tab stop, not visible paragraph text. Nine local edits to tab-stop
// paragraphs must be planned and applied together against this original DOCX.
const fixtureParagraphXml = [...fixtureDoc.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => match[0])
const tabStopTargets = fixtureDocumentBlocks.filter((block) => block.kind === 'body'
  && block.text.length >= 10
  && /<w:tabs\b/.test(fixtureParagraphXml[block.index] ?? '')).slice(0, 9)
assert.equal(tabStopTargets.length, 9, 'the physical source fixture supplies nine body paragraphs with tab-stop formatting')
const nineTabStopOperations = tabStopTargets.map((block, index) => index < 5
  ? { blockId: block.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: `Synthetic source-copy replacement ${index + 1}` }
  : { anchorBlockId: block.blockId, operation: 'INSERT_BLOCK_AFTER' as const, styleSourceBlockId: block.blockId, finalText: `Synthetic localized insertion ${index + 1}` })
const nineTabStopCandidateBytes = await applyBlockOperations(fixtureBuffer, nineTabStopOperations)
const fixtureSourceDocument = await readSource(fixtureBuffer, 'production-source-local-copy.docx')
const nineTabStopCandidate = await readSource(nineTabStopCandidateBytes, 'synthetic-nine-edit-candidate.docx')
assert.deepEqual(await validateOptionBCandidate(fixtureBuffer, nineTabStopCandidateBytes, fixtureSourceDocument, nineTabStopCandidate, nineTabStopOperations), [], 'a nine-operation batch on the exact physical source passes existing candidate validation')
assert.ok(nineTabStopCandidate.blocks.some((block) => block.text === 'Synthetic source-copy replacement 1'))
assert.ok(nineTabStopCandidate.blocks.some((block) => block.text === 'Synthetic source-copy replacement 5'))
assert.ok(nineTabStopCandidate.blocks.some((block) => block.text === 'Synthetic localized insertion 6'))
assert.ok(nineTabStopCandidate.blocks.some((block) => block.text === 'Synthetic localized insertion 9'))
const nineCandidateZip = await JSZip.loadAsync(nineTabStopCandidateBytes)
const nineCandidateDoc = await nineCandidateZip.file('word/document.xml')!.async('string')
assert.equal((nineCandidateDoc.match(/<w:tbl\b/g) ?? []).length, 2, 'the nine-edit batch preserves both source tables')
assert.equal((nineCandidateDoc.match(/<w:tr\b/g) ?? []).length, 4, 'the nine-edit batch preserves source table rows')

// Unresolvable source IDs and duplicate replacements fail closed.
await assert.rejects(() => applyBlockOperations(fixtureBuffer, [{ blockId: 'word/document.xml#p9999', operation: 'REPLACE_BLOCK_TEXT', finalText: 'Synthetic missing target' }]), /Unknown DOCX block/)
await assert.rejects(() => applyBlockOperations(fixtureBuffer, [
  { blockId: fixtureDocumentBlocks[0]!.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Synthetic first replacement' },
  { blockId: fixtureDocumentBlocks[0]!.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Synthetic conflicting replacement' },
]), /Conflicting DOCX block replacements are ambiguous/)

const signatureOnly = await applyBlockOperations(fixtureBuffer, [
  { blockId: 'word/document.xml#p23', operation: 'REPLACE_BLOCK_TEXT', finalText: 'Julia Kanicka i Maksymilian Ruth' },
  { blockId: 'word/document.xml#p44', operation: 'REPLACE_BLOCK_TEXT', finalText: 'Julia Kanicka i Maksymilian Ruth' },
])
const signatureZip = await JSZip.loadAsync(signatureOnly)
const signatureDoc = await signatureZip.file('word/document.xml')!.async('string')
const signatureBlocks = (await buildBlockIndex(signatureOnly)).filter((block) => block.part === 'word/document.xml')
assert.equal(signatureBlocks.length, 55, 'signature edits leave unrelated blank paragraphs and source structure untouched')
assert.equal((signatureDoc.match(/<w:tbl\b/g) ?? []).length, 2, 'both signature tables remain')
assert.equal((signatureDoc.match(/<w:tr\b/g) ?? []).length, 4, 'both blank spacer rows and both signature-label rows remain')
assert.equal((signatureDoc.match(/<w:tc\b/g) ?? []).length, 12, 'all signature table cells remain')
assert.equal((signatureDoc.match(/<w:trHeight w:val="564"/g) ?? []).length, 2, 'both original spacer-row properties remain')
assert.equal((signatureBlocks.filter((block) => block.text === 'Julia Kanicka i Maksymilian Ruth').length), 2, 'both signature client labels are replaced')
assert.equal((signatureBlocks.filter((block) => block.text === 'Filmowiec').length), 2, 'both signature videographer labels remain')
assert.equal((signatureBlocks.filter((block) => block.text === 'Para młoda').length), 0, 'the old client labels are gone')
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

// Editing leaves unrelated blank layout paragraphs untouched.
const layoutZip = new JSZip()
layoutZip.file('word/document.xml', '<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Edited clause</w:t></w:r></w:p><w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="522"/></w:tabs></w:pPr><w:r><w:t></w:t></w:r></w:p><w:p><w:r><w:t></w:t></w:r></w:p><w:p><w:pPr><w:pageBreakBefore w:val="1"/></w:pPr><w:r><w:t>§ 2</w:t></w:r></w:p><w:sectPr/></w:body></w:document>')
const layoutBytes = await layoutZip.generateAsync({ type: 'arraybuffer' })
const layoutBlocks = await buildBlockIndex(layoutBytes)
const layoutEdited = await applyBlockOperations(layoutBytes, [{ blockId: layoutBlocks[0]!.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Edited clause updated' }])
const layoutEditedZip = await JSZip.loadAsync(layoutEdited)
const layoutXml = await layoutEditedZip.file('word/document.xml')!.async('string')
const beforeSectionBreak = layoutXml.slice(0, layoutXml.indexOf('<w:pageBreakBefore'))
assert.equal((beforeSectionBreak.match(/<w:p\b/g) ?? []).length - 1, 3, 'both authored blank paragraphs remain before the explicit page break')
assert.match(layoutXml, /<w:pageBreakBefore w:val="1"\/>/, 'the authored §2 page break is preserved')

console.log('PASS block DOCX editor: whole contextual edits, package preservation, explicit insertion style, tables, signatures, header/footer')
