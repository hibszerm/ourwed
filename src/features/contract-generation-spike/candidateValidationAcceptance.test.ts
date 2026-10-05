import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { applyBlockOperations } from './blockDocxEditor'
import { readSource, validateOptionBCandidate } from './generator'

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function paragraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

async function docx(...texts: string[]): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${texts.map(paragraph).join('')}<w:sectPr/></w:body></w:document>`)
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function docxXml(body: string): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`)
  return zip.generateAsync({ type: 'arraybuffer' })
}

const sourceBytes = await docx('Source paragraph.')
const source = await readSource(sourceBytes, 'source.docx')
const block = source.blocks[0]!
const operation = { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: block.blockId, finalText: 'Updated paragraph.' }
const candidateBytes = await applyBlockOperations(sourceBytes, [operation])
const candidate = await readSource(candidateBytes, 'candidate.docx')
assert.deepEqual(await validateOptionBCandidate(sourceBytes, candidateBytes, source, candidate, [operation]), [])

const multiRunBytes = await docxXml('<w:p><w:r><w:t>Original </w:t></w:r><w:r><w:t>sentence.</w:t></w:r></w:p>')
const multiRunSource = await readSource(multiRunBytes, 'multi-run-source.docx')
const multiRunEdit = { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: multiRunSource.blocks[0]!.blockId, finalText: 'A substantially longer replacement sentence that can naturally reflow across lines.' }
const multiRunCandidateBytes = await applyBlockOperations(multiRunBytes, [multiRunEdit])
const multiRunCandidate = await readSource(multiRunCandidateBytes, 'multi-run-candidate.docx')
assert.deepEqual(await validateOptionBCandidate(multiRunBytes, multiRunCandidateBytes, multiRunSource, multiRunCandidate, [multiRunEdit]), [], 'multi-run replacement and longer natural reflow pass without preserving original run segmentation')
assert.equal(multiRunCandidate.blocks[0]!.text, multiRunEdit.finalText)

// A source tab after a paragraph marker is structural input to the editor's
// formatting strategy, but a full-block replacement must follow the requested
// text rather than reintroducing a separator omitted by that replacement.
const markerTabBytes = await docxXml('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>2.</w:t><w:tab/></w:r><w:r><w:t>Old body</w:t></w:r></w:p><w:p><w:r><w:t>Unchanged neighboring paragraph</w:t></w:r></w:p>')
const markerTabSource = await readSource(markerTabBytes, 'marker-tab-source.docx')
const markerTabEdit = { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: markerTabSource.blocks[0]!.blockId, finalText: '2.Replacement body' }
const markerTabCandidateBytes = await applyBlockOperations(markerTabBytes, [markerTabEdit])
const markerTabCandidate = await readSource(markerTabCandidateBytes, 'marker-tab-candidate.docx')
assert.equal(markerTabSource.blocks[0]!.text, '2. Old body', 'the synthetic source target is found with its canonical tab separator')
assert.equal(markerTabCandidate.blocks[0]!.text, markerTabEdit.finalText, 'a full-block replacement emits exactly the requested canonical text')
assert.equal(markerTabCandidate.blocks[1]!.text, markerTabSource.blocks[1]!.text, 'unrelated body paragraphs remain unchanged')
assert.deepEqual(await validateOptionBCandidate(markerTabBytes, markerTabCandidateBytes, markerTabSource, markerTabCandidate, [markerTabEdit]), [], 'the previously missing requested edit passes mechanical validation')

const markerBreakBytes = await docxXml('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>3.</w:t><w:br/></w:r><w:r><w:t>Old body</w:t></w:r></w:p>')
const markerBreakSource = await readSource(markerBreakBytes, 'marker-break-source.docx')
const markerBreakEdit = { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: markerBreakSource.blocks[0]!.blockId, finalText: '3.Replacement body' }
const markerBreakCandidate = await readSource(await applyBlockOperations(markerBreakBytes, [markerBreakEdit]), 'marker-break-candidate.docx')
assert.equal(markerBreakCandidate.blocks[0]!.text, markerBreakEdit.finalText, 'a source line break is not reintroduced when absent from the requested replacement')

