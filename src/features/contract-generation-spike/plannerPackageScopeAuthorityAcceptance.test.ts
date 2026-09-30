import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { TRANSFORMATION_INSTRUCTIONS } from './generator'

assert.match(TRANSFORMATION_INSTRUCTIONS, /source-defined base service scope.*obligations, deliverables, workflow, performance obligations, and service terms/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /Current package name\/selection is an authoritative transaction fact/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /changing package identity does not authorize rewriting source-defined base service obligations/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /package snapshot\/items are authoritative only for facts they explicitly state/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /do not authorize reconstructing or inferring other obligations/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /semantic mismatch.*alone is not MISSING_INPUT or CONFLICT_INPUT/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /Explicit current extras.*separate authoritative transaction facts/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /do not authorize wholesale reconstruction of unrelated source base scope/i)
assert.match(TRANSFORMATION_INSTRUCTIONS, /genuine unresolved source-required facts and genuine authority conflicts may still require MISSING_INPUT or CONFLICT_INPUT/i)
assert.doesNotMatch(TRANSFORMATION_INSTRUCTIONS, /photograph|videograph|Video Standard|Pełny Kadr|Case 05/i)

// The clarification is normative Planner guidance only; existing normalized authority fields remain separate.
const inputTypeSource = await readFile(new URL('./contractGenerationInput.ts', import.meta.url), 'utf8')
assert.match(inputTypeSource, /package: \{/i)
assert.match(inputTypeSource, /extras:\s*Array<\{/i)
assert.doesNotMatch(inputTypeSource, /baseServiceScope|serviceScopeAuthority/i)
console.log('PASS generic Planner package identity and source-scope authority acceptance')
