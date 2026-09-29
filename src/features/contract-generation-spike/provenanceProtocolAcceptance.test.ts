import assert from 'node:assert/strict'
import { makeInput, SOURCE_INVENTORY_INSTRUCTIONS, TRANSFORMATION_INSTRUCTIONS, validateAuthorityGate, type GenerationInput, type PlanResult, type SourceInventory } from './generator'

const source: GenerationInput['sourceDocument'] = { fileName: 'protocol.docx', blocks: [{ blockId: 'word/document.xml#p0', part: 'word/document.xml', index: 0, kind: 'body', text: 'Date 04.02.2028; total 10 600,00 zł; old fact 18/2027', context: '' }] }
const wedding: GenerationInput['wedding'] = {
  bride: { name: 'Ada', phone: '111222333', email: 'ada@example.test' }, groom: { name: 'Bar', phone: '444555666' },
  weddingDate: '22.05.2028', contractAddress: 'Address 1', contractValuePln: 10600, depositPln: 2000, remainingDueDate: '7 days',
  locations: { bridePreparations: '', groomPreparations: '', ceremony: '', reception: '' },
}
const input = makeInput({ generationDate: '04.02.2028', sourceDocument: source, wedding, packagePolicy: { preserveSourcePackageExactly: true }, extras: [], userProvidedAnswers: [{ id: 'wedding.bride.pesel', value: '96041412344' }] })
const inventory: SourceInventory = { items: [{ id: 'old-fact', label: 'free text', occurrences: [{ sourceRef: 'word/document.xml#p0', span: { start: 46, end: 53 } }] }] }
const base: PlanResult = { status: 'READY', missingInputs: [], conflicts: [], factChanges: [], retainedLiterals: [], operations: [{ blockId: source.blocks[0]!.blockId, operation: 'REPLACE_BLOCK_TEXT', finalText: 'Date 04.02.2028; total 10 600,00 zł; new fact' }] }
const fact = (authority: PlanResult['factChanges'][number]['authority'], newValue: string): PlanResult['factChanges'][number] => ({ label: 'free-form label', inventoryItemIds: ['old-fact'], newValue, newValueFormat: 'literal', authority })

assert.deepEqual(validateAuthorityGate(input, inventory, { ...base, factChanges: [fact({ kind: 'crm', ref: 'wedding.bride.name' }, 'Ada')] }), [])
assert.ok(validateAuthorityGate(input, inventory, { ...base, factChanges: [fact({ kind: 'crm', ref: 'crm:wedding.bride.name' }, 'Ada')] }).some((issue) => /canonical authority reference/.test(issue)))
assert.ok(validateAuthorityGate(input, inventory, { ...base, factChanges: [fact({ kind: 'user', ref: 'user:wedding.bride.pesel' }, '96041412344')] }).some((issue) => /canonical authority reference/.test(issue)))
assert.ok(validateAuthorityGate(input, { items: [{ ...inventory.items[0]!, occurrences: [{ sourceRef: 'wedding.bride.name', span: null }] }] }, base).some((issue) => /unsupported source reference/.test(issue)))
assert.ok(validateAuthorityGate(input, inventory, { ...base, factChanges: [fact({ kind: 'crm', ref: 'wedding.noSuchField' }, 'Invented')] }).some((issue) => /Invalid authority reference/.test(issue)))
const badMath = structuredClone(input); badMath.deterministicDerivedFacts[0]!.value = '8601'
assert.ok(validateAuthorityGate(badMath, inventory, base).some((issue) => /does not match its declared arithmetic/.test(issue)))
assert.deepEqual(input.deterministicDerivedFacts[0]!.inputRefs, ['crm:financials.contractValuePln', 'crm:financials.depositPln'])

assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /canonical sourceRef/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /zero-based, end-exclusive Unicode-code-point span/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /Do not copy or paraphrase the selected text/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /never retype old source literals/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /free-text retention reason is explanatory only and is never authority/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /preserve the source conclusion place/i)
console.log('PASS generic canonical authority and source-reference protocol')
