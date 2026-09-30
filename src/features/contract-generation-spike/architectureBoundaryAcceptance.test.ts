import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { applyBlockOperations } from './blockDocxEditor'
import { buildContractGenerationInput, type ContractGenerationInputOptions } from './contractGenerationInput'
import { makeInput, readSource, runGeneration, sanitizePlannerOperations, validateAuthorityGate, type GenerationInput, type PlanResult, type SourceInventory } from './generator'

function p(text: string): string { return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>` }
async function minimalPackage(body: string): Promise<ArrayBuffer> {
  const zip = new JSZip()
  const cells = (start: number) => `<w:tr>${[0, 1, 2].map((offset) => `<w:tc><w:tcPr/>${p(`cell ${start + offset}`)}</w:tc>`).join('')}</w:tr>`
  const tables = `<w:tbl>${cells(0)}${cells(3)}</w:tbl><w:tbl>${cells(6)}${cells(9)}</w:tbl>`
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p(body)}${tables}<w:sectPr/></w:body></w:document>`)
  return zip.generateAsync({ type: 'arraybuffer' })
}
function inputFor(source: GenerationInput['sourceDocument']): GenerationInput {
  return makeInput({ generationDate: '25.09.2026', sourceDocument: source, wedding: { bride: { name: 'Ada Test', phone: '', email: '' }, groom: { name: 'Bar Test', phone: '' }, weddingDate: '20.09.2027', contractAddress: '', contractValuePln: 10000, depositPln: 1000, remainingDueDate: '', locations: { bridePreparations: '', groomPreparations: '', ceremony: '', reception: '' } }, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [] })
}
const ready = (): PlanResult => ({ status: 'READY', missingInputs: [], conflicts: [], factChanges: [], retainedLiterals: [], operations: [] })

const pipelineBytes = await minimalPackage('Client: Ada Source')
const pipelineSource = await readSource(pipelineBytes, 'pipeline.docx')
const block = pipelineSource.blocks.find((item) => item.text.includes('Ada Source'))!
const inventory: SourceInventory = { items: [{ id: 'client-name', label: 'old client name', occurrences: [{ sourceRef: block.blockId, quote: 'Ada Source' }] }] }
const input = inputFor(pipelineSource)
const case04Options = JSON.parse(await readFile(new URL('./multi-template-acceptance/cases/case-04-realistic-wedding-photographer/input.json', import.meta.url), 'utf8')) as { authoritativeInput: ContractGenerationInputOptions }
const authorityContext = buildContractGenerationInput(case04Options.authoritativeInput)
const party1Name = authorityContext.parties.find((party) => party.sourceKey === 'partner1')!.fullName!
const operation = { blockId: block.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText: `Client: ${party1Name.value}` }
const plan: PlanResult = { ...ready(), factChanges: [{ label: 'name', inventoryItemIds: ['client-name'], newValue: party1Name.value, newValueFormat: 'literal', authority: { kind: 'crm', ref: party1Name.source } }], operations: [operation] }
const legacyPlan: PlanResult = { ...ready(), factChanges: [{ label: 'name', inventoryItemIds: ['client-name'], newValue: 'Ada Test', newValueFormat: 'literal', authority: { kind: 'crm', ref: 'wedding.bride.name' } }], operations: [operation] }
assert.deepEqual(validateAuthorityGate(input, inventory, legacyPlan), [], 'legacy authority paths remain confined to direct historical compatibility checks')
for (const status of ['MISSING_INPUT', 'CONFLICT_INPUT'] as const) assert.deepEqual(sanitizePlannerOperations(status, [operation]).operations, [])
assert.deepEqual(sanitizePlannerOperations('READY', [operation]).operations, [operation])

const stageOrder: string[] = []
const generated = await runGeneration(pipelineBytes, pipelineSource, authorityContext, {}, {
  async inventory(sourceDocument) { stageOrder.push('inventory'); assert.strictEqual(sourceDocument, pipelineSource); assert.equal('wedding' in sourceDocument, false); return inventory },
  async plan(receivedAuthority, receivedInventory) { stageOrder.push('plan'); assert.strictEqual(receivedAuthority, authorityContext); assert.strictEqual(receivedInventory, inventory); return plan },
  async review(args) { stageOrder.push('review'); assert.strictEqual(args.authorityContext, authorityContext); assert.deepEqual(args.factChanges, plan.factChanges); assert.equal(args.resolvedInventoryOccurrences[0]?.text, 'Ada Source'); assert.ok(args.changedBlocks.some((item) => item.sourceText?.includes('Ada Source') && item.candidateText?.includes(party1Name.value))); return { status: 'PASS' } },
})
assert.deepEqual(stageOrder, ['inventory', 'plan', 'review'])
assert.equal(generated.status, 'COMPLETED')