const whitespaceEdit = { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: markerTabSource.blocks[1]!.blockId, finalText: '  Leading\tinternal\nspacing  ' }
const whitespaceCandidateBytes = await applyBlockOperations(markerTabBytes, [whitespaceEdit])
const whitespaceCandidate = await readSource(whitespaceCandidateBytes, 'whitespace-candidate.docx')
assert.equal(whitespaceCandidate.blocks[1]!.text, '  Leading internal spacing  ', 'leading, trailing, tab, and line-break whitespace follows the shared canonicalization contract')

const countSourceBytes = await docx('Visible content.', '')
const countSource = await readSource(countSourceBytes, 'count-source.docx')
const fewerParagraphsBytes = await docx('Visible content.')
const fewerParagraphs = await readSource(fewerParagraphsBytes, 'fewer-paragraphs.docx')
assert.deepEqual(await validateOptionBCandidate(countSourceBytes, fewerParagraphsBytes, countSource, fewerParagraphs, []), [], 'removing a blank paragraph is harmless and does not fail on paragraph count alone')

const corrupted = await validateOptionBCandidate(sourceBytes, new Uint8Array([1, 2, 3]).buffer, source, source, [])
assert.deepEqual(corrupted, ['Cannot open source or candidate DOCX ZIP package'])

const missingCoreZip = new JSZip()
missingCoreZip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>')
const missingCoreBytes = await missingCoreZip.generateAsync({ type: 'arraybuffer' })
const missingCore = await validateOptionBCandidate(sourceBytes, missingCoreBytes, source, await readSource(missingCoreBytes, 'missing-core.docx'), [])
assert.ok(missingCore.includes('Candidate DOCX is missing a required package part.'), 'missing required candidate package parts remain blocking')

const unauthorizedBytes = await docx('Unrequested paragraph.')
const unauthorized = await readSource(unauthorizedBytes, 'unauthorized.docx')
assert.ok((await validateOptionBCandidate(sourceBytes, unauthorizedBytes, source, unauthorized, [])).some((issue) => /Final document content differs/.test(issue)))

const canonicalSourceBytes = await docx('Vendor: „Wykonawcą”')
const canonicalSource = await readSource(canonicalSourceBytes, 'canonical-source.docx')
const canonicalReplace = { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: canonicalSource.blocks[0]!.blockId, finalText: 'Vendor: "Wykonawcą"' }
const canonicalCandidateBytes = await applyBlockOperations(canonicalSourceBytes, [canonicalReplace])
const canonicalCandidate = await readSource(canonicalCandidateBytes, 'canonical-candidate.docx')
assert.equal(canonicalCandidate.blocks[0]!.text, canonicalReplace.finalText, 'canonicalized candidate state contains the requested quote-normalized text')
assert.deepEqual(await validateOptionBCandidate(canonicalSourceBytes, canonicalCandidateBytes, canonicalSource, canonicalCandidate, [canonicalReplace]), [], 'canonical-equivalent source and requested text need not create a changed-block diff entry')

const noOpBytes = await docx('ABC')
const noOpSource = await readSource(noOpBytes, 'no-op-source.docx')
const noOp = { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: noOpSource.blocks[0]!.blockId, finalText: 'ABC' }
const noOpCandidateBytes = await applyBlockOperations(noOpBytes, [noOp])
const noOpCandidate = await readSource(noOpCandidateBytes, 'no-op-candidate.docx')
assert.deepEqual(await validateOptionBCandidate(noOpBytes, noOpCandidateBytes, noOpSource, noOpCandidate, [noOp]), [], 'an exact no-op replacement passes when its requested final state is present')

const unapplied = await validateOptionBCandidate(noOpBytes, noOpBytes, noOpSource, noOpSource, [{ ...noOp, finalText: 'XYZ' }])
assert.ok(unapplied.some((issue) => /requested change is not represented/.test(issue)), 'a requested real replacement fails when the candidate remains at the source state')

const wrongReplacementBytes = await docx('123')
const wrongReplacement = await readSource(wrongReplacementBytes, 'wrong-replacement.docx')
const wrongReplacementFindings = await validateOptionBCandidate(noOpBytes, wrongReplacementBytes, noOpSource, wrongReplacement, [{ ...noOp, finalText: 'XYZ' }])
assert.ok(wrongReplacementFindings.some((issue) => /requested change is not represented/.test(issue)), 'a candidate with the wrong replacement text fails')

