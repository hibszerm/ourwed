import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { REVIEW_INSTRUCTIONS } from './generator'

assert.match(REVIEW_INSTRUCTIONS, /Review independently/i)
assert.match(REVIEW_INSTRUCTIONS, /source contract as authority for clauses, scope, and structure/i)
assert.match(REVIEW_INSTRUCTIONS, /current input and user answers as authority for transaction facts/i)
assert.match(REVIEW_INSTRUCTIONS, /Natural grammatical variation is allowed/i)
assert.match(REVIEW_INSTRUCTIONS, /do not fail because rendered text differs literally from CRM display text/i)
assert.match(REVIEW_INSTRUCTIONS, /do not require quote, span, or occurrence provenance/i)
assert.match(REVIEW_INSTRUCTIONS, /PASS only if no material issue exists/i)
assert.match(REVIEW_INSTRUCTIONS, /otherwise return FAIL with concise material findings/i)
assert.match(REVIEW_INSTRUCTIONS, /Do not edit or repair/i)

const harness = await readFile(new URL('./multi-template-acceptance/harness.ts', import.meta.url), 'utf8')
assert.match(harness, /provider\.generate\([\s\S]*?provider\.review\(/)
assert.doesNotMatch(harness, /provider\.(?:inventory|plan)\(/)
console.log('PASS concise independent reviewer boundary')
