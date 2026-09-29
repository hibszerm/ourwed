import assert from 'node:assert/strict'
import { sanitizePlannerOperations, SOURCE_INVENTORY_INSTRUCTIONS, TRANSFORMATION_INSTRUCTIONS, REVIEW_INSTRUCTIONS } from './generator'
import type { BlockOperation } from './blockDocxEditor'
const operation: BlockOperation = { blockId: 'word/document.xml#p1', operation: 'REPLACE_BLOCK_TEXT', finalText: 'changed' }
for (const status of ['MISSING_INPUT','CONFLICT_INPUT'] as const) assert.deepEqual(sanitizePlannerOperations(status, [operation]).operations, [])
assert.deepEqual(sanitizePlannerOperations('READY', [operation]).operations, [operation])
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /without receiving or inferring any new client or wedding data/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /free-form label/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /full-document and full-inventory sweep/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /semantic declarations: missingInputs, factChanges, retainedLiterals/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /labels and reasons are free text and have no machine meaning/i)
assert.match(REVIEW_INSTRUCTIONS, /mechanical changed-block diff/i)
assert.match(REVIEW_INSTRUCTIONS, /Do not edit or repair/i)
console.log('PASS generic planner/reviewer boundary acceptance')
