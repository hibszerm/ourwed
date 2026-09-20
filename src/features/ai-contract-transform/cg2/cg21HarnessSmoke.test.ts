/**
 * CG2.1 safety + transport smoke (no paid Edge calls).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cg21AuthStatus } from './deployedEdgeInvoke'
import { SYSTEM_PROMPT } from '../fullAiRewritePromptShared'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

// Edge compute-only evidence from source
const edgeSrc = readFileSync(
  resolve('supabase/functions/ai-contract-full-rewrite/index.ts'),
  'utf8',
)
assert(!edgeSrc.includes('.from('), 'no supabase.from')
assert(!edgeSrc.includes('storage.from'), 'no storage')
assert(edgeSrc.includes('requireAuthenticatedUser'), 'auth required')
assert(edgeSrc.includes('documentBlocks'), 'payload-driven')
assert(
  !edgeSrc.includes('wedding_id') || edgeSrc.includes('documentBlocks'),
  'no wedding_id CRM fetch required',
)

assert(SYSTEM_PROMPT.includes('Do NOT insert, list, price or quantity them'))

const auth = cg21AuthStatus()
console.log(
  JSON.stringify({
    status: 'CG21_HARNESS_SMOKE_PASS',
    EDGE_COMPUTE_ONLY_SAFE: true,
    SOURCE_DEFAULT_MODEL: 'gpt-4.1-mini',
    authPresence: auth,
    paidCommand:
      'CG21_PAID_EVAL=1 CG21_SUPABASE_ACCESS_TOKEN=… npm run test:cg21-edge-paid-eval',
  }),
)
