import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { PLANNER_OPERATION_SCHEMAS, PLANNER_RESPONSE_SCHEMA, SOURCE_INVENTORY_SCHEMA } from './plannerResponseSchema'

type AjvLike = { compile(schema: object): (value: unknown) => boolean }
const Ajv = createRequire(import.meta.url)('ajv') as new () => AjvLike
const validatePlan = new Ajv().compile(PLANNER_RESPONSE_SCHEMA)
const validateInventory = new Ajv().compile(SOURCE_INVENTORY_SCHEMA)
const inventory = { items: [{ value: 'OLD-001', sourceRefs: ['word/document.xml#p1'], label: 'free text' }] }
assert.equal(validateInventory(inventory), true)
assert.equal(validateInventory({ items: [{ value: 'OLD-001', sourceRefs: [], label: 'x', kind: 'contract-number' }] }), false, 'inventory is minimal and rejects ontology fields')
const base = { missingInputs: [], conflicts: [], factChanges: [], retainedLiterals: [], operations: [] }
for (const status of ['MISSING_INPUT', 'CONFLICT_INPUT', 'READY']) assert.equal(validatePlan({ ...base, status }), true)
const missing = { ...base, status: 'MISSING_INPUT', missingInputs: [{ id: 'new-id', label: 'free text label', explanation: 'free text reason', inputType: 'text', required: true, sourceContext: 'source', sourceRefs: ['word/document.xml#p1'], infoText: null }] }
assert.equal(validatePlan(missing), true, 'multiple generic missing-input records are supported')
const plan = { status: 'READY', missingInputs: [], conflicts: [], factChanges: [{ label: 'arbitrary label', oldValues: ['OLD-001'], newValue: 'NEW-001', authority: { kind: 'user', ref: 'answer.id' }, sourceRefs: ['word/document.xml#p1'] }], retainedLiterals: [{ value: 'UNCHANGED', reason: 'any free text' }], operations: [{ blockId: 'word/document.xml#p1', operation: 'REPLACE_BLOCK_TEXT', finalText: 'new text' }] }
assert.equal(validatePlan(plan), true)
assert.equal(validatePlan({ ...plan, operations: [{ blockId: 'word/document.xml#p1', operation: 'DELETE_BLOCK', extra: true }] }), false)
assert.deepEqual(PLANNER_OPERATION_SCHEMAS.map((variant) => variant.properties.operation.enum), [['REPLACE_BLOCK_TEXT'], ['INSERT_BLOCK_AFTER','INSERT_BLOCK_BEFORE'], ['DELETE_BLOCK']])
function assertStructuredOutputCompatible(schema: unknown): void {
  const allowed = new Set(['type','additionalProperties','properties','required','enum','items','anyOf'])
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return }
    if (!value || typeof value !== 'object') return
    const node = value as Record<string, unknown>
    for (const key of Object.keys(node)) assert.ok(allowed.has(key), `unsupported schema keyword: ${key}`)
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false)
      assert.deepEqual([...(node.required as string[])].sort(), Object.keys(node.properties as object).sort())
    }
    Object.entries(node).forEach(([key, child]) => { if (key === 'properties' && child && typeof child === 'object') Object.values(child).forEach(visit); else visit(child) })
  }
  visit(schema)
}
assertStructuredOutputCompatible(SOURCE_INVENTORY_SCHEMA)
assertStructuredOutputCompatible(PLANNER_RESPONSE_SCHEMA)
console.log('PASS planner provenance schema acceptance')