const twoBlockSourceBytes = await docx('Block A', 'Block B')
const twoBlockSource = await readSource(twoBlockSourceBytes, 'two-block-source.docx')
const replaceA = { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: twoBlockSource.blocks[0]!.blockId, finalText: 'Updated A' }
const updatedABytes = await applyBlockOperations(twoBlockSourceBytes, [replaceA])
const updatedAZip = await JSZip.loadAsync(updatedABytes)
const updatedAXml = await updatedAZip.file('word/document.xml')!.async('string')
updatedAZip.file('word/document.xml', updatedAXml.replace('Block B', 'Unrequested B'))
const unauthorizedSecondBlockBytes = await updatedAZip.generateAsync({ type: 'arraybuffer' })
const unauthorizedSecondBlock = await readSource(unauthorizedSecondBlockBytes, 'unauthorized-second-block.docx')
const unauthorizedSecondBlockFindings = await validateOptionBCandidate(twoBlockSourceBytes, unauthorizedSecondBlockBytes, twoBlockSource, unauthorizedSecondBlock, [replaceA])
assert.ok(unauthorizedSecondBlockFindings.some((issue) => /Final document content differs/.test(issue)), 'an unrelated changed source block remains unauthorized')

const lostBlockBytes = await docx('Block A')
const lostBlock = await readSource(lostBlockBytes, 'lost-block.docx')
const lostBlockFindings = await validateOptionBCandidate(twoBlockSourceBytes, lostBlockBytes, twoBlockSource, lostBlock, [])
assert.ok(lostBlockFindings.some((issue) => /Final document content differs/.test(issue)), 'material source-block loss remains a hard failure')

const insertionSourceBytes = await docx('Anchor')
const insertionSource = await readSource(insertionSourceBytes, 'insertion-source.docx')
const insertion = { operation: 'INSERT_BLOCK_AFTER' as const, anchorBlockId: insertionSource.blocks[0]!.blockId, styleSourceBlockId: insertionSource.blocks[0]!.blockId, finalText: 'Authorized insertion' }
const insertedBytes = await applyBlockOperations(insertionSourceBytes, [insertion])
const inserted = await readSource(insertedBytes, 'inserted.docx')
assert.deepEqual(await validateOptionBCandidate(insertionSourceBytes, insertedBytes, insertionSource, inserted, [insertion]), [], 'a requested insert_after remains accepted')
const missingInsertionFindings = await validateOptionBCandidate(insertionSourceBytes, insertionSourceBytes, insertionSource, insertionSource, [insertion])
assert.ok(missingInsertionFindings.some((issue) => /requested change is not represented/.test(issue)), 'a missing requested insert_after fails')
const unexpectedInsertionBytes = await docx('Anchor', 'Unrequested insertion')
const unexpectedInsertion = await readSource(unexpectedInsertionBytes, 'unexpected-insertion.docx')
const unexpectedInsertionFindings = await validateOptionBCandidate(insertionSourceBytes, unexpectedInsertionBytes, insertionSource, unexpectedInsertion, [])
assert.ok(unexpectedInsertionFindings.some((issue) => /Final document content differs/.test(issue)), 'an unrequested candidate-only block remains unauthorized')

// Multiple nearby source-relative edits and insertions are applied as one
// batch against the untouched source, so an earlier insertion cannot shift a
// later replacement target.
const nearbySourceBytes = await docx('Clause A old.', 'Clause B old.', 'Clause C unchanged.')
const nearbySource = await readSource(nearbySourceBytes, 'nearby-source.docx')
const nearbyOperations = [
  { operation: 'INSERT_BLOCK_AFTER' as const, anchorBlockId: nearbySource.blocks[0]!.blockId, styleSourceBlockId: nearbySource.blocks[0]!.blockId, finalText: 'Authorized extra.' },
  { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: nearbySource.blocks[1]!.blockId, finalText: 'Clause B current.' },
  { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: nearbySource.blocks[0]!.blockId, finalText: 'Clause A current.' },
]
const nearbyCandidateBytes = await applyBlockOperations(nearbySourceBytes, nearbyOperations)
const nearbyCandidate = await readSource(nearbyCandidateBytes, 'nearby-candidate.docx')
assert.deepEqual(await validateOptionBCandidate(nearbySourceBytes, nearbyCandidateBytes, nearbySource, nearbyCandidate, nearbyOperations), [], 'multiple nearby source-relative edits survive insertion and operation ordering')
assert.deepEqual(nearbyCandidate.blocks.map((item) => item.text), ['Clause A current.', 'Authorized extra.', 'Clause B current.', 'Clause C unchanged.'])

