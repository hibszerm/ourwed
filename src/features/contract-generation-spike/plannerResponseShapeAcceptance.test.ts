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
assert.match(TRANSFORMATION_INSTRUCTIONS, /authority\.ref to the selected normalized input fact's \.source copied byte-for-byte as an opaque identifier/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /Never construct, shorten, normalize, translate, infer, alias, or add\/remove a namespace from an authority ref/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /Each semantic inventory item receives exactly one semantic disposition/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /Never assign the same inventoryItemId to multiple factChanges/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /A factChange represents the authoritative semantic fact once; do not split it by occurrence or display format/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /Executable operations render that one fact change across all its occurrences/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /do not create another factChange just to express a different occurrence format/i)
assert.match(REVIEW_INSTRUCTIONS, /mechanical changed-block diff/i)
assert.match(REVIEW_INSTRUCTIONS, /Do not edit or repair/i)
console.log('PASS generic planner/reviewer boundary acceptance')