let reviewCount = 0
const missingRun = await runGeneration(pipelineBytes, pipelineSource, authorityContext, {}, {
  async inventory() { return inventory },
  async plan() { return { ...ready(), status: 'MISSING_INPUT', missingInputs: [{ id: 'gap', label: 'missing fact', explanation: 'replacement unavailable', inputType: 'text', required: true, sourceContext: 'source', sourceRefs: [block.blockId], inventoryItemIds: ['client-name'] }] } },
  async review() { reviewCount++; return { status: 'PASS' } },
})
assert.equal(missingRun.status, 'MISSING_INPUT')
if (missingRun.status === 'MISSING_INPUT') assert.equal(missingRun.missingInputs.length, 1)
assert.equal(reviewCount, 0, 'non-READY planning skips independent review')

let invalidInventoryPlanCalls = 0
const invalidInventory = { items: [{ id: 'bad-quote', label: 'invalid quote', occurrences: [{ sourceRef: block.blockId, quote: 'Ada Sourcx' }] }] }
const invalidInventoryRun = await runGeneration(pipelineBytes, pipelineSource, authorityContext, {}, {
  async inventory() { return invalidInventory },
  async plan() { invalidInventoryPlanCalls++; return plan },
  async review() { reviewCount++; return { status: 'PASS' } },
})
assert.equal(invalidInventoryRun.status, 'FAILED')
if (invalidInventoryRun.status === 'FAILED') assert.ok(invalidInventoryRun.issues.some((issue) => /exact quote does not occur/.test(issue)))
assert.equal(invalidInventoryPlanCalls, 0, 'invalid inventory protocol stops before planner provider execution')

const deterministicStop = await runGeneration(pipelineBytes, pipelineSource, authorityContext, {}, {
  async inventory() { return inventory },
  async plan() { return { ...plan, operations: [{ ...operation, finalText: block.text }] } },
  async review() { reviewCount++; return { status: 'PASS' } },
})
assert.equal(deterministicStop.status, 'FAILED', 'objective candidate validation runs before review')
assert.equal(reviewCount, 0, 'candidate validation failure stops before review')

// Whole-block grounding applies to all prepared cases without fixture routing.
for (const id of ['case-01-elegant-photographer', 'case-02-structured-two-client-photographer', 'case-03-narrative-photo-video', 'case-04-realistic-wedding-photographer']) {
  const file = await readFile(new URL(`./multi-template-acceptance/cases/${id}/source.docx`, import.meta.url))
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
  const doc = await readSource(bytes, 'source.docx')
  const target = doc.blocks.find((item) => item.text.trim())!
  const inv: SourceInventory = { items: [{ id: 'generic-source-item', label: 'source item', occurrences: [{ sourceRef: target.blockId, quote: null }] }] }
  const resolved = await import('./generator').then((mod) => mod.resolveInventoryOccurrences(doc, inv))
  assert.equal(resolved.findings.length, 0, `${id} uses generic source grounding`)
  assert.equal(resolved.occurrences[0]?.text, target.text)
}

// No deterministic semantic interpretation is introduced by source grounding or monetary formatting.
const generatorSource = await readFile(new URL('./generator.ts', import.meta.url), 'utf8')
const moneyFormatterSource = await readFile(new URL('./polishPlnAmount.ts', import.meta.url), 'utf8')
for (const removed of ['isReservationPayment', 'sourceDocumentIdentifierValues', 'partyRoleLabel', 'packageDefinitionBlocks', 'conclusionPlaceInText', 'sourceContainsPartyPhone']) assert.ok(!generatorSource.includes(removed), `${removed} semantic helper is absent`)
assert.doesNotMatch(`${generatorSource}\n${moneyFormatterSource}`, /18\/2027|Hotel H15|LUMEN STORIES|document.?identifier/i)
assert.doesNotMatch(moneyFormatterSource, /matchAll|contract prose|paragraph/i, 'money formatter accepts numeric input and does not scan arbitrary prose')
const tableCandidate = await applyBlockOperations(pipelineBytes, [operation])
const sourceZip = await JSZip.loadAsync(pipelineBytes)
const candidateZip = await JSZip.loadAsync(tableCandidate)
const countCells = async (zip: JSZip) => (await zip.file('word/document.xml')!.async('string')).match(/<w:tc\b/g)?.length
assert.equal(await countCells(candidateZip), await countCells(sourceZip), 'the frozen OOXML editor still preserves table cells')
console.log('PASS generic contract-generation architecture boundary acceptance')
