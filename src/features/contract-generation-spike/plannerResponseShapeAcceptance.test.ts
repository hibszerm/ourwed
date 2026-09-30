import assert from 'node:assert/strict'
import { sanitizePlannerOperations, SOURCE_INVENTORY_INSTRUCTIONS, TRANSFORMATION_INSTRUCTIONS, REVIEW_INSTRUCTIONS } from './generator'
import type { BlockOperation } from './blockDocxEditor'
const operation: BlockOperation = { blockId: 'word/document.xml#p1', operation: 'REPLACE_BLOCK_TEXT', finalText: 'changed' }
for (const status of ['MISSING_INPUT','CONFLICT_INPUT'] as const) assert.deepEqual(sanitizePlannerOperations(status, [operation]).operations, [])
assert.deepEqual(sanitizePlannerOperations('READY', [operation]).operations, [operation])
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /without receiving or inferring new client or wedding data/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /coveredSourceRefs containing every canonical sourceRef/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /exact quote for the smallest source span/i)
assert.match(SOURCE_INVENTORY_INSTRUCTIONS, /exactly one occurrence/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /full-document and full-inventory sweep/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /never retype old source literals/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /free-text retention reason.*never authority/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /authority\.ref to the selected normalized input fact's \.source copied byte-for-byte as an opaque identifier/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /Never construct, shorten, normalize, translate, infer, alias, or add\/remove a namespace from an authority ref/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /Each inventory item represents one atomic source occurrence/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /exact sourceRef, and one expectedSource literal/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /Do not emit ordinary block operations or complete block text/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /source-defined corresponding slot/i)
assert.match(REVIEW_INSTRUCTIONS, /mechanical changed-block diff/i)
assert.match(REVIEW_INSTRUCTIONS, /Do not edit or repair/i)
console.log('PASS generic planner/reviewer boundary acceptance')
