import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { makeInput, readSource, TRANSFORMATION_INSTRUCTIONS, validateAuthorityGate, type GenerationInput, type PlanResult, type SourceInventory } from './generator'
import type { BlockOperation } from './blockDocxEditor'

const paragraph = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
async function fixture(body: string, footer = '', header = '', subject = 'Old subject') {
  const zip = new JSZip()
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph(body)}<w:sectPr/></w:body></w:document>`)
  if (footer) zip.file('word/footer1.xml', `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${paragraph(footer)}</w:ftr>`)
  if (header) zip.file('word/header1.xml', `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${paragraph(header)}</w:hdr>`)
  zip.file('docProps/core.xml', `<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:subject>${subject}</dc:subject></cp:coreProperties>`)
  const bytes = await zip.generateAsync({ type: 'arraybuffer' })
  const source = await readSource(bytes, 'coverage.docx')
  const input = makeInput({
    generationDate: '04.02.2028', sourceDocument: source,
    wedding: { bride: { name: 'Klaudia Majewska', phone: '', email: '' }, groom: { name: 'Tomasz Domański', phone: '' }, weddingDate: '22.05.2028', contractAddress: '', contractValuePln: 10600, depositPln: 2000, remainingDueDate: '', locations: { bridePreparations: '', groomPreparations: '', ceremony: '', reception: '' } },
    packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [],
  })
  return { bytes, source, input }
}
function span(text: string, value: string) {
  const start = Array.from(text.slice(0, text.indexOf(value))).length
  return { start, end: start + Array.from(value).length }
}
const ready = (overrides: Partial<PlanResult> = {}): PlanResult => ({ status: 'READY', missingInputs: [], conflicts: [], factChanges: [], retainedLiterals: [], operations: [], ...overrides })
const replacement = (itemId: string, label: string) => ({ label, inventoryItemIds: [itemId], newValue: 'Klaudia Majewska', newValueFormat: 'literal' as const, authority: { kind: 'crm' as const, ref: 'wedding.bride.name' } })
const operation = (blockId: string): BlockOperation => ({ blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Klaudia Majewska' })

// Body replacement without an operation is rejected before candidate application.
const bodyCase = await fixture('Bride: Old Bride')
const bodyBlock = bodyCase.source.blocks.find((block) => block.part === 'word/document.xml')!
const bodyInventory: SourceInventory = { items: [{ id: 'body-name', label: 'bride name', occurrences: [{ sourceRef: bodyBlock.blockId, span: span(bodyBlock.text, 'Old Bride') }] }] }
const bodyPlan = ready({ factChanges: [replacement('body-name', 'bride name')] })
const bodyFindings = validateAuthorityGate(bodyCase.input, bodyInventory, bodyPlan)
assert.ok(bodyFindings.some((issue) => issue.includes(bodyBlock.blockId) && /no block operation/.test(issue)))
assert.deepEqual(validateAuthorityGate(bodyCase.input, bodyInventory, { ...bodyPlan, operations: [operation(bodyBlock.blockId)] }), [])

// Footer and header refs are indexed editable blocks and require operation coverage too.
const footerCase = await fixture('No change', 'Footer: Old Bride')
const footer = footerCase.source.blocks.find((block) => block.kind === 'footer')!
const footerInventory: SourceInventory = { items: [{ id: 'footer-name', label: 'footer name', occurrences: [{ sourceRef: footer.blockId, span: span(footer.text, 'Old Bride') }] }] }
const footerPlan = ready({ factChanges: [replacement('footer-name', 'footer name')] })
assert.ok(validateAuthorityGate(footerCase.input, footerInventory, footerPlan).some((issue) => issue.includes(footer.blockId) && /no block operation/.test(issue)))
assert.deepEqual(validateAuthorityGate(footerCase.input, footerInventory, { ...footerPlan, operations: [operation(footer.blockId)] }), [])
const headerCase = await fixture('No change', '', 'Header: Old Bride')
const header = headerCase.source.blocks.find((block) => block.kind === 'header')!
const headerInventory: SourceInventory = { items: [{ id: 'header-name', label: 'header name', occurrences: [{ sourceRef: header.blockId, span: span(header.text, 'Old Bride') }] }] }
assert.ok(validateAuthorityGate(headerCase.input, headerInventory, ready({ factChanges: [replacement('header-name', 'header name')] })).some((issue) => issue.includes(header.blockId) && /no block operation/.test(issue)))
assert.deepEqual(validateAuthorityGate(headerCase.input, headerInventory, ready({ factChanges: [replacement('header-name', 'header name')], operations: [operation(header.blockId)] })), [])

// Metadata-only replacements use the existing metadata path and do not require a block operation.
const metadataCase = await fixture('No change')
const subject = metadataCase.source.documentProperties!.find((property) => property.property === 'subject')!
const metadataInventory: SourceInventory = { items: [{ id: 'metadata-date', label: 'document date', occurrences: [{ sourceRef: subject.ref, span: null }] }] }
const metadataChange = { ...replacement('metadata-date', 'document date'), newValue: metadataCase.input.generationDate, authority: { kind: 'generation_date' as const, ref: 'generationDate' } }
assert.deepEqual(validateAuthorityGate(metadataCase.input, metadataInventory, ready({ factChanges: [metadataChange] })), [])

// One semantic item occurring in body, footer, and metadata needs only its editable blocks targeted.
const mixed = await fixture('Bride: Old Bride', 'Footer: Old Bride', '', 'Old Bride')
const mixedBody = mixed.source.blocks.find((block) => block.part === 'word/document.xml')!
const mixedFooter = mixed.source.blocks.find((block) => block.kind === 'footer')!
const mixedSubject = mixed.source.documentProperties!.find((property) => property.property === 'subject')!
const mixedInventory: SourceInventory = { items: [{ id: 'party-name', label: 'party name', occurrences: [
  { sourceRef: mixedBody.blockId, span: span(mixedBody.text, 'Old Bride') },
  { sourceRef: mixedFooter.blockId, span: span(mixedFooter.text, 'Old Bride') },
  { sourceRef: mixedSubject.ref, span: null },
] }] }
const mixedChange = replacement('party-name', 'party name')
assert.ok(validateAuthorityGate(mixed.input, mixedInventory, ready({ factChanges: [mixedChange], operations: [operation(mixedBody.blockId)] })).some((issue) => issue.includes(mixedFooter.blockId) && /no block operation/.test(issue)))
assert.deepEqual(validateAuthorityGate(mixed.input, mixedInventory, ready({ factChanges: [mixedChange], operations: [operation(mixedBody.blockId), operation(mixedFooter.blockId)] })), [])

// Separate factChanges in one paragraph are covered by one complete block rewrite; counts are not compared.
const shared = await fixture('Bride: Old Bride; partner: Old Partner')
const sharedBlock = shared.source.blocks.find((block) => block.part === 'word/document.xml')!
const sharedInventory: SourceInventory = { items: [
  { id: 'first-name', label: 'first party name', occurrences: [{ sourceRef: sharedBlock.blockId, span: span(sharedBlock.text, 'Old Bride') }] },
  { id: 'second-name', label: 'second party name', occurrences: [{ sourceRef: sharedBlock.blockId, span: span(sharedBlock.text, 'Old Partner') }] },
] }
const sharedPlan = ready({ factChanges: [replacement('first-name', 'first party name'), replacement('second-name', 'second party name')], operations: [operation(sharedBlock.blockId)] })
assert.deepEqual(validateAuthorityGate(shared.input, sharedInventory, sharedPlan), [])
assert.ok(sharedPlan.operations.length < sharedPlan.factChanges.length, 'one block rewrite legitimately covers multiple replacements')

// Authorized retentions do not require edit operations.
const retentionCase = await fixture('Reusable source term')
const retentionBlock = retentionCase.source.blocks.find((block) => block.part === 'word/document.xml')!
const retentionInventory: SourceInventory = { items: [{ id: 'reusable', label: 'reusable term', occurrences: [{ sourceRef: retentionBlock.blockId, span: null }] }] }
const retentionInput = makeInput({ ...retentionCase.input, userProvidedAnswers: [{ id: 'keep.term', value: 'Keep this term' }] })
const retentionPlan = ready({ retainedLiterals: [{ inventoryItemId: 'reusable', authority: { kind: 'user', ref: 'keep.term' }, reason: 'explicitly retained' }] })
assert.deepEqual(validateAuthorityGate(retentionInput, retentionInventory, retentionPlan), [])

// Non-READY plans and READY plans without replacements may legitimately have no operations.
assert.deepEqual(validateAuthorityGate(bodyCase.input, { items: [] }, ready()), [])
for (const status of ['MISSING_INPUT', 'CONFLICT_INPUT'] as const) {
  const plan = { ...ready(), status, [status === 'MISSING_INPUT' ? 'missingInputs' : 'conflicts']: [{ id: 'stop', ...(status === 'MISSING_INPUT' ? { label: 'Required value', explanation: 'Unavailable', inputType: 'text' as const, sourceContext: 'source', inventoryItemIds: [] } : { field: 'date', label: 'Conflict', explanation: 'Conflicting values', inputType: 'date' as const }), required: true as const }] } as PlanResult
  assert.deepEqual(validateAuthorityGate(bodyCase.input, { items: [] }, plan), [], `${status} with no operations remains valid`)
}

// Prompt explicitly separates semantic declarations from executable edits and permits shared block rewrites.
assert.match(TRANSFORMATION_INSTRUCTIONS, /factChange alone is not an executable document edit/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /every corresponding source occurrence/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /complete block rewrite may cover multiple factChanges/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /metadata replacements use the separate metadata edit path/i)

console.log('PASS READY operation coverage protocol acceptance')
