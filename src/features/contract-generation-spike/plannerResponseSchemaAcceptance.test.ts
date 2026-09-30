import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { PLANNER_OPERATION_SCHEMAS, PLANNER_RESPONSE_SCHEMA, SOURCE_INVENTORY_SCHEMA } from './plannerResponseSchema'

type AjvLike = { compile(schema: object): (value: unknown) => boolean }
const Ajv = createRequire(import.meta.url)('ajv') as new () => AjvLike
const validatePlan = new Ajv().compile(PLANNER_RESPONSE_SCHEMA)
const validateInventory = new Ajv().compile(SOURCE_INVENTORY_SCHEMA)
const inventory = { coveredSourceRefs: ['word/document.xml#p1'], items: [{ id: 'item-1', label: 'free text', conceptId: null, occurrences: [{ sourceRef: 'word/document.xml#p1', quote: null }] }] }
assert.equal(validateInventory(inventory), true)
assert.equal(validateInventory({ coveredSourceRefs: ['word/document.xml#p1'], items: [{ id: 'item-1', label: 'free text', conceptId: null, occurrences: [{ sourceRef: 'word/document.xml#p1', span: { start: 1, end: 3 } }] }] }), false, 'legacy model-authored offsets are rejected')
assert.equal(validateInventory({ coveredSourceRefs: ['word/document.xml#p1'], items: [{ id: 'item-1', label: 'free text', conceptId: null, occurrences: [{ sourceRef: 'word/document.xml#p1', quote: null, span: { start: 1, end: 3 } }] }] }), false, 'offsets remain forbidden even alongside a valid quote')
assert.equal(validateInventory({ coveredSourceRefs: ['word/document.xml#p1'], items: [{ id: 'item-1', label: 'free text', conceptId: null, occurrences: [{ sourceRef: 'word/document.xml#p1' }] }] }), false, 'the exact quote selector property is required')
assert.equal(validateInventory({ coveredSourceRefs: ['word/document.xml#p1'], items: [{ id: 'item-1', label: 'free text', conceptId: null, occurrences: [{ sourceRef: 'word/document.xml#p1', quote: 42 }] }] }), false, 'a sub-block selector must be text or null')
assert.equal(validateInventory({ coveredSourceRefs: [], items: [{ value: 'OLD-001', sourceRefs: [], label: 'x', kind: 'contract-number' }] }), false, 'inventory rejects retold literals and ontology fields')
const base = { missingInputs: [], conflicts: [], factChanges: [], retainedLiterals: [], operations: [], extraInsertions: [] }
for (const status of ['MISSING_INPUT', 'CONFLICT_INPUT', 'READY']) assert.equal(validatePlan({ ...base, status }), true)
const missing = { ...base, status: 'MISSING_INPUT', missingInputs: [{ id: 'new-id', label: 'free text label', explanation: 'free text reason', inputType: 'text', required: true, sourceContext: 'source', sourceRefs: ['word/document.xml#p1'], inventoryItemIds: ['item-1'], infoText: null }] }
assert.equal(validatePlan(missing), true, 'multiple generic missing-input records are supported')
const plan = { status: 'READY', missingInputs: [], conflicts: [], factChanges: [{ label: 'arbitrary label', inventoryItemId: 'item-1', inventoryItemIds: ['item-1'], sourceRef: 'word/document.xml#p1', expectedSource: 'old', sourceProvenance: null, newValue: 'NEW-001', newValueFormat: 'literal', authority: { kind: 'user', ref: 'answer.id' } }], retainedLiterals: [{ inventoryItemId: 'item-2', authority: { kind: 'product_rule', ref: 'preserveSourcePackageExactly' }, reason: 'context only' }], operations: [], extraInsertions: [] }
assert.equal(validatePlan(plan), true)
assert.equal(validatePlan({ ...plan, retainedLiterals: [{ inventoryItemId: 'item-2', reason: 'free text only' }] }), false, 'retention authority is required by schema')
assert.equal(validatePlan({ ...plan, operations: ['rewrite'] }), true, 'operation payload shape is rejected at deterministic protocol validation')
assert.deepEqual(PLANNER_OPERATION_SCHEMAS, [], 'the planner schema grants no block-text operation capability')
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
