import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { applyBlockOperations, type BlockOperation } from './blockDocxEditor'
import { applyMetadataFactChanges, computeChangedBlockDiff, makeInput, readSource, runGeneration, sanitizePlannerOperations, validateAuthorityGate, validateCandidate, type GenerationInput, type PlanResult, type SourceInventory } from './generator'

function p(text: string): string { return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>` }
function minimalPackage(body: string, header = '', footer = ''): Promise<ArrayBuffer> {
  const zip = new JSZip()
  const cell = (text: string) => `<w:tc><w:tcPr/>${p(text)}</w:tc>`
  const row = (labels: string[]) => `<w:tr>${labels.map(cell).join('')}</w:tr>`
  const signatures = `<w:tbl>${row(['a','b','c'])}${row(['d','e','f'])}</w:tbl><w:tbl>${row(['g','h','i'])}${row(['j','k','l'])}</w:tbl>`
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${signatures}<w:sectPr/></w:body></w:document>`)
  if (header) zip.file('word/header1.xml', `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${p(header)}</w:hdr>`)
  if (footer) zip.file('word/footer1.xml', `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${p(footer)}</w:ftr>`)
  zip.file('docProps/core.xml', '<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:title>OLD-001</dc:title></cp:coreProperties>')
  return zip.generateAsync({ type: 'arraybuffer' })
}
const wedding: GenerationInput['wedding'] = {
  bride: { name: 'Ada Test', phone: '111222333', email: 'ada@example.test' }, groom: { name: 'Bar Test', phone: '444555666' },
  weddingDate: '20.09.2027', contractAddress: 'Example 1, 00-001 City', contractValuePln: 14200, depositPln: 1000, remainingDueDate: '20.09.2027',
  locations: { bridePreparations: '', groomPreparations: '', ceremony: '', reception: '' },
}
const bytes = await minimalPackage(p('Agreement reference OLD-001') + p('Party Ada Source'))
const source = await readSource(bytes, 'source.docx')
const input = makeInput({ generationDate: '25.09.2026', sourceDocument: source, wedding, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [{ id: 'answer.reference', value: 'OLD-002' }] })
const sourceFact = source.blocks.find((block) => block.text.includes('OLD-001'))!
const baseInventory: SourceInventory = { items: [{ value: 'OLD-001', sourceRefs: [sourceFact.blockId], label: 'old agreement reference' }] }
const readyPlan: PlanResult = { status: 'READY', missingInputs: [], conflicts: [], factChanges: [], retainedLiterals: [{ value: 'OLD-001', reason: 'retained in this structural test' }], operations: [] }

// Non-READY safety and full multi-gap retention.
for (const status of ['MISSING_INPUT', 'CONFLICT_INPUT'] as const) {
  const normalized = sanitizePlannerOperations(status, [{ blockId: sourceFact.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'bad' }])
  assert.equal(normalized.operations.length, 0)
}
const missingPlan: PlanResult = { ...readyPlan, status: 'MISSING_INPUT', missingInputs: [
  { id: 'a', label: 'First', explanation: 'First gap', inputType: 'text', required: true, sourceContext: 'source', sourceRefs: [sourceFact.blockId] },
  { id: 'b', label: 'Second', explanation: 'Second gap', inputType: 'date', required: true, sourceContext: 'source', sourceRefs: [sourceFact.blockId] },
] }
assert.equal(missingPlan.missingInputs.length, 2)
assert.deepEqual(validateAuthorityGate(input, baseInventory, missingPlan), [])

