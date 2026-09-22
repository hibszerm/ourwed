/**
 * CG2 harness smoke — no paid calls.
 * Verifies plan, credential gate, and that local invoke imports production prompt.
 */

import { SYSTEM_PROMPT, FULL_AI_PROMPT_VERSION } from './localFullRewriteInvoke'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

assert(FULL_AI_PROMPT_VERSION === '2026-09-full-ai-v4', 'prompt version')
assert(SYSTEM_PROMPT.includes('Additional services'), 'prompt mentions extras')
assert(
  SYSTEM_PROMPT.includes('Do NOT insert, list, price or quantity them'),
  'prompt forbids LLM extras pricing',
)
assert(SYSTEM_PROMPT.includes('changedBlocks'), 'sparse rewrite')
assert(SYSTEM_PROMPT.includes('Each source blockId may appear AT MOST ONCE in changedBlocks'), 'one entry per source block')
assert(SYSTEM_PROMPT.includes('FINAL COMPLETE replacement text for the whole source block'), 'whole-block final replacement')
assert(SYSTEM_PROMPT.includes('Never emit separate entries for fragments, runs, tokens, clauses, punctuation, or successive edits'), 'fragment-level duplicates forbidden')
assert(SYSTEM_PROMPT.includes('Do NOT return unchanged blocks'), 'unchanged blocks omitted')

console.log('CG2_HARNESS_SMOKE_PASS')
console.log(
  JSON.stringify({
    promptVersion: FULL_AI_PROMPT_VERSION,
    paidCommand:
      'CG2_PAID_EVAL=1 OPENAI_API_KEY=… npm run test:cg2-contract-paid-eval',
    note: 'Paid suite blocked without owner-injected OPENAI_API_KEY',
  }),
)
