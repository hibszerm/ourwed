import assert from 'node:assert/strict'
import { isGenerationResponse, isReviewResponse } from './generationProtocol'

const replace = { kind: 'replace', blockId: 'word/document.xml#p2', text: 'Updated paragraph.' }
const insert = { kind: 'insert_after', blockId: 'word/document.xml#p3', text: 'Additional service paragraph.' }

assert.equal(isGenerationResponse({ status: 'READY', edits: [replace] }), true)
assert.equal(isGenerationResponse({ status: 'READY', edits: [insert] }), true)
assert.equal(isGenerationResponse({ status: 'READY', edits: [replace, insert] }), true)
assert.equal(isGenerationResponse({ status: 'READY' }), false, 'READY requires edits')
assert.equal(isGenerationResponse({ status: 'READY', edits: [{ ...replace, kind: 'patch' }] }), false, 'unknown edit kind is rejected')
assert.equal(isGenerationResponse({ status: 'READY', edits: [{ ...replace, blockId: '' }] }), false, 'empty block ID is rejected')
assert.equal(isGenerationResponse({ status: 'READY', edits: [{ ...replace, blockId: '   ' }] }), false, 'blank block ID is rejected')
assert.equal(isGenerationResponse({ status: 'READY', edits: [{ ...replace, text: '' }] }), false, 'empty replacement is rejected')
assert.equal(isGenerationResponse({ status: 'READY', edits: [{ ...insert, text: '  ' }] }), false, 'empty insertion is rejected')
assert.equal(isGenerationResponse({ status: 'READY', edits: [{ ...replace, quote: 'source text' }] }), false, 'extra span/provenance fields are rejected')

assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: ['What is the client email?'] }), true)
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: [] }), false, 'missing-input list must be non-empty')
assert.equal(isGenerationResponse({ status: 'MISSING_INPUT', missingInputs: ['Question?'], edits: [] }), false, 'MISSING_INPUT cannot contain edits')
assert.equal(isGenerationResponse({ status: 'CONFLICT_INPUT', conflicts: ['Two authoritative dates disagree.'] }), true)
assert.equal(isGenerationResponse({ status: 'CONFLICT_INPUT', conflicts: [] }), false, 'conflict list must be non-empty')
assert.equal(isGenerationResponse({ status: 'CONFLICT_INPUT', conflicts: ['Conflict'], edits: [] }), false, 'CONFLICT_INPUT cannot contain edits')
assert.equal(isGenerationResponse({ status: 'READY', edits: [], missingInputs: [] }), false, 'status branches cannot be mixed')

assert.equal(isReviewResponse({ status: 'PASS' }), true)
assert.equal(isReviewResponse({ status: 'PASS', findings: [] }), false, 'PASS cannot contain findings')
assert.equal(isReviewResponse({ status: 'FAIL', findings: ['A material payment term changed.'] }), true)
assert.equal(isReviewResponse({ status: 'FAIL' }), false, 'FAIL requires findings')
assert.equal(isReviewResponse({ status: 'FAIL', findings: [] }), false, 'FAIL findings cannot be empty')
assert.equal(isReviewResponse({ status: 'FAIL', findings: ['   '] }), false, 'FAIL findings cannot be blank')

// Protocol-shape guard: a whole-block handle and replacement text are the only edit coordinates.
const editKeys = Object.keys(replace).sort()
assert.deepEqual(editKeys, ['blockId', 'kind', 'text'])
for (const forbiddenKey of ['quote', 'sourceRef', 'occurrenceIndex', 'offset', 'start', 'end', 'spanId', 'factChange', 'inventoryDisposition', 'patch']) {
  assert.equal(Object.hasOwn(replace, forbiddenKey), false, `${forbiddenKey} is not part of the edit protocol`)
}
assert.deepEqual(Object.keys({ status: 'READY', edits: [replace] }).sort(), ['edits', 'status'])
assert.deepEqual(Object.keys({ status: 'MISSING_INPUT', missingInputs: ['Question?'] }).sort(), ['missingInputs', 'status'])
assert.deepEqual(Object.keys({ status: 'CONFLICT_INPUT', conflicts: ['Conflict'] }).sort(), ['conflicts', 'status'])

console.log('PASS simplified generation/reviewer protocol acceptance')
