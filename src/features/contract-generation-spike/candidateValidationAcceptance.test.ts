import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { applyBlockOperations } from './blockDocxEditor'
import { readSource, validateOptionBCandidate } from './generator'

function paragraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

async function docx(text: string): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph(text)}<w:sectPr/></w:body></w:document>`)
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

console.log('PASS source-driven mechanical candidate validation')
