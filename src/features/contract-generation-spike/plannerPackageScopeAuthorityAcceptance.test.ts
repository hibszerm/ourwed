import assert from 'node:assert/strict'
import { GENERATION_INSTRUCTIONS } from './generator'

assert.match(GENERATION_INSTRUCTIONS, /source defines the contract's clauses, obligations, service scope, legal and commercial meaning/i)
assert.match(GENERATION_INSTRUCTIONS, /Preserve unrelated content and make only changes needed for this transaction/i)
assert.match(GENERATION_INSTRUCTIONS, /Do not invent legal clauses or alter base service scope/i)
console.log('PASS generic generation preserves source scope')
