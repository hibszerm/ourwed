import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { PLANNER_OPERATION_SCHEMAS, PLANNER_RESPONSE_SCHEMA } from './plannerResponseSchema'

type AjvLike = { compile(schema: object): (value: unknown) => boolean }
const Ajv = createRequire(import.meta.url)('ajv') as new () => AjvLike
const validate = new Ajv().compile(PLANNER_RESPONSE_SCHEMA)

const operationSchemas = PLANNER_RESPONSE_SCHEMA.properties.blockOperations.items.anyOf
const operationEnums = operationSchemas.map((variant) => variant.properties.operation.enum)
assert.deepEqual(operationEnums, [
  ['REPLACE_BLOCK_TEXT'],
  ['INSERT_BLOCK_AFTER', 'INSERT_BLOCK_BEFORE'],
  ['DELETE_BLOCK'],
])
for (const variant of operationSchemas) {
  assert.equal(variant.properties.operation.type, 'string', 'every operation discriminator declares its JSON type')
  assert.ok(variant.required.includes('operation'), 'every operation requires its discriminator')
  assert.equal(variant.additionalProperties, false)
  assert.deepEqual([...variant.required].sort(), Object.keys(variant.properties).sort(), 'strict object requirements exactly match properties')
}
assert.equal(operationEnums[2]?.[0], 'DELETE_BLOCK', 'DELETE_BLOCK retains its existing discriminator value')
assert.deepEqual(PLANNER_OPERATION_SCHEMAS[0].required, ['blockId', 'operation', 'finalText'], 'replacement operation shape remains unchanged')
assert.deepEqual(Object.keys(PLANNER_OPERATION_SCHEMAS[0].properties).sort(), ['blockId', 'finalText', 'operation'])

const missingInputShape = PLANNER_RESPONSE_SCHEMA.properties.missingInputs.items
assert.deepEqual(Object.keys(missingInputShape.properties).sort(), ['explanation', 'id', 'infoText', 'inputType', 'label', 'required', 'sourceContext'])
assert.deepEqual([...missingInputShape.required].sort(), Object.keys(missingInputShape.properties).sort())

const missingInputResponse = {
  status: 'MISSING_INPUT',
  missingInputs: [{ id: 'wedding.bride.pesel', label: 'PESEL', explanation: 'Required by source.', inputType: 'text', required: true, sourceContext: 'Party details.', infoText: null }],
  conflicts: [],
  blockOperations: [],
}
assert.equal(validate(missingInputResponse), true, 'the existing MISSING_INPUT response shape validates locally')

const readyResponse = {
  status: 'READY', missingInputs: [], conflicts: [], blockOperations: [
    { blockId: 'word/document.xml#p1', operation: 'REPLACE_BLOCK_TEXT', finalText: 'Updated paragraph.' },
    { anchorBlockId: 'word/document.xml#p1', operation: 'INSERT_BLOCK_AFTER', finalText: 'Inserted paragraph.', styleSourceBlockId: 'word/document.xml#p1' },
    { anchorBlockId: 'word/document.xml#p1', operation: 'INSERT_BLOCK_BEFORE', finalText: 'Inserted paragraph.', styleSourceBlockId: 'word/document.xml#p1' },
    { blockId: 'word/document.xml#p2', operation: 'DELETE_BLOCK' },
  ],
}
assert.equal(validate(readyResponse), true, 'READY response validates with every existing operation variant')
assert.equal(validate({ ...readyResponse, blockOperations: [{ blockId: 'word/document.xml#p2', operation: 'DELETE_BLOCK', extra: true }] }), false, 'strict branches reject undeclared fields')

function assertStructuredOutputCompatible(schema: unknown): void {
  const allowedKeys = new Set(['type', 'additionalProperties', 'properties', 'required', 'enum', 'items', 'anyOf'])
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return }
    if (!value || typeof value !== 'object') return
    const node = value as Record<string, unknown>
    for (const key of Object.keys(node)) assert.ok(allowedKeys.has(key), `unsupported schema keyword: ${key}`)
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false)
      assert.ok(Array.isArray(node.required))
      assert.ok(node.properties && typeof node.properties === 'object')
      assert.deepEqual([...(node.required as string[])].sort(), Object.keys(node.properties as object).sort())
    }
    if (node.anyOf !== undefined) assert.ok(Array.isArray(node.anyOf))
    for (const [key, child] of Object.entries(node)) {
      if (key === 'properties' && child && typeof child === 'object' && !Array.isArray(child)) Object.values(child).forEach(visit)
      else visit(child)
    }
  }
  visit(schema)
}
assertStructuredOutputCompatible(PLANNER_RESPONSE_SCHEMA)

console.log('PASS planner response schema acceptance')
