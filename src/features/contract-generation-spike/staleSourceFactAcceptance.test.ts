import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { applyOptionBGenerationResponse, createGenerationSourceView, GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION, readSource } from './generator'
import { buildContractGenerationInput, type ContractGenerationInputOptions } from './contractGenerationInput'
import { safeMechanicalTelemetry } from './mechanicalDiagnostics'

const p = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`
async function sourceDocx(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p('Parties: Sample Party')}${p('Provider name: PROVIDER_A; company: COMPANY_A; business address: ADDRESS_A; tax and registration identifiers: IDENTIFIERS_A; permanent email and phone: CONTACT_A; bank details: PAYMENT_ACCOUNT_A.')}${p('Event: 12 June 2027 at Sample Preparation A; ceremony Sample Chapel A; reception Sample Hall A.')}${p('Payment: remaining amount due 7 days before the event.')}${p('Base package: source-defined scope and amount.')}${p('Ordinary source legal clause.') }<w:sectPr/></w:body></w:document>`)
  zip.file('word/header1.xml', `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${p('Reference: sample contract 07 2027')}</w:hdr>`)
  zip.file('word/footer1.xml', `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${p('Sample footer')}</w:ftr>`)
  return zip.generateAsync({ type: 'arraybuffer' })
}

const fixture = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('./multi-template-acceptance/cases/case-04-realistic-wedding-photographer/input.json', import.meta.url), 'utf8')) as { authoritativeInput: ContractGenerationInputOptions }
const authority = buildContractGenerationInput(fixture.authoritativeInput)
const bytes = await sourceDocx()
const source = await readSource(bytes, 'transaction-fixture.docx')
const view = createGenerationSourceView(source)
const handle = (block: typeof source.blocks[number]) => [...view.sourceBlockIds].find(([, id]) => id === block.blockId)![0]
const partyBlock = source.blocks.find((block) => block.text.startsWith('Parties:'))!
const providerBlock = source.blocks.find((block) => block.text.startsWith('Provider name:'))!
const eventBlock = source.blocks.find((block) => block.text.startsWith('Event:'))!
const paymentBlock = source.blocks.find((block) => block.text.startsWith('Payment:'))!
const currentEvent = 'Event: 30 November 2026 at Current Preparation B; ceremony Current Chapel B; reception Current Hall B.'

assert.match(GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION, /determine whether the source already contains a semantic slot/)
assert.match(GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION, /do not leave the source value and insert a second current version elsewhere/)
assert.match(GENERIC_AUTHORITY_BOUNDARY_INSTRUCTION, /body paragraphs, tables, headers, or footers/)
assert.ok(source.blocks.some((block) => block.kind === 'header') && source.blocks.some((block) => block.kind === 'footer'), 'source analysis includes header and footer paragraphs')

const stalePlusCurrent = await applyOptionBGenerationResponse(bytes, source, authority, view.sourceBlockIds, {
  status: 'READY', edits: [{ kind: 'insert_after', blockId: handle(paymentBlock), text: currentEvent, supersedesSourceBlockId: handle(eventBlock), supersededSourceText: eventBlock.text }],
})
assert.equal(stalePlusCurrent.status, 'FAILED', 'a current event insertion declaring an existing source slot fails before candidate persistence')
if (stalePlusCurrent.status === 'FAILED') {
  assert.deepEqual(stalePlusCurrent.mechanicalFailure, {
    gateId: 'stale_source_fact', reasonCode: 'superseded_fact_inserted', editIndex: 0, editCount: 1,
    editOperation: 'insert_after', sourceBlockType: 'body', sourceBlockOrdinal: eventBlock.index,
    sourceTargetFound: true, editorOperationReportedSuccess: false,
  })
  const telemetry = safeMechanicalTelemetry(stalePlusCurrent.mechanicalFailure)
  assert.deepEqual(telemetry, {
    mechanicalGateId: 'stale_source_fact', mechanicalReasonCode: 'superseded_fact_inserted',
    mechanicalEditIndex: 0, mechanicalEditCount: 1, mechanicalEditOperation: 'insert_after',
    mechanicalSourceBlockType: 'body', mechanicalSourceBlockOrdinal: eventBlock.index,
    mechanicalSourceTargetFound: true, mechanicalEditorOperationReportedSuccess: false,
  }, 'safe diagnostics contain only allowlisted gate, operation, count, and source-slot metadata')
}

