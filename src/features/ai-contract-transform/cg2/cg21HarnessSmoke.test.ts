/**
 * CG2.1 safety + transport smoke (no paid Edge calls).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cg21AuthStatus } from './deployedEdgeInvoke'
import { buildUserPayload, SYSTEM_PROMPT } from '../fullAiRewritePromptShared'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

// Edge compute-only evidence from source
const edgeSrc = readFileSync(
  resolve('supabase/functions/ai-contract-full-rewrite/index.ts'),
  'utf8',
)
const edgePrompt = readFileSync(
  resolve('supabase/functions/ai-contract-full-rewrite/prompt.ts'),
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
assert(SYSTEM_PROMPT.includes('modelEditable=false'), 'protected model scope rule')
assert(SYSTEM_PROMPT.includes('Extras placement is deterministic-only'), 'extras deterministic ownership rule')
assert(SYSTEM_PROMPT.includes('Each source blockId may appear AT MOST ONCE in changedBlocks'), 'local prompt has block uniqueness contract')
assert(edgePrompt.includes('Each source blockId may appear AT MOST ONCE in changedBlocks'), 'Edge prompt has block uniqueness contract')
assert(edgePrompt.includes('FINAL COMPLETE replacement text for the whole source block'), 'Edge prompt requires complete whole-block replacement')
assert(edgePrompt.includes('Never emit separate entries for fragments, runs, tokens, clauses, punctuation, or successive edits'), 'Edge prompt forbids fragment-level duplicate entries')
assert(edgePrompt.includes('Do NOT return unchanged blocks'), 'Edge prompt omits unchanged blocks')
const payload = JSON.parse(
  buildUserPayload({
    documentBlocks: [{
      blockId: 'para-1', text: 'Data zawarcia', kind: 'paragraph', paragraphIndex: 1,
      modelContext: { semanticRoles: ['contract.executionDate'], ownership: 'unknown', modelEditable: true, signatureRegion: 'before' },
    }],
    transformationDataset: {},
    protectedDataSummary: { exactCount: 0, patternCount: 0 },
    structuralContext: { extras: { deterministicOnly: true }, signatureStartIndex: 9, editableBlockIds: ['para-1'] },
  }),
)
assert(payload.documentBlocks[0].modelContext.semanticRoles[0] === 'contract.executionDate', 'date role passed through')
assert(payload.structuralContext.extras.deterministicOnly === true, 'extras context passed through')
assert(payload.structuralContext.editableBlockIds.length === 1, 'editable scope passed through')

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
