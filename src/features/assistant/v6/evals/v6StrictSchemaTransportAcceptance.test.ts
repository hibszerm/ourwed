/**
 * V6-F1.1A — Strict transport schema + argument parse/validation (no live Luna).
 */

import assert from 'node:assert/strict'
import {
  ASSISTANT_V6_AGENT_STEP_JSON_SCHEMA,
  parseV6AgentStepPayload,
} from '../agent/schema'
import { parseAndValidateToolArguments } from '../agent/validateToolArguments'

const schema = ASSISTANT_V6_AGENT_STEP_JSON_SCHEMA as {
  required: string[]
  properties: {
    toolCalls: {
      items: {
        properties: { arguments: { type: string } }
      }
    }
  }
}

assert.deepEqual(schema.required, [
  'status',
  'toolCalls',
  'text',
  'slot',
  'reason',
  'candidates',
])
assert.equal(
  schema.properties.toolCalls.items.properties.arguments.type,
  'string',
)
console.log('  OK schema shape (string arguments + all required)')

const searchArgs = JSON.stringify({
  type: 'Search',
  source: 'wedding',
  relativeTemporal: { kind: 'future_from_now', inclusive: true },
  sort: { field: 'wedding.date', direction: 'asc' },
  slice: { limit: 3 },
})

const toolCalls = parseV6AgentStepPayload({
  status: 'tool_calls',
  toolCalls: [
    {
      id: 'c1',
      name: 'query_collection',
      arguments: searchArgs,
    },
  ],
  text: null,
  slot: null,
  reason: null,
  candidates: null,
})
assert.equal(toolCalls.ok, true)
if (toolCalls.ok) {
  assert.equal(toolCalls.value.status, 'tool_calls')
  const slice = toolCalls.value.toolCalls?.[0]?.arguments.slice as
    | { limit?: number }
    | undefined
  assert.equal(slice?.limit, 3)
}
console.log('  OK tool_calls parse')

const final = parseV6AgentStepPayload({
  status: 'final',
  toolCalls: null,
  text: 'Gotowe.',
  slot: null,
  reason: null,
  candidates: null,
})
assert.equal(final.ok, true)
if (final.ok) assert.equal(final.value.text, 'Gotowe.')
console.log('  OK final parse')

const clarify = parseV6AgentStepPayload({
  status: 'clarify',
  toolCalls: null,
  text: null,
  slot: null,
  reason: 'need_limit',
  candidates: null,
})
assert.equal(clarify.ok, true)
if (clarify.ok) assert.equal(clarify.value.slot, 'unspecified')
console.log('  OK clarify parse (null slot → unspecified)')

const aliases = parseAndValidateToolArguments(
  'transform_collection',
  JSON.stringify({
    handle: 'col_1',
    operations: [
      {
        type: 'Filter',
        field: 'place',
        operator: 'equals',
        value: 'Villa Love',
      },
    ],
  }),
)
assert.equal(aliases.ok, true)
if (aliases.ok) {
  assert.equal(aliases.value.parentHandle, 'col_1')
  const ops = aliases.value.ops as Array<{ op: string; place?: { value: string } }>
  assert.equal(ops[0]?.op, 'Filter')
  assert.equal(ops[0]?.place?.value, 'Villa Love')
}
console.log('  OK transform/aggregate field aliases')

const aggAlias = parseAndValidateToolArguments(
  'aggregate_collection',
  JSON.stringify({ handle: 'col_2', metric: 'contract_value' }),
)
assert.equal(aggAlias.ok, true)
if (aggAlias.ok) {
  assert.equal(aggAlias.value.collection, 'col_2')
  assert.equal(aggAlias.value.aggregation, 'sum')
  assert.equal(aggAlias.value.measure, 'contract_value')
}
console.log('  OK aggregate handle/metric aliases')

const unsupported = parseV6AgentStepPayload({
  status: 'unsupported',
  toolCalls: null,
  text: null,
  slot: null,
  reason: 'group_by_month_not_supported',
  candidates: null,
})
assert.equal(unsupported.ok, true)
console.log('  OK unsupported parse')

const badJson = parseAndValidateToolArguments(
  'query_collection',
  '{not-json',
)
assert.equal(badJson.ok, false)
if (!badJson.ok) assert.equal(badJson.reason, 'INVALID_TOOL_ARGUMENT_JSON')
console.log('  OK INVALID_TOOL_ARGUMENT_JSON')

const typeAlias = parseAndValidateToolArguments(
  'query_collection',
  JSON.stringify({
    relativeTemporal: { type: 'future_from_now' },
    sort: { field: 'wedding.date', direction: 'asc' },
    slice: { limit: 3 },
  }),
)
assert.equal(typeAlias.ok, true)
if (typeAlias.ok) {
  const rt = typeAlias.value.relativeTemporal as {
    kind?: string
    inclusive?: boolean
  }
  assert.equal(rt.kind, 'future_from_now')
  assert.equal(rt.inclusive, true)
}
console.log('  OK type→kind temporal normalize')

const badObj = parseAndValidateToolArguments(
  'aggregate_collection',
  JSON.stringify({ collection: 'x', aggregation: 'sum' }),
)
assert.equal(badObj.ok, false)
if (!badObj.ok) assert.equal(badObj.reason, 'VALIDATION_ERROR')
console.log('  OK VALIDATION_ERROR')

const objectArgs = parseV6AgentStepPayload({
  status: 'tool_calls',
  toolCalls: [
    {
      id: 'c1',
      name: 'query_collection',
      arguments: { type: 'Search', source: 'wedding' },
    },
  ],
  text: null,
  slot: null,
  reason: null,
  candidates: null,
})
assert.equal(objectArgs.ok, false)
if (!objectArgs.ok) {
  assert.match(objectArgs.reason, /VALIDATION_ERROR|arguments_must_be_json_string/)
}
console.log('  OK reject non-string arguments')

console.log('v6StrictSchemaTransportAcceptance PASS')
