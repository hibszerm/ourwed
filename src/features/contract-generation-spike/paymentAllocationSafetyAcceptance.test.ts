import assert from 'node:assert/strict'
import { sanitizePlannerOperations } from './generator'
import type { BlockOperation } from './blockDocxEditor'
const operation: BlockOperation = { blockId: 'word/document.xml#p1', operation: 'REPLACE_BLOCK_TEXT', finalText: 'any payment wording' }
assert.deepEqual(sanitizePlannerOperations('MISSING_INPUT', [operation]).operations, [])
assert.deepEqual(sanitizePlannerOperations('CONFLICT_INPUT', [operation]).operations, [])
assert.deepEqual(sanitizePlannerOperations('READY', [operation]).operations, [operation])
console.log('PASS payment language has no deterministic completeness classifier')
