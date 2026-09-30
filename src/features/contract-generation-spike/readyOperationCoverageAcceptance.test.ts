import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { makeInput, readSource, TRANSFORMATION_INSTRUCTIONS, validateAuthorityGate, type GenerationInput, type PlanResult, type SourceInventory } from './generator'

const paragraph = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
async function fixture(body: string, footer = '', header = '', subject = 'Old subject') {
  const zip = new JSZip()
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph(body)}<w:sectPr/></w:body></w:document>`)
  if (footer) zip.file('word/footer1.xml', `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${paragraph(footer)}</w:ftr>`)
  if (header) zip.file('word/header1.xml', `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${paragraph(header)}</w:hdr>`)
  zip.file('docProps/core.xml', `<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:subject>${subject}</dc:subject></cp:coreProperties>`)
  const bytes = await zip.generateAsync({ type: 'arraybuffer' })
  const source = await readSource(bytes, 'coverage.docx')
  const input = makeInput({ generationDate: '04.02.2028', sourceDocument: source, wedding: { bride: { name: 'Klaudia Majewska', phone: '', email: '' }, groom: { name: 'Tomasz Domański', phone: '' }, weddingDate: '22.05.2028', contractAddress: '', contractValuePln: 10600, depositPln: 2000, remainingDueDate: '', locations: { bridePreparations: '', groomPreparations: '', ceremony: '', reception: '' } }, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [] })
  const refs = [...source.blocks.map((block) => block.blockId), ...(source.documentProperties ?? []).map((property) => property.ref)]
  return { bytes, source, input, refs }
}
const ready = (overrides: Partial<PlanResult> = {}): PlanResult => ({ status: 'READY', missingInputs: [], conflicts: [], factChanges: [], retainedLiterals: [], operations: [], ...overrides })
const change = (itemId: string, sourceRef: string, expectedSource: string, label: string) => ({ label, inventoryItemId: itemId, inventoryItemIds: [itemId], sourceRef, expectedSource, newValue: 'Klaudia Majewska', newValueFormat: 'literal' as const, authority: { kind: 'crm' as const, ref: 'wedding.bride.name' } })
const item = (id: string, ref: string, quote: string | null) => ({ id, label: id, occurrences: [{ sourceRef: ref, quote }] })

const bodyCase = await fixture('Bride: Old Bride')
const bodyBlock = bodyCase.source.blocks.find((block) => block.part === 'word/document.xml')!
const bodyInventory: SourceInventory = { coveredSourceRefs: bodyCase.refs, items: [item('body-name', bodyBlock.blockId, 'Old Bride')] }
const bodyChange = change('body-name', bodyBlock.blockId, 'Old Bride', 'bride name')
assert.deepEqual(validateAuthorityGate(bodyCase.input, bodyInventory, ready({ factChanges: [bodyChange] })), [], 'a fact patch needs no complete block operation')
assert.ok(validateAuthorityGate(bodyCase.input, bodyInventory, ready({ factChanges: [bodyChange], operations: [{ blockId: bodyBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Bride: Klaudia Majewska' }] })).some((issue) => /block operations/.test(issue)), 'a block target is not edit permission')

const footerCase = await fixture('No change', 'Footer: Old Bride')
const footer = footerCase.source.blocks.find((block) => block.kind === 'footer')!
const footerInventory: SourceInventory = { coveredSourceRefs: footerCase.refs, items: [item('footer-name', footer.blockId, 'Old Bride')] }
assert.deepEqual(validateAuthorityGate(footerCase.input, footerInventory, ready({ factChanges: [change('footer-name', footer.blockId, 'Old Bride', 'footer name')] })), [])
const headerCase = await fixture('No change', '', 'Header: Old Bride')
const header = headerCase.source.blocks.find((block) => block.kind === 'header')!
const headerInventory: SourceInventory = { coveredSourceRefs: headerCase.refs, items: [item('header-name', header.blockId, 'Old Bride')] }
assert.deepEqual(validateAuthorityGate(headerCase.input, headerInventory, ready({ factChanges: [change('header-name', header.blockId, 'Old Bride', 'header name')] })), [])

const metadataCase = await fixture('No change')
const subject = metadataCase.source.documentProperties!.find((property) => property.property === 'subject')!
const metadataInventory: SourceInventory = { coveredSourceRefs: metadataCase.refs, items: [item('metadata-date', subject.ref, 'Old subject')] }
const metadataChange = { ...change('metadata-date', subject.ref, 'Old subject', 'document date'), newValue: metadataCase.input.generationDate, authority: { kind: 'generation_date' as const, ref: 'generationDate' } }
assert.deepEqual(validateAuthorityGate(metadataCase.input, metadataInventory, ready({ factChanges: [metadataChange] })), [])

const mixed = await fixture('Bride: Old Bride', 'Footer: Old Bride', '', 'Old Bride')
const mixedBody = mixed.source.blocks.find((block) => block.part === 'word/document.xml')!
const mixedFooter = mixed.source.blocks.find((block) => block.kind === 'footer')!
const mixedSubject = mixed.source.documentProperties!.find((property) => property.property === 'subject')!
const mixedInventory: SourceInventory = { coveredSourceRefs: mixed.refs, items: [item('body-party-name', mixedBody.blockId, 'Old Bride'), item('footer-party-name', mixedFooter.blockId, 'Old Bride'), item('metadata-party-name', mixedSubject.ref, 'Old Bride')] }
const mixedPlan = ready({ factChanges: [change('body-party-name', mixedBody.blockId, 'Old Bride', 'body name'), change('footer-party-name', mixedFooter.blockId, 'Old Bride', 'footer name'), change('metadata-party-name', mixedSubject.ref, 'Old Bride', 'metadata name')] })
assert.deepEqual(validateAuthorityGate(mixed.input, mixedInventory, mixedPlan), [], 'each repeated slot has its own exact patch disposition')

const shared = await fixture('Bride: Old Bride; partner: Old Partner')
const sharedBlock = shared.source.blocks.find((block) => block.part === 'word/document.xml')!
const sharedInventory: SourceInventory = { coveredSourceRefs: shared.refs, items: [item('first-name', sharedBlock.blockId, 'Old Bride'), item('second-name', sharedBlock.blockId, 'Old Partner')] }
const sharedPlan = ready({ factChanges: [change('first-name', sharedBlock.blockId, 'Old Bride', 'first party name'), { ...change('second-name', sharedBlock.blockId, 'Old Partner', 'second party name'), newValue: 'Tomasz Domański', authority: { kind: 'crm', ref: 'wedding.groom.name' } }] })
assert.deepEqual(validateAuthorityGate(shared.input, sharedInventory, sharedPlan), [], 'two names in one paragraph remain two atomic patches')
assert.ok(validateAuthorityGate(shared.input, sharedInventory, ready({ factChanges: [change('first-name', sharedBlock.blockId, 'Old Bride', 'first party name')], operations: [{ blockId: sharedBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Bride: Klaudia Majewska; partner: arbitrary prose' }] })).some((issue) => /block operations/.test(issue)))

const retentionCase = await fixture('Reusable source term')
const retentionBlock = retentionCase.source.blocks.find((block) => block.part === 'word/document.xml')!
const retentionInventory: SourceInventory = { coveredSourceRefs: retentionCase.refs, items: [item('reusable', retentionBlock.blockId, null)] }
const retentionInput = makeInput({ ...retentionCase.input, userProvidedAnswers: [{ id: 'keep.term', value: 'Keep this term' }] })
const retentionPlan = ready({ retainedLiterals: [{ inventoryItemId: 'reusable', authority: { kind: 'user', ref: 'keep.term' }, reason: 'explicitly retained' }] })
assert.deepEqual(validateAuthorityGate(retentionInput, retentionInventory, retentionPlan), [])

const missingPlan = { ...ready(), status: 'MISSING_INPUT' as const, missingInputs: [{ id: 'stop', label: 'Required value', explanation: 'Unavailable', inputType: 'text' as const, sourceContext: 'source', inventoryItemIds: [], required: true as const }] }
assert.deepEqual(validateAuthorityGate(bodyCase.input, { coveredSourceRefs: bodyCase.refs, items: [] }, missingPlan), [])

assert.match(TRANSFORMATION_INSTRUCTIONS, /exact atomic patches and cannot be authorized by block operations/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /metadata uses the same exact occurrence provenance/i)
console.log('PASS source occurrence patch coverage protocol acceptance')