// Four provenance namespaces, unsupported values and invalid references.
const fact = (authority: PlanResult['factChanges'][number]['authority'], newValue: string): PlanResult => ({ ...readyPlan, retainedLiterals: [], factChanges: [{ label: 'free text can be arbitrary', oldValues: ['OLD-001'], newValue, authority, sourceRefs: [sourceFact.blockId] }] })
assert.deepEqual(validateAuthorityGate(input, { items: [] }, fact({ kind: 'crm', ref: 'wedding.bride.name' }, 'Ada Test')), [])
assert.deepEqual(validateAuthorityGate(input, { items: [] }, fact({ kind: 'user', ref: 'answer.reference' }, 'OLD-002')), [])
assert.deepEqual(validateAuthorityGate(input, { items: [] }, fact({ kind: 'generation_date', ref: 'generationDate' }, '25.09.2026')), [])
assert.deepEqual(validateAuthorityGate(input, { items: [] }, fact({ kind: 'derived', ref: 'financials.remainingPln' }, '13200')), [])
assert.ok(validateAuthorityGate(input, { items: [] }, fact({ kind: 'crm', ref: 'wedding.bride.name' }, 'Invented')).some((item) => /does not match/.test(item)))
assert.ok(validateAuthorityGate(input, { items: [] }, fact({ kind: 'crm', ref: 'wedding.bride.name' }, 'Ada Test with invented fact')).some((item) => /does not match/.test(item)), 'authoritative facts must match exactly, not merely appear inside invented text')
assert.ok(validateAuthorityGate(input, { items: [] }, fact({ kind: 'crm', ref: 'wedding.noSuchField' }, 'Invented')).some((item) => /Invalid authority reference/.test(item)))
assert.deepEqual(validateAuthorityGate(input, { items: [] }, readyPlan), [])
const badMath = structuredClone(input); badMath.deterministicDerivedFacts[0]!.value = '13201'
assert.ok(validateAuthorityGate(badMath, { items: [] }, readyPlan).some((item) => /does not match its declared arithmetic/.test(item)))
const badOperand = structuredClone(input); badOperand.deterministicDerivedFacts[0]!.inputRefs = ['user:unknown', 'crm:financials.depositPln']
assert.ok(validateAuthorityGate(badOperand, { items: [] }, readyPlan).some((item) => /unsupported operand/.test(item)))