// Multiple operations on one original paragraph share one source-relative plan.
const sharedTargetBytes = await docx('Block A', 'Block B', 'Block C')
const sharedTargetSource = await readSource(sharedTargetBytes, 'shared-target-source.docx')
const sharedTarget = sharedTargetSource.blocks[1]!
const replaceAndInsert = [
  { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: sharedTarget.blockId, finalText: 'Block B replaced.' },
  { operation: 'INSERT_BLOCK_AFTER' as const, anchorBlockId: sharedTarget.blockId, styleSourceBlockId: sharedTarget.blockId, finalText: 'After Block B.' },
]
const replaceAndInsertBytes = await applyBlockOperations(sharedTargetBytes, replaceAndInsert)
const replaceAndInsertCandidate = await readSource(replaceAndInsertBytes, 'replace-and-insert-candidate.docx')
assert.deepEqual(replaceAndInsertCandidate.blocks.map((item) => item.text), ['Block A', 'Block B replaced.', 'After Block B.', 'Block C'], 'replace plus insert-after uses the same original block')
assert.deepEqual(await validateOptionBCandidate(sharedTargetBytes, replaceAndInsertBytes, sharedTargetSource, replaceAndInsertCandidate, replaceAndInsert), [])

const beforeReplaceAfter = [
  { operation: 'INSERT_BLOCK_BEFORE' as const, anchorBlockId: sharedTarget.blockId, styleSourceBlockId: sharedTarget.blockId, finalText: 'Before Block B.' },
  { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: sharedTarget.blockId, finalText: 'Block B replaced.' },
  { operation: 'INSERT_BLOCK_AFTER' as const, anchorBlockId: sharedTarget.blockId, styleSourceBlockId: sharedTarget.blockId, finalText: 'After Block B.' },
]
const beforeReplaceAfterBytes = await applyBlockOperations(sharedTargetBytes, beforeReplaceAfter)
const beforeReplaceAfterCandidate = await readSource(beforeReplaceAfterBytes, 'before-replace-after-candidate.docx')
assert.deepEqual(beforeReplaceAfterCandidate.blocks.map((item) => item.text), ['Block A', 'Before Block B.', 'Block B replaced.', 'After Block B.', 'Block C'], 'before, replace, and after retain deterministic source order on one original block')
assert.deepEqual(await validateOptionBCandidate(sharedTargetBytes, beforeReplaceAfterBytes, sharedTargetSource, beforeReplaceAfterCandidate, beforeReplaceAfter), [])

// Identical source text remains disambiguated by original paragraph identity,
// even when both occurrences are edited and an insertion shifts later content.
const duplicateTextBytes = await docx('Repeated source paragraph.', 'Repeated source paragraph.', 'Tail paragraph.')
const duplicateTextSource = await readSource(duplicateTextBytes, 'duplicate-text-source.docx')
const duplicateTextOperations = [
  { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: duplicateTextSource.blocks[1]!.blockId, finalText: 'Second occurrence updated.' },
  { operation: 'INSERT_BLOCK_AFTER' as const, anchorBlockId: duplicateTextSource.blocks[0]!.blockId, styleSourceBlockId: duplicateTextSource.blocks[0]!.blockId, finalText: 'Inserted between occurrences.' },
  { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: duplicateTextSource.blocks[0]!.blockId, finalText: 'First occurrence updated.' },
]
const duplicateTextCandidateBytes = await applyBlockOperations(duplicateTextBytes, duplicateTextOperations)
const duplicateTextCandidate = await readSource(duplicateTextCandidateBytes, 'duplicate-text-candidate.docx')
assert.deepEqual(duplicateTextCandidate.blocks.map((item) => item.text), ['First occurrence updated.', 'Inserted between occurrences.', 'Second occurrence updated.', 'Tail paragraph.'], 'duplicate text targets resolve by their original source identity')
assert.deepEqual(await validateOptionBCandidate(duplicateTextBytes, duplicateTextCandidateBytes, duplicateTextSource, duplicateTextCandidate, duplicateTextOperations), [])

