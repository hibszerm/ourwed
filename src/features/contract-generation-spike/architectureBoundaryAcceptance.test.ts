import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { applyBlockOperations } from './blockDocxEditor'
import { buildContractGenerationInput, type ContractGenerationInputOptions } from './contractGenerationInput'
import {
  applyOptionBGenerationResponse,
  createGenerationSourceView,
  readSource,
  validateOptionBCandidate,
  validateOptionBInput,
} from './generator'

function p(text: string): string { return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>` }
async function minimalPackage(body: string): Promise<ArrayBuffer> {
  const zip = new JSZip()
  const cells = (start: number) => `<w:tr>${[0, 1, 2].map((offset) => `<w:tc><w:tcPr/>${p(`cell ${start + offset}`)}</w:tc>`).join('')}</w:tr>`
  const tables = `<w:tbl>${cells(0)}${cells(3)}</w:tbl><w:tbl>${cells(6)}${cells(9)}</w:tbl>`
  zip.file('[Content_Types].xml', '<Types/>')
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${tables}<w:sectPr/></w:body></w:document>`)
  return zip.generateAsync({ type: 'arraybuffer' })
}

const fixture = JSON.parse(await readFile(new URL('./multi-template-acceptance/cases/case-04-realistic-wedding-photographer/input.json', import.meta.url), 'utf8')) as { authoritativeInput: ContractGenerationInputOptions }
const authority = buildContractGenerationInput(fixture.authoritativeInput)
assert.deepEqual(validateOptionBInput(authority), [], 'valid normalized input and derived amounts pass')
const badArithmetic = structuredClone(authority)
badArithmetic.commercial.remainingAfterDeposit.value += 1
assert.ok(validateOptionBInput(badArithmetic).some((issue) => /remainingAfterDeposit/.test(issue)), 'incorrect deterministic arithmetic still fails')