// Inventory stale-literal coverage spans body, header, footer and supported textual metadata.
const allPartsBytes = await minimalPackage(p('Ref OLD-001'), 'Header OLD-001', 'Footer OLD-001')
const allPartsSource = await readSource(allPartsBytes, 'all-parts.docx')
const bodyBlock = allPartsSource.blocks.find((block) => block.text.includes('OLD-001'))!
const headerBlock = allPartsSource.blocks.find((block) => block.kind === 'header')!
const footerBlock = allPartsSource.blocks.find((block) => block.kind === 'footer')!
const property = allPartsSource.documentProperties?.find((item) => item.text === 'OLD-001')!
const fullInventory: SourceInventory = { items: [{ value: 'OLD-001', label: 'free-form label', sourceRefs: [bodyBlock.blockId, headerBlock.blockId, footerBlock.blockId, `${property.part}#${property.property}`] }] }
const fullInput = makeInput({ generationDate: '25.09.2026', sourceDocument: allPartsSource, wedding, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [{ id: 'new.reference', value: 'NEW-002' }] })
const fullPlan: PlanResult = { status: 'READY', missingInputs: [], conflicts: [], factChanges: [{ label: 'arbitrary label text', oldValues: ['OLD-001'], newValue: 'NEW-002', authority: { kind: 'user', ref: 'new.reference' }, sourceRefs: fullInventory.items[0]!.sourceRefs }], retainedLiterals: [], operations: [bodyBlock, headerBlock, footerBlock].map((block) => ({ blockId: block.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: block.text.replaceAll('OLD-001', 'NEW-002') })) }
assert.deepEqual(validateAuthorityGate(fullInput, fullInventory, fullPlan), [])
const replaced = await applyMetadataFactChanges(await applyBlockOperations(allPartsBytes, fullPlan.operations), fullPlan.factChanges)
const checked = await validateCandidate(allPartsBytes, replaced, fullInput, fullInventory, fullPlan, fullPlan.operations)
assert.deepEqual(checked, [])
for (const part of ['body','header','footer','metadata'] as const) {
  let candidate: ArrayBuffer
  if (part === 'metadata') {
    // The metadata writer is exercised by runGeneration below; direct mutation here proves mechanical candidate rejection.
    const zip = await JSZip.loadAsync(replaced); const xml = await zip.file('docProps/core.xml')!.async('string'); zip.file('docProps/core.xml', xml.replace('NEW-002', 'OLD-001')); candidate = await zip.generateAsync({ type: 'arraybuffer' })
  } else {
    const path = part === 'body' ? 'word/document.xml' : `word/${part}1.xml`
    const zip = await JSZip.loadAsync(replaced); const xml = await zip.file(path)!.async('string'); zip.file(path, xml.replace('NEW-002', 'OLD-001')); candidate = await zip.generateAsync({ type: 'arraybuffer' })
  }
  assert.ok((await validateCandidate(allPartsBytes, candidate, fullInput, fullInventory, fullPlan, fullPlan.operations)).some((item) => item.includes('Declared old literal remains')),
    `a surviving ${part} value is mechanically rejected`)
}
const retainedPlan: PlanResult = { ...readyPlan, retainedLiterals: [{ value: 'OLD-001', reason: 'free text reason' }] }
assert.deepEqual(await validateCandidate(allPartsBytes, allPartsBytes, fullInput, fullInventory, retainedPlan), [], 'declared retention is not mechanically rejected')
const damagedTables = await JSZip.loadAsync(allPartsBytes)
const damagedDocument = await damagedTables.file('word/document.xml')!.async('string')
damagedTables.file('word/document.xml', damagedDocument.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/, (table) => table.replace(/<w:tc>[\s\S]*?<\/w:tc>/, '')))
const damagedTableCandidate = await damagedTables.generateAsync({ type: 'arraybuffer' })
assert.ok((await validateCandidate(allPartsBytes, damagedTableCandidate, fullInput, fullInventory, retainedPlan)).some((item) => /Per-table row or cell structure changed/.test(item)), 'per-table structural loss is detected')
const absentPlan: PlanResult = { ...fullPlan, factChanges: [], retainedLiterals: [] }
assert.ok((await validateCandidate(allPartsBytes, allPartsBytes, fullInput, fullInventory, absentPlan)).some((item) => item.includes('no final disposition')))