// Paragraph count and run segmentation are not part of the logical-content
// contract. Splitting one authored paragraph into two text runs still passes.
const segmentedZip = await JSZip.loadAsync(candidateBytes)
const segmentedXml = await segmentedZip.file('word/document.xml')!.async('string')
segmentedZip.file('word/document.xml', segmentedXml.replace('Updated paragraph.', 'Updated </w:t></w:r><w:r><w:t>paragraph.'))
const segmentedBytes = await segmentedZip.generateAsync({ type: 'arraybuffer' })
const segmented = await readSource(segmentedBytes, 'segmented-candidate.docx')
assert.deepEqual(await validateOptionBCandidate(sourceBytes, segmentedBytes, source, segmented, [operation]), [], 'run and w:t segmentation differences do not block a correct final document')

// Blank paragraph variation is ignored, but material table changes still fail.
const withBlank = await docx('Source paragraph.', '', '')
const withBlankSource = await readSource(sourceBytes, 'blank-source.docx')
assert.deepEqual(await validateOptionBCandidate(sourceBytes, withBlank, withBlankSource, await readSource(withBlank, 'blank-candidate.docx'), []), [], 'additional blank paragraphs do not alter logical content')

const fieldSourceBytes = await docxXml('<w:p><w:r><w:t>Page </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>')
const fieldSource = await readSource(fieldSourceBytes, 'field-source.docx')
const fieldEdit = { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: fieldSource.blocks[0]!.blockId, finalText: 'Document page 1' }
const fieldCandidateBytes = await applyBlockOperations(fieldSourceBytes, [fieldEdit])
const fieldCandidate = await readSource(fieldCandidateBytes, 'field-candidate.docx')
assert.deepEqual(await validateOptionBCandidate(fieldSourceBytes, fieldCandidateBytes, fieldSource, fieldCandidate, [fieldEdit]), [], 'a localized edit preserves a material Word field')
const alteredFieldZip = await JSZip.loadAsync(fieldCandidateBytes)
const alteredFieldXml = await alteredFieldZip.file('word/document.xml')!.async('string')
alteredFieldZip.file('word/document.xml', alteredFieldXml.replace('w:instr="PAGE"', 'w:instr="DATE"'))
const alteredFieldBytes = await alteredFieldZip.generateAsync({ type: 'arraybuffer' })
const alteredField = await readSource(alteredFieldBytes, 'altered-field.docx')
assert.ok((await validateOptionBCandidate(fieldSourceBytes, alteredFieldBytes, fieldSource, alteredField, [fieldEdit])).some((issue) => /Word field instructions changed/.test(issue)), 'material field changes fail even when visible text is unchanged')

const tableSourceBytes = await docxXml('<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table label</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Table value</w:t></w:r></w:p></w:tc></w:tr></w:tbl>')
const tableSource = await readSource(tableSourceBytes, 'table-source.docx')
const tableEdit = { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: tableSource.blocks[1]!.blockId, finalText: 'Current table value' }
const tableCandidateBytes = await applyBlockOperations(tableSourceBytes, [tableEdit])
const tableCandidate = await readSource(tableCandidateBytes, 'table-candidate.docx')
assert.deepEqual(await validateOptionBCandidate(tableSourceBytes, tableCandidateBytes, tableSource, tableCandidate, [tableEdit]), [], 'table content can be locally updated while its material structure remains intact')
const damagedTableZip = await JSZip.loadAsync(tableCandidateBytes)
const damagedTableXml = await damagedTableZip.file('word/document.xml')!.async('string')
damagedTableZip.file('word/document.xml', damagedTableXml.replace('</w:tbl>', '<w:tr><w:tc><w:p><w:r><w:t>Unexpected row</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'))
const damagedTableBytes = await damagedTableZip.generateAsync({ type: 'arraybuffer' })
const damagedTable = await readSource(damagedTableBytes, 'damaged-table.docx')
assert.ok((await validateOptionBCandidate(tableSourceBytes, damagedTableBytes, tableSource, damagedTable, [tableEdit])).some((issue) => /Table row\/cell structure changed/.test(issue)), 'material table structure loss still fails closed')

console.log('PASS source-driven mechanical candidate validation')
