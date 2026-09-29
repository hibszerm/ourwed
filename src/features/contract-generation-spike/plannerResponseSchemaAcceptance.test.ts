import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { PLANNER_OPERATION_SCHEMAS, PLANNER_RESPONSE_SCHEMA, SOURCE_INVENTORY_SCHEMA } from './plannerResponseSchema'

type AjvLike = { compile(schema: object): (value: unknown) => boolean }
const Ajv = createRequire(import.meta.url)('ajv') as new () => AjvLike
const validatePlan = new Ajv().compile(PLANNER_RESPONSE_SCHEMA)
const validateInventory = new Ajv().compile(SOURCE_INVENTORY_SCHEMA)
const inventory = { items: [{ id: 'item-1', label: 'free text', occurrences: [{ sourceRef: 'word/document.xml#p1', span: null }] }] }
assert.equal(validateInventory(inventory), true)
assert.equal(validateInventory({ items: [{ value: 'OLD-001', sourceRefs: [], label: 'x', kind: 'contract-number' }] }), false, 'inventory rejects retold literals and ontology fields')
const base = { missingInputs: [], conflicts: [], factChanges: [], retainedLiterals: [], operations: [] }
for (const status of ['MISSING_INPUT', 'CONFLICT_INPUT', 'READY']) assert.equal(validatePlan({ ...base, status }), true)
const missing = { ...base, status: 'MISSING_INPUT', missingInputs: [{ id: 'new-id', label: 'free text label', explanation: 'free text reason', inputType: 'text', required: true, sourceContext: 'source', sourceRefs: ['word/document.xml#p1'], inventoryItemIds: ['item-1'], infoText: null }] }
assert.equal(validatePlan(missing), true, 'multiple generic missing-input records are supported')
const plan = { status: 'READY', missingInputs: [], conflicts: [], factChanges: [{ label: 'arbitrary label', inventoryItemIds: ['item-1'], newValue: 'NEW-001', newValueFormat: 'literal', authority: { kind: 'user', ref: 'answer.id' } }], retainedLiterals: [{ inventoryItemId: 'item-2', authority: { kind: 'product_rule', ref: 'preserveSourcePackageExactly' }, reason: 'context only' }], operations: [{ blockId: 'word/document.xml#p1', operation: 'REPLACE_BLOCK_TEXT', finalText: 'new text' }] }
assert.equal(validatePlan(plan), true)
assert.equal(validatePlan({ ...plan, retainedLiterals: [{ inventoryItemId: 'item-2', reason: 'free text only' }] }), false, 'retention authority is required by schema')
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