// Cases 01–04 are covered by the same inventory/provenance contract with no template routing.
for (const id of ['case-01-elegant-photographer','case-02-structured-two-client-photographer','case-03-narrative-photo-video','case-04-realistic-wedding-photographer']) {
  const fixtureSource = await readFile(new URL(`./multi-template-acceptance/cases/${id}/source.docx`, import.meta.url))
  const fixtureBytes = fixtureSource.buffer.slice(fixtureSource.byteOffset, fixtureSource.byteOffset + fixtureSource.byteLength)
  const fixtureDocument = await readSource(fixtureBytes, 'source.docx')
  const block = fixtureDocument.blocks.find((candidate) => candidate.text.trim())!
  const inventory = { items: [{ value: block.text, sourceRefs: [block.blockId], label: 'fixture literal' }] }
  const plan: PlanResult = { status: 'READY', missingInputs: [], conflicts: [], factChanges: [], retainedLiterals: [{ value: block.text, reason: 'fixture source value retained for boundary test' }], operations: [] }
  const fixtureInput = makeInput({ generationDate: '25.09.2026', sourceDocument: fixtureDocument, wedding, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [] })
  assert.deepEqual(validateAuthorityGate(fixtureInput, inventory, plan), [], `${id} passes generic inventory disposition checks`)
  assert.deepEqual(await validateCandidate(fixtureBytes, fixtureBytes, fixtureInput, inventory, plan), [], `${id} unchanged source is structurally valid`)
}
const case04Bytes = await readFile(new URL('./multi-template-acceptance/cases/case-04-realistic-wedding-photographer/source.docx', import.meta.url))
const case04ArrayBuffer = case04Bytes.buffer.slice(case04Bytes.byteOffset, case04Bytes.byteOffset + case04Bytes.byteLength)
const case04Document = await readSource(case04ArrayBuffer, 'case-04.docx')
const case04IdentifierBlock = case04Document.blocks.find((block) => block.text.includes('18/2027'))!
const case04Inventory = { items: [{ value: '18/2027', label: 'agreement identifier', sourceRefs: [case04IdentifierBlock.blockId] }] }
const case04Input = makeInput({ generationDate: '25.09.2026', sourceDocument: case04Document, wedding, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [] })
const case04Missing: PlanResult = { status: 'MISSING_INPUT', missingInputs: [{ id: 'agreement-reference', label: 'Agreement reference', explanation: 'The source-specific reference has no replacement value.', inputType: 'text', required: true, sourceContext: 'Source identifier', sourceRefs: [case04IdentifierBlock.blockId] }], conflicts: [], factChanges: [], retainedLiterals: [], operations: [] }
assert.deepEqual(validateAuthorityGate(case04Input, case04Inventory, case04Missing), [], 'Case 04 stale identifier is gated through source inventory and missing input, not lexical discovery')
assert.ok(case04Document.blocks.some((block) => block.text.includes('W celu rezerwacji terminu')), 'Case 04 includes reservation wording for the no-phrase-rule regression')
const case03Bytes = await readFile(new URL('./multi-template-acceptance/cases/case-03-narrative-photo-video/source.docx', import.meta.url))
const case03ArrayBuffer = case03Bytes.buffer.slice(case03Bytes.byteOffset, case03Bytes.byteOffset + case03Bytes.byteLength)
const case03Document = await readSource(case03ArrayBuffer, 'case-03.docx')
const case03PaymentBlock = case03Document.blocks.find((block) => block.text.includes('Druga płatność'))!
const case03Input = makeInput({ generationDate: '25.09.2026', sourceDocument: case03Document, wedding, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [] })
const case03Inventory = { items: [{ value: case03PaymentBlock.text, label: 'payment allocation wording', sourceRefs: [case03PaymentBlock.blockId] }] }
const case03MissingAllocation: PlanResult = { status: 'MISSING_INPUT', missingInputs: [{ id: 'payment-allocation', label: 'Additional allocation', explanation: 'The source requires an amount not represented in current authority.', inputType: 'number', required: true, sourceContext: 'Source payment clause', sourceRefs: [case03PaymentBlock.blockId] }], conflicts: [], factChanges: [], retainedLiterals: [], operations: [] }
assert.deepEqual(validateAuthorityGate(case03Input, case03Inventory, case03MissingAllocation), [], 'Case 03 allocation completeness is declared by the planner without deterministic payment-role parsing')

// A free-form label/reason does not affect the deterministic gate; there are no prose classifiers.
const generatorSource = await readFile(new URL('./generator.ts', import.meta.url), 'utf8')
for (const removed of ['isReservationPayment', 'postReservationPaymentObligations', 'formalClientIdentity', 'customerPartyNames', 'sourcePackageDefinitionBlocks', 'sourceDocumentIdentifierValues', 'conclusionDateInText', 'conclusionPlaceInText', 'sourceContainsPartyPhone']) assert.ok(!generatorSource.includes(removed), `${removed} semantic helper is absent`)
assert.doesNotMatch(generatorSource, /const\s+(?:reservationClause|partyRoleLabel|documentReferenceLabel|scopeHeading)\s*=/)
const candidateBlocks = fullPlan.operations.map((operation, index) => ({ ...bodyBlock, blockId: `${bodyBlock.part}#p${index}`, index, text: operation.finalText }))
const diff = computeChangedBlockDiff([bodyBlock], candidateBlocks)
assert.equal(diff.length, 3)
assert.deepEqual(Object.keys(diff[0]!).sort(), ['blockRef','candidateText','sourceText'])

