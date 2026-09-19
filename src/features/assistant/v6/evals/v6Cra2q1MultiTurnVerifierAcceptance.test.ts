/**
 * V6-CRA2Q1 — Multi-turn verifier guidance acceptance (deterministic; no live API).
 *
 * M1–M8 are denotational contract cases: what the verifier prompt must teach.
 * They do not call the model.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { V6_SEMANTIC_VERIFIER_SYSTEM_PROMPT } from '../verification/semanticVerifier'

const edge = readFileSync(
  resolve(process.cwd(), 'supabase/functions/ai-assistant/v6SemanticVerifier.ts'),
  'utf8',
)

function check(cond: unknown, msg: string): asserts cond {
  assert.ok(cond, msg)
}

const prompt = V6_SEMANTIC_VERIFIER_SYSTEM_PROMPT

check(
  prompt.includes('Inherited collection / resource scope'),
  'M0: inherited-scope section required',
)
check(
  prompt.includes('Do NOT require the current Draft TurnPlan to restate'),
  'M0: must not require restating prior filters when handle-bound',
)
check(
  prompt.includes('input_handle') && prompt.includes('collection_summaries'),
  'M0: handle + summaries vocabulary required',
)
check(
  edge.includes('Inherited collection / resource scope'),
  'M0: Edge mirror must include inherited-scope section',
)

/** Denotational cases documenting expected FAITHFUL / NOT_FAITHFUL judgments. */
export const CRA2Q1_MULTI_TURN_CASES = [
  {
    id: 'M1',
    gold: 'FAITHFUL' as const,
    summary:
      'root collection → ConceptFilter refinement on exact prior handle without restating temporal',
  },
  {
    id: 'M2',
    gold: 'FAITHFUL' as const,
    summary:
      'nearest/single wedding → inspect detail → follow-up inspect different concept on same handle',
  },
  {
    id: 'M3',
    gold: 'FAITHFUL' as const,
    summary: 'prior collection → LIST_RELATED TASKS_OPEN bound to that handle',
  },
  {
    id: 'M4',
    gold: 'FAITHFUL' as const,
    summary: 'prior collection → INSPECT_RESOURCE Q.PREWEDDING_STATUS on same handle',
  },
  {
    id: 'M5',
    gold: 'FAITHFUL' as const,
    summary:
      'prior collection → Sort FIN.REMAINING_TO_PAY desc + Slice 1 on that handle (highest remaining)',
  },
  {
    id: 'M6',
    gold: 'NOT_FAITHFUL' as const,
    summary: 'utterance refers to "those" but plan uses new root SEARCH (lost prior handle)',
  },
  {
    id: 'M7',
    gold: 'NOT_FAITHFUL' as const,
    summary: 'planner drops prior collection restriction / omits input_handle on follow-up DETAIL',
  },
  {
    id: 'M8',
    gold: 'NOT_FAITHFUL' as const,
    summary:
      'true H20-style constraint replacement requiring rebase remains fail-closed (not ordinary continuation)',
  },
] as const

check(CRA2Q1_MULTI_TURN_CASES.length === 8, 'M1–M8 required')
check(
  CRA2Q1_MULTI_TURN_CASES.filter((c) => c.gold === 'FAITHFUL').length === 5,
  'five FAITHFUL cases',
)
check(
  CRA2Q1_MULTI_TURN_CASES.filter((c) => c.gold === 'NOT_FAITHFUL').length === 3,
  'three NOT_FAITHFUL controls',
)

// Prompt must still preserve negative controls for lost handle / root misuse / H20 boundary.
check(
  prompt.includes('root SEARCH that loses that collection identity remains NOT_FAITHFUL'),
  'M6/M7 negative control language present',
)
check(
  prompt.includes('omits both input_handle and a resolving input_from_step'),
  'M7: omitted handle on follow-up DETAIL is NOT_FAITHFUL',
)
check(
  prompt.includes('true correction/rebase') ||
    prompt.includes('Replacing a prior constraint with a different incompatible constraint'),
  'M8: H20-style rebase remains fail-closed',
)

console.log('v6Cra2q1MultiTurnVerifierAcceptance PASS')
