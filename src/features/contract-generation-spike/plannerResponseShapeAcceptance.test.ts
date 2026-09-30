import assert from 'node:assert/strict'
import { sanitizePlannerOperations, SOURCE_INVENTORY_INSTRUCTIONS, TRANSFORMATION_INSTRUCTIONS, REVIEW_INSTRUCTIONS } from './generator'
import type { BlockOperation } from './blockDocxEditor'
const operation: BlockOperation = { blockId: 'word/document.xml#p1', operation: 'REPLACE_BLOCK_TEXT', finalText: 'changed' }
for (const status of ['MISSING_INPUT','CONFLICT_INPUT'] as const) assert.deepEqual(sanitizePlannerOperations(status, [operation]).operations, [])
assert.deepEqual(sanitizePlannerOperations('READY', [operation]).operations, [operation])
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /without receiving or inferring any new client or wedding data/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /never count characters or invent start\/end offsets/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /copy the smallest exact visible quote/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /spacing, punctuation, diacritics, and capitalization/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /exactly one exact match/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /full-document and full-inventory sweep/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /never retype old source literals/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /free-text retention reason.*never authority/i)
assert.match(REVIEW_INSTRUCTIONS, /mechanical changed-block diff/i)
assert.match(REVIEW_INSTRUCTIONS, /Do not edit or repair/i)
console.log('PASS generic planner/reviewer boundary acceptance')