// The production-shaped spike entry point keeps the six stages ordered and inventory receives no CRM input.
const pipelineBytes = await minimalPackage(p('Client: Ada Source'))
const pipelineSource = await readSource(pipelineBytes, 'pipeline.docx')
const pipelineBlock = pipelineSource.blocks.find((block) => block.text.includes('Ada Source'))!
const pipelineInput = makeInput({ generationDate: '25.09.2026', sourceDocument: pipelineSource, wedding, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [] })
const pipelineInventory = { items: [{ value: 'Ada Source', label: 'previous client', sourceRefs: [pipelineBlock.blockId] }] }
const pipelinePlan: PlanResult = { status: 'READY', missingInputs: [], conflicts: [], factChanges: [{ label: 'client name', oldValues: ['Ada Source'], newValue: 'Ada Test', authority: { kind: 'crm', ref: 'wedding.bride.name' }, sourceRefs: [pipelineBlock.blockId] }], retainedLiterals: [], operations: [{ blockId: pipelineBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: pipelineBlock.text.replace('Ada Source', 'Ada Test') }] }
const stageOrder: string[] = []
const generated = await runGeneration(pipelineBytes, pipelineInput, {
  async inventory(sourceDocument) { stageOrder.push('inventory'); assert.strictEqual(sourceDocument, pipelineSource); assert.equal('wedding' in sourceDocument, false); return pipelineInventory },
  async plan(receivedInput, receivedInventory) { stageOrder.push('plan'); assert.strictEqual(receivedInput, pipelineInput); assert.strictEqual(receivedInventory, pipelineInventory); return pipelinePlan },
  async review(args) { stageOrder.push('review'); assert.deepEqual(args.factChanges, pipelinePlan.factChanges); assert.deepEqual(args.retainedLiterals, []); assert.ok(args.changedBlocks.some((item) => item.sourceText?.includes('Ada Source') && item.candidateText?.includes('Ada Test'))); return { status: 'PASS' } },
})
assert.deepEqual(stageOrder, ['inventory','plan','review'])
assert.equal(generated.status, 'COMPLETED')
let reviewCount = 0
const missingRun = await runGeneration(pipelineBytes, pipelineInput, {
  async inventory() { return pipelineInventory },
  async plan() { return { ...pipelinePlan, status: 'MISSING_INPUT', missingInputs: [
    { id: 'gap-one', label: 'first free label', explanation: 'first reason', inputType: 'text', required: true, sourceContext: 'one', sourceRefs: [pipelineBlock.blockId] },
    { id: 'gap-two', label: 'second free label', explanation: 'second reason', inputType: 'date', required: true, sourceContext: 'two', sourceRefs: [pipelineBlock.blockId] },
  ], operations: [pipelinePlan.operations[0]!] } },
  async review() { reviewCount++; return { status: 'PASS' } },
})
assert.equal(missingRun.status, 'MISSING_INPUT')
if (missingRun.status === 'MISSING_INPUT') assert.equal(missingRun.missingInputs.length, 2)
assert.equal(reviewCount, 0, 'non-READY planning skips independent review')
const deterministicStop = await runGeneration(pipelineBytes, pipelineInput, {
  async inventory() { return pipelineInventory },
  async plan() { return { ...pipelinePlan, operations: [{ ...pipelinePlan.operations[0]!, finalText: pipelineBlock.text }] } },
  async review() { reviewCount++; return { status: 'PASS' } },
})
assert.equal(deterministicStop.status, 'FAILED', 'objective candidate validation runs before review')
assert.equal(reviewCount, 0, 'candidate validation failure stops before review')

console.log('PASS generic provenance architecture boundary acceptance')