const valid = await applyOptionBGenerationResponse(bytes, source, authority, view.sourceBlockIds, {
  status: 'READY', edits: [
    { kind: 'replace', blockId: handle(partyBlock), text: 'Parties: Current Party', supersedesSourceBlockId: handle(partyBlock), supersededSourceText: 'Sample Party' },
    { kind: 'replace', blockId: handle(eventBlock), text: currentEvent, supersedesSourceBlockId: handle(eventBlock), supersededSourceText: eventBlock.text },
    { kind: 'insert_after', blockId: handle(paymentBlock), text: 'Payment clause: remaining amount due on the wedding day, 30 November 2026.', supersedesSourceBlockId: null, supersededSourceText: null },
  ],
})
assert.equal(valid.status, 'READY', 'localized source replacement passes; a legitimate repeated current date in a payment clause is allowed')
if (valid.status === 'READY') {
  assert.equal(valid.candidate.blocks.filter((block) => /30 November 2026/.test(block.text)).length, 2, 'repeated current event date remains valid across distinct clauses')
  assert.equal(valid.candidate.blocks.some((block) => /12 June 2027|Sample Preparation A|Sample Chapel A|Sample Hall A/.test(block.text)), false, 'superseded source event values do not remain in their replaced source block')
  assert.equal(valid.candidate.blocks.find((block) => block.blockId === providerBlock.blockId)?.text, providerBlock.text, 'mixed sample wedding facts do not supersede source-owned provider/business content')
  assert.equal(valid.candidate.blocks.some((block) => block.text === 'Ordinary source legal clause.'), true, 'unrelated source legal wording is preserved')
}

const duplicateParty = await applyOptionBGenerationResponse(bytes, source, authority, view.sourceBlockIds, {
  status: 'READY', edits: [{ kind: 'insert_after', blockId: handle(partyBlock), text: 'Parties: Current Party', supersedesSourceBlockId: handle(partyBlock), supersededSourceText: 'Sample Party' }],
})
assert.equal(duplicateParty.status, 'FAILED', 'a second representation cannot claim to supersede an existing party slot via insertion')

const staleWithinReplacement = await applyOptionBGenerationResponse(bytes, source, authority, view.sourceBlockIds, {
  status: 'READY', edits: [{ kind: 'replace', blockId: handle(eventBlock), text: `${eventBlock.text} ${currentEvent}`, supersedesSourceBlockId: handle(eventBlock), supersededSourceText: eventBlock.text }],
})
assert.equal(staleWithinReplacement.status, 'FAILED', 'an exact superseded source fact span surviving beside its replacement fails closed')
if (staleWithinReplacement.status === 'FAILED') {
  assert.equal(staleWithinReplacement.mechanicalFailure?.reasonCode, 'superseded_fact_survives')
  const telemetry = safeMechanicalTelemetry(staleWithinReplacement.mechanicalFailure)
  assert.equal(JSON.stringify(telemetry).includes(eventBlock.text), false, 'safe telemetry never includes the private source-fact span')
  assert.equal(JSON.stringify(telemetry).includes(currentEvent), false, 'safe telemetry never includes the private replacement text')
}

const footerBlock = source.blocks.find((block) => block.kind === 'footer')!
const staleFooterPlan = await applyOptionBGenerationResponse(bytes, source, authority, view.sourceBlockIds, {
  status: 'READY', edits: [{ kind: 'insert_after', blockId: handle(paymentBlock), text: 'Current reference', supersedesSourceBlockId: handle(footerBlock), supersededSourceText: 'Sample footer' }],
})
assert.equal(staleFooterPlan.status, 'FAILED', 'superseded facts identified in footers use the same deterministic guard')
if (staleFooterPlan.status === 'FAILED') assert.equal(staleFooterPlan.mechanicalFailure?.sourceBlockType, 'footer')
console.log('PASS generic stale source transaction-fact safety acceptance')
