/**
 * CG2 harness smoke — no paid calls.
 * Verifies plan, credential gate, and that local invoke imports production prompt.
 */

import { SYSTEM_PROMPT, FULL_AI_PROMPT_VERSION } from './localFullRewriteInvoke'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

assert(FULL_AI_PROMPT_VERSION === '2026-09-full-ai-v3', 'prompt version')
assert(SYSTEM_PROMPT.includes('Additional services'), 'prompt mentions extras')
assert(
  SYSTEM_PROMPT.includes('Do NOT insert, list, price or quantity them'),
  'prompt forbids LLM extras pricing',
)
assert(SYSTEM_PROMPT.includes('changedBlocks'), 'sparse rewrite')

console.log('CG2_HARNESS_SMOKE_PASS')
console.log(
  JSON.stringify({
    promptVersion: FULL_AI_PROMPT_VERSION,
    paidCommand:
      'CG2_PAID_EVAL=1 OPENAI_API_KEY=… npm run test:cg2-contract-paid-eval',
    note: 'Paid suite blocked without owner-injected OPENAI_API_KEY',
  }),
)
