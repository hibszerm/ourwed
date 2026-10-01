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

const sourceBytes = await docx('Source paragraph.')
const source = await readSource(sourceBytes, 'source.docx')
const block = source.blocks[0]!
const operation = { operation: 'REPLACE_BLOCK_TEXT' as const, blockId: block.blockId, finalText: 'Updated paragraph.' }
const candidateBytes = await applyBlockOperations(sourceBytes, [operation])
const candidate = await readSource(candidateBytes, 'candidate.docx')
assert.deepEqual(await validateOptionBCandidate(sourceBytes, candidateBytes, source, candidate, [operation]), [])

const corrupted = await validateOptionBCandidate(sourceBytes, new Uint8Array([1, 2, 3]).buffer, source, source, [])
assert.deepEqual(corrupted, ['Cannot open source or candidate DOCX ZIP package'])

const unauthorizedBytes = await docx('Unrequested paragraph.')
const unauthorized = await readSource(unauthorizedBytes, 'unauthorized.docx')
assert.ok((await validateOptionBCandidate(sourceBytes, unauthorizedBytes, source, unauthorized, [])).some((issue) => /unrequested text change/.test(issue)))

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
assert.ok(unapplied.some((issue) => /Requested block replacement was not applied exactly/.test(issue)), 'a requested real replacement fails when the candidate remains at the source state')

const wrongReplacementBytes = await docx('123')
const wrongReplacement = await readSource(wrongReplacementBytes, 'wrong-replacement.docx')
const wrongReplacementFindings = await validateOptionBCandidate(noOpBytes, wrongReplacementBytes, noOpSource, wrongReplacement, [{ ...noOp, finalText: 'XYZ' }])
assert.ok(wrongReplacementFindings.some((issue) => /Requested block replacement was not applied exactly/.test(issue)), 'a candidate with the wrong replacement text fails')

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
assert.ok(unauthorizedSecondBlockFindings.some((issue) => /unrequested text change/.test(issue)), 'an unrelated changed source block remains unauthorized')

const lostBlockBytes = await docx('Block A')
const lostBlock = await readSource(lostBlockBytes, 'lost-block.docx')
const lostBlockFindings = await validateOptionBCandidate(twoBlockSourceBytes, lostBlockBytes, twoBlockSource, lostBlock, [])
assert.ok(lostBlockFindings.some((issue) => /Paragraph structure changed unexpectedly|unrequested text change/.test(issue)), 'an unexpected source-block loss remains a hard failure')

const insertionSourceBytes = await docx('Anchor')
const insertionSource = await readSource(insertionSourceBytes, 'insertion-source.docx')
const insertion = { operation: 'INSERT_BLOCK_AFTER' as const, anchorBlockId: insertionSource.blocks[0]!.blockId, styleSourceBlockId: insertionSource.blocks[0]!.blockId, finalText: 'Authorized insertion' }
const insertedBytes = await applyBlockOperations(insertionSourceBytes, [insertion])
const inserted = await readSource(insertedBytes, 'inserted.docx')
assert.deepEqual(await validateOptionBCandidate(insertionSourceBytes, insertedBytes, insertionSource, inserted, [insertion]), [], 'a requested insert_after remains accepted')
const missingInsertionFindings = await validateOptionBCandidate(insertionSourceBytes, insertionSourceBytes, insertionSource, insertionSource, [insertion])
assert.ok(missingInsertionFindings.some((issue) => /Requested block insertion was not applied exactly/.test(issue)), 'a missing requested insert_after fails')
const unexpectedInsertionBytes = await docx('Anchor', 'Unrequested insertion')
const unexpectedInsertion = await readSource(unexpectedInsertionBytes, 'unexpected-insertion.docx')
const unexpectedInsertionFindings = await validateOptionBCandidate(insertionSourceBytes, unexpectedInsertionBytes, insertionSource, unexpectedInsertion, [])
assert.ok(unexpectedInsertionFindings.some((issue) => /unrequested text change/.test(issue)), 'an unrequested candidate-only block remains unauthorized')

console.log('PASS source-driven mechanical candidate validation')
