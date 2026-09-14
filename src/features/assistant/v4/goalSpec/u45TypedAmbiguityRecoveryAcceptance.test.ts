/**
 * U4.5 — LEGACY_CONTRACT_VIOLATION / post-S3B U4.7 retirement.
 *
 * Historical recovery (unsupported|clarification + sum + null → domain_query)
 * is RETIRED. These fixtures now prove fail-closed behavior.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/u45TypedAmbiguityRecoveryAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyGoalSpec, type GoalSpec } from './goalSpec'
import { bindGoalSpecWithClarification } from './resumeGoalClarification'
import { validateGoalSpecConsistency } from './validateGoalSpec'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`FAIL: ${msg} (${String(a)} !== ${String(b)})`)
}

function moneySumAmbiguous(partial: Partial<GoalSpec>): GoalSpec {
  return emptyGoalSpec({
    dialogue: 'ask',
    aggregation: 'sum',
    measure: null,
    ambiguities: [{ slot: 'measure', reason: 'monetary_measure_unspecified' }],
    ...partial,
  })
}

function pipeline(goal: GoalSpec) {
  const validated = validateGoalSpecConsistency(goal)
  const bound = bindGoalSpecWithClarification({
    goal: validated.goal,
    activeCollectionQuery: null,
    storePending: false,
  })
  return { validated, bound }
}

console.log('U4.5 typed ambiguity — LEGACY_CONTRACT_VIOLATION (post-S3B)')

// Language gate + retirement: recovery must be gone
{
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/validateGoalSpec.ts',
    ),
    'utf8',
  )
  assert(!src.includes('MISCLASSIFIED_MONETARY_SUM_KIND'), 'kind recovery gone')
  assert(!src.includes('recoverMisclassifiedMonetarySumKind'), 'helper gone')
  assert(!src.includes('MISSING_SUM_MEASURE_AMBIGUITY'), 'amb synth gone')
  assert(!/utterance/i.test(src), 'no utterance')
  assert(!/new RegExp/.test(src), 'no RegExp')
}

// Shadow still wires validator before bind
{
  const shadow = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/v5GoalSpecShadow.ts',
    ),
    'utf8',
  )
  assert(shadow.includes('validateGoalSpecConsistency'), 'shadow wires V1')
  const vIdx = shadow.indexOf('validateGoalSpecConsistency')
  const bIdx = shadow.indexOf('bindGoalSpecWithClarification({')
  assert(vIdx > 0 && bIdx > vIdx, 'validate before bind')
}

// A/B: CONTRACT_VIOLATION_FIXTURE — mis-kind + sum + null fail closed
{
  for (const kind of ['unsupported', 'clarification'] as const) {
    const { validated, bound } = pipeline(
      moneySumAmbiguous({
        requestKind: kind,
        unsupportedReason:
          kind === 'unsupported'
            ? 'The utterance does not specify what amount is being asked about.'
            : null,
      }),
    )
    assertEq(validated.goal.requestKind, kind, `${kind} kind preserved`)
    assertEq(bound.status, 'unsupported', `${kind} fail-closed`)
  }
  console.log('  OK A/B CONTRACT_VIOLATION_FIXTURE fail-closed')
}

// C: domain_query already correct → clarify measure (current contract)
{
  const { validated, bound } = pipeline(
    moneySumAmbiguous({ requestKind: 'domain_query', source: 'wedding' }),
  )
  assertEq(validated.goal.requestKind, 'domain_query', 'C kind')
  assertEq(bound.status, 'needs_clarification', 'C binder')
  if (bound.status === 'needs_clarification') {
    assertEq(bound.request.slot, 'measure', 'C slot')
  }
  console.log('  OK C domain_query clarify (current contract)')
}

// D: unsupported + sum + null + NO amb → fail-closed (no recovery)
{
  const { validated, bound } = pipeline(
    emptyGoalSpec({
      requestKind: 'unsupported',
      unsupportedReason: 'amount_unspecified',
      dialogue: 'ask',
      aggregation: 'sum',
      measure: null,
      ambiguities: [],
    }),
  )
  assertEq(validated.goal.requestKind, 'unsupported', 'D kind kept')
  assertEq(bound.status, 'unsupported', 'D fail-closed')
  console.log('  OK D CONTRACT_VIOLATION_FIXTURE no recovery')
}

// E–G: non-query families unchanged
{
  for (const kind of ['unsupported', 'prepare_action', 'product_help'] as const) {
    const { validated, bound } = pipeline(
      emptyGoalSpec({
        requestKind: kind,
        unsupportedReason: kind === 'unsupported' ? 'image_generation_out_of_scope' : null,
        dialogue: 'ask',
        aggregation: kind === 'prepare_action' ? 'sum' : null,
        measure: null,
        ambiguities:
          kind === 'prepare_action'
            ? [{ slot: 'measure', reason: 'x' }]
            : [],
      }),
    )
    assertEq(validated.goal.requestKind, kind, `${kind} kind`)
    assertEq(bound.status, 'unsupported', `${kind} binder`)
  }
  console.log('  OK E–G non-query families')
}

// H: explicit paid_amount unchanged
{
  const { validated, bound } = pipeline(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      dialogue: 'ask',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
      ambiguities: [],
    }),
  )
  assertEq(validated.goal.measure, 'wedding.paid_amount', 'H measure')
  assertEq(bound.status, 'bound', 'H bound')
  console.log('  OK H explicit paid')
}

// I: count unsupported not promoted
{
  const { validated, bound } = pipeline(
    emptyGoalSpec({
      requestKind: 'unsupported',
      unsupportedReason: 'x',
      dialogue: 'ask',
      aggregation: 'count',
      measure: null,
      ambiguities: [{ slot: 'measure', reason: 'noise' }],
    }),
  )
  assertEq(validated.goal.requestKind, 'unsupported', 'I kind')
  assertEq(bound.status, 'unsupported', 'I binder')
  console.log('  OK I count not promoted')
}

// J: resolved measure + measure ambiguity → strip (hygiene kept)
{
  const r = validateGoalSpecConsistency(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'sum',
      measure: 'wedding.contract_value',
      ambiguities: [{ slot: 'measure', reason: 'over_clarify' }],
    }),
  )
  assert(r.status === 'normalized', 'J normalized')
  if (r.status === 'normalized') {
    assertEq(r.goal.measure, 'wedding.contract_value', 'J measure kept')
    assertEq(r.goal.ambiguities.length, 0, 'J amb stripped')
    assert(
      r.corrections.some((c) => c.code === 'CONFLICTING_RESOLVED_AMBIGUITY'),
      'J code',
    )
  }
  console.log('  OK J conflicting resolved+amb')
}

console.log('U4.5 LEGACY_CONTRACT_VIOLATION: ALL PASSED')
