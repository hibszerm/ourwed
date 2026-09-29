import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { applyBlockOperations } from './blockDocxEditor'
import { buildContractGenerationInput, type ContractGenerationInputOptions } from './contractGenerationInput'
import { readSource, resolveInventoryOccurrences, SOURCE_INVENTORY_INSTRUCTIONS, TRANSFORMATION_INSTRUCTIONS, validateAuthorityGate, validateCandidate, type PlanResult, type SourceInventory } from './generator'

function p(text: string): string { return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>` }
async function packageFor(text: string): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p(text)}<w:sectPr/></w:body></w:document>`)
  return zip.generateAsync({ type: 'arraybuffer' })
}
function spanOf(text: string, value: string): { start: number; end: number } {
  const utf16 = text.indexOf(value)
  assert.notEqual(utf16, -1)
  return { start: Array.from(text.slice(0, utf16)).length, end: Array.from(text.slice(0, utf16 + value.length)).length }
}

const caseDirectory = `${process.cwd()}/src/features/contract-generation-spike/multi-template-acceptance/cases/case-04-realistic-wedding-photographer`
const fixture = JSON.parse(await readFile(`${caseDirectory}/input.json`, 'utf8')) as { authoritativeInput: ContractGenerationInputOptions; expectedProductRules: Record<string, unknown> }

for (const testCase of [
  { deposit: 1000, timing: 'w terminie 3 dni od zawarcia umowy' },
  { deposit: 1500, timing: 'w terminie 5 dni od zawarcia umowy' },
]) {
  const options = structuredClone(fixture.authoritativeInput)
  options.wedding.depositAmount = testCase.deposit
  const normalized = buildContractGenerationInput(options)
  const sourceText = `Zaliczka 2 000 zł płatna ${testCase.timing}.`
  const sourceBytes = await packageFor(sourceText)
  const source = await readSource(sourceBytes, 'payment-template.docx')
  const block = source.blocks[0]!
  const itemId = `deposit-${testCase.deposit}`
  const inventory: SourceInventory = { items: [{ id: itemId, label: 'source deposit amount', occurrences: [{ sourceRef: block.blockId, span: spanOf(block.text, '2 000 zł') }] }] }
  const newAmount = `${testCase.deposit.toLocaleString('pl-PL')} zł`
  const finalText = `Zaliczka ${newAmount} płatna ${testCase.timing}.`
  const operation = { blockId: block.blockId, operation: 'REPLACE_BLOCK_TEXT' as const, finalText }
  const plan: PlanResult = {
    status: 'READY', missingInputs: [], conflicts: [], retainedLiterals: [], operations: [operation],
    factChanges: [{ label: 'source deposit amount', inventoryItemIds: [itemId], newValue: newAmount, newValueFormat: 'literal', authority: { kind: 'crm', ref: normalized.commercial.agreedDeposit.source } }],
  }
  const context = { sourceDocument: source, productRules: fixture.expectedProductRules }
  assert.deepEqual(validateAuthorityGate(normalized, inventory, plan, context), [], `a ${testCase.deposit} deposit replacement does not need a timing authority`)
  const candidate = await applyBlockOperations(sourceBytes, [operation])
  assert.deepEqual(await validateCandidate(sourceBytes, candidate, normalized, inventory, plan, [operation], context), [])
  const candidateDocument = await readSource(candidate, 'candidate.docx')
  assert.ok(candidateDocument.blocks[0]?.text.includes(testCase.timing), 'source timing is copied unchanged into the final block')
  assert.ok(!candidateDocument.blocks[0]?.text.includes('2 000 zł'), 'the stale source amount is still replaced')
  assert.ok(candidateDocument.blocks[0]?.text.includes(newAmount))
  assert.equal(resolveInventoryOccurrences(source, inventory).occurrences[0]?.text, '2 000 zł')
}

// An explicit current answer is an ordinary opaque user authority; no phrase parser is involved.
const overrideOptions = structuredClone(fixture.authoritativeInput)
overrideOptions.userProvidedAnswers = [...(overrideOptions.userProvidedAnswers ?? []), { id: 'payment.timing', value: 'w terminie 7 dni od podpisania umowy' }]
const overrideInput = buildContractGenerationInput(overrideOptions)
const overrideText = 'Zaliczka 2 000 zł płatna w terminie 3 dni od zawarcia umowy.'
const overrideBytes = await packageFor(overrideText)
const overrideSource = await readSource(overrideBytes, 'payment-override.docx')
const overrideBlock = overrideSource.blocks[0]!
const oldTiming = 'w terminie 3 dni od zawarcia umowy'
const overrideInventory: SourceInventory = { items: [{ id: 'source-timing', label: 'source-defined timing', occurrences: [{ sourceRef: overrideBlock.blockId, span: spanOf(overrideBlock.text, oldTiming) }] }] }
const overridePlan: PlanResult = {
  status: 'READY', missingInputs: [], conflicts: [], retainedLiterals: [], operations: [{ blockId: overrideBlock.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Zaliczka 2 000 zł płatna w terminie 7 dni od podpisania umowy.' }],
  factChanges: [{ label: 'explicitly supplied timing', inventoryItemIds: ['source-timing'], newValue: 'w terminie 7 dni od podpisania umowy', newValueFormat: 'literal', authority: { kind: 'user', ref: 'payment.timing' } }],
}
assert.deepEqual(validateAuthorityGate(overrideInput, overrideInventory, overridePlan, { sourceDocument: overrideSource, productRules: fixture.expectedProductRules }), [], 'explicit replacement timing remains authoritative through the existing authority rules')

// Preserving timing is not a blanket authority to retain an old amount or identifier.
const staleAmountPlan = {
  status: 'READY' as const, missingInputs: [], conflicts: [], factChanges: [],
  retainedLiterals: [{ inventoryItemId: 'source-amount', reason: 'the surrounding source timing is preserved' }], operations: [],
}
const staleAmountInventory: SourceInventory = { items: [{ id: 'source-amount', label: 'old transaction amount', occurrences: [{ sourceRef: overrideBlock.blockId, span: spanOf(overrideBlock.text, '2 000 zł') }] }] }
assert.ok(validateAuthorityGate(overrideInput, staleAmountInventory, staleAmountPlan as unknown as PlanResult, { sourceDocument: overrideSource, productRules: {} }).some((issue) => /no valid authority reference/.test(issue)))

assert.match(TRANSFORMATION_INSTRUCTIONS, /preserve timing and deadline terms already defined by the source contract unless current authoritative input explicitly replaces that timing or creates a conflict/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /If only a payment amount changes, keep the source-defined timing.*do not request a new timing value/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /does not authorize retaining stale transaction-specific amounts, identifiers, client facts, addresses, or event dates/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /Do not inventory reusable contractual timing language merely because it is attached to a payment amount/i)
assert.doesNotMatch(TRANSFORMATION_INSTRUCTIONS, /within 3 days|within 5 days|7 days before the wedding|paymentTimingSignature|timingPhraseDictionary/i)
const runtime = await readFile(new URL('./generator.ts', import.meta.url), 'utf8')
assert.doesNotMatch(runtime, /payment.*(?:timing|deadline).*\/(?:\\d|\[)/i)
console.log('PASS generic source-defined payment timing preservation policy acceptance')