const sourceBytes = await minimalPackage(`${p('Clients: Old Names and Old Names')}${p('Place: Old City')}${p('Keep this unrelated paragraph.')}`)
const sourceBytesBefore = new Uint8Array(sourceBytes).slice()
const source = await readSource(sourceBytes, 'source.docx')
const sourceView = createGenerationSourceView(source)
assert.ok(sourceView.blocks.every((block) => !block.blockId.includes('word/') && !/#p\d+/.test(block.blockId)), 'generation sees opaque IDs')
const nameBlock = source.blocks.find((block) => block.text.startsWith('Clients:'))!
const placeBlock = source.blocks.find((block) => block.text.startsWith('Place:'))!
const handleFor = (blockId: string) => [...sourceView.sourceBlockIds].find(([, id]) => id === blockId)![0]

const ready = await applyOptionBGenerationResponse(sourceBytes, source, authority, sourceView.sourceBlockIds, {
  status: 'READY',
  edits: [
    { kind: 'replace', blockId: handleFor(nameBlock.blockId), text: 'Clients: Lena Nowicka and Lena Nowicka' },
    { kind: 'replace', blockId: handleFor(placeBlock.blockId), text: 'Place: in Krakowie' },
    { kind: 'insert_after', blockId: handleFor(nameBlock.blockId), text: 'Authorized additional service.' },
  ],
})
assert.equal(ready.status, 'READY')
if (ready.status === 'READY') {
  assert.equal(ready.changedBlocks.length, 3, 'mechanical diff contains two replacements and one insertion')
  assert.ok(ready.changedBlocks.some((item) => item.candidateText === 'Clients: Lena Nowicka and Lena Nowicka'), 'repeated source text is accepted without occurrence resolution')
  assert.ok(ready.changedBlocks.some((item) => item.candidateText === 'Place: in Krakowie'), 'natural inflection is not compared literally to CRM display form')
  assert.equal(ready.candidate.blocks.find((block) => block.blockId.endsWith(`#p${nameBlock.index + 1}`))?.text, 'Authorized additional service.', 'insertion may follow a block that is also replaced')
  assert.ok(ready.candidate.blocks.some((block) => block.text === 'Keep this unrelated paragraph.'), 'unaffected source blocks remain unchanged')
  const sourceZip = await JSZip.loadAsync(sourceBytes)
  const candidateZip = await JSZip.loadAsync(ready.candidateBytes)
  const cellCount = async (zip: JSZip) => (await zip.file('word/document.xml')!.async('string')).match(/<w:tc\b/g)?.length
  assert.equal(await cellCount(candidateZip), await cellCount(sourceZip), 'both signature table structures remain intact')

  const damagedZip = await JSZip.loadAsync(ready.candidateBytes)
  const document = await damagedZip.file('word/document.xml')!.async('string')
  damagedZip.file('word/document.xml', document.replace(/<w:tc>[\s\S]*?<\/w:tc>/, ''))
  const damagedBytes = await damagedZip.generateAsync({ type: 'arraybuffer' })
  const damaged = await readSource(damagedBytes, 'damaged.docx')
  assert.ok((await validateOptionBCandidate(sourceBytes, damagedBytes, source, damaged, [
    { operation: 'REPLACE_BLOCK_TEXT', blockId: nameBlock.blockId, finalText: 'Clients: Lena Nowicka and Lena Nowicka' },
    { operation: 'REPLACE_BLOCK_TEXT', blockId: placeBlock.blockId, finalText: 'Place: in Krakowie' },
    { operation: 'INSERT_BLOCK_AFTER', anchorBlockId: nameBlock.blockId, styleSourceBlockId: nameBlock.blockId, finalText: 'Authorized additional service.' },
  ])).some((issue) => /Table row\/cell structure changed/.test(issue)), 'structural damage remains a hard failure')
}

const missingInput = { id: 'opaque-requirement-1', label: 'Required contact email', answerKind: 'email' as const, subject: { participantKey: 'partner1' } }
const missing = await applyOptionBGenerationResponse(sourceBytes, source, authority, sourceView.sourceBlockIds, { status: 'MISSING_INPUT', missingInputs: [missingInput] })
assert.deepEqual(missing, { status: 'MISSING_INPUT', missingInputs: [missingInput] }, 'structured missing questions are preserved without creating a candidate')
const unknownSubject = await applyOptionBGenerationResponse(sourceBytes, source, authority, sourceView.sourceBlockIds, {
  status: 'MISSING_INPUT',
  missingInputs: [{ ...missingInput, subject: { participantKey: 'not-in-normalized-authority' } }],
})
assert.equal(unknownSubject.status, 'FAILED', 'unknown subject identities fail at the authority boundary')
const conflict = await applyOptionBGenerationResponse(sourceBytes, source, authority, sourceView.sourceBlockIds, { status: 'CONFLICT_INPUT', conflicts: ['Two authoritative dates disagree.'] })
assert.deepEqual(conflict, { status: 'CONFLICT_INPUT', conflicts: ['Two authoritative dates disagree.'] }, 'conflicts are preserved without creating a candidate')
assert.deepEqual(new Uint8Array(sourceBytes), sourceBytesBefore, 'non-READY results do not mutate the source bytes')
const invalidTarget = await applyOptionBGenerationResponse(sourceBytes, source, authority, sourceView.sourceBlockIds, { status: 'READY', edits: [{ kind: 'replace', blockId: 'unknown-handle', text: 'Unsafe edit.' }] })
assert.equal(invalidTarget.status, 'FAILED', 'unknown block IDs fail mechanically')
const invalidZip = await validateOptionBCandidate(sourceBytes, new Uint8Array([1, 2, 3]).buffer, source, source, [])
assert.deepEqual(invalidZip, ['Cannot open source or candidate DOCX ZIP package'], 'corrupt candidate archives remain a hard failure')

// The frozen XML-aware block editor continues to preserve table cells on a source copy.
const directCandidate = await applyBlockOperations(sourceBytes, [])
assert.deepEqual(await validateOptionBCandidate(sourceBytes, directCandidate, source, await readSource(directCandidate, 'copy.docx'), []), [])
const unauthorizedZip = await JSZip.loadAsync(directCandidate)
const originalXml = await unauthorizedZip.file('word/document.xml')!.async('string')
unauthorizedZip.file('word/document.xml', originalXml.replace('Keep this unrelated paragraph.', 'Unrequested alteration.'))
const unauthorizedBytes = await unauthorizedZip.generateAsync({ type: 'arraybuffer' })
assert.ok((await validateOptionBCandidate(sourceBytes, unauthorizedBytes, source, await readSource(unauthorizedBytes, 'unauthorized.docx'), [])).some((issue) => /Final document content differs/.test(issue)), 'changes outside requested edits fail final-content validation')
console.log('PASS generic Option B generation architecture boundary acceptance')
