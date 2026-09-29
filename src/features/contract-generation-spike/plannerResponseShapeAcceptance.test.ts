import assert from 'node:assert/strict'
import {
  AUTHORITATIVE_FIELD_SEMANTICS,
  sanitizePlannerOperations,
  TRANSFORMATION_INSTRUCTIONS,
} from './generator'
import type { BlockOperation } from './blockDocxEditor'

const rawOperations: BlockOperation[] = [
  { blockId: 'word/document.xml#p1', operation: 'REPLACE_BLOCK_TEXT', finalText: 'Partial edit' },
]
const readyOperations: BlockOperation[] = [
  { blockId: 'word/document.xml#p2', operation: 'REPLACE_BLOCK_TEXT', finalText: 'Complete edit' },
]

// 1/2: Required missing input preserves raw diagnostics but exposes no executable operations.
const missingOne = sanitizePlannerOperations('MISSING_INPUT', rawOperations)
assert.deepEqual(missingOne.rawOperations, rawOperations)
assert.equal(missingOne.rawOperationCount, 1)
assert.deepEqual(missingOne.operations, [])
assert.equal(missingOne.operationCount, 0)
assert.equal(missingOne.discardedOperationCount, 1)
assert.deepEqual(sanitizePlannerOperations('MISSING_INPUT', undefined).operations, [])

// 3: Conflict status also discards operations.
const conflict = sanitizePlannerOperations('CONFLICT_INPUT', rawOperations)
assert.deepEqual(conflict.rawOperations, rawOperations)
assert.deepEqual(conflict.operations, [])
assert.equal(conflict.operationCount, 0)

// 4/5: READY retains its own complete plan; an earlier partial response is not reused.
const ready = sanitizePlannerOperations('READY', readyOperations)
assert.deepEqual(ready.operations, readyOperations)
assert.deepEqual(ready.rawOperations, readyOperations)
const continuation = sanitizePlannerOperations('READY', readyOperations)
assert.deepEqual(continuation.operations, readyOperations)
assert.equal(continuation.operations.some((operation) => 'blockId' in operation && operation.blockId === 'word/document.xml#p1'), false)

// 6-9: The shared planner must complete the audit before choosing status or producing operations.
assert.match(TRANSFORMATION_INSTRUCTIONS, /complete a full audit of every source-required factual change/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /Do not stop after finding the first missing fact/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /Return all independent missing inputs in one response/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /Generate transformation operations only for READY/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /MISSING_INPUT or CONFLICT_INPUT, return no operations/i)

// 10/11: Previously established generic fact-ownership and payment-allocation rules remain in force.
assert.match(AUTHORITATIVE_FIELD_SEMANTICS, /source-owned factual values are not authoritative for the replacement entity/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /source-required detailed allocation.*do not infer or preserve an allocation.*return MISSING_INPUT/i)

// 12: Shared production instructions do not embed fixture facts or block identifiers.
assert.doesNotMatch(`${AUTHORITATIVE_FIELD_SEMANTICS} ${TRANSFORMATION_INSTRUCTIONS}`, /Case.?03|Zuzanna|Kacper|Karolina|Paweł|Pakiet Film \+ Foto Signature|16\s?800|5\s?000|7\s?400|word\/document\.xml#p\d+/iu)

console.log('PASS planner response-shape acceptance')
