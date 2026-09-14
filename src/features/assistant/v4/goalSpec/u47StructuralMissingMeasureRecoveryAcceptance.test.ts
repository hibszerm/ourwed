/**
 * U4.7 — LEGACY_CONTRACT_VIOLATION / post-S3B retirement.
 *
 * Structural kind + ambiguity recovery RETIRED under S4B interpreter contract.
 * Mis-kind fixtures fail closed. Current-contract domain_query paths still clarify.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/u47StructuralMissingMeasureRecoveryAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyGoalSpec, type GoalSpec } from './goalSpec'
import {
  answerGoalClarification,
  bindGoalSpecWithClarification,
} from './resumeGoalClarification'
import { validateGoalSpecConsistency } from './validateGoalSpec'
import { clearGoalClarificationSession } from './goalClarificationSession'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`FAIL: ${msg} (${String(a)} !== ${String(b)})`)
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

function codes(v: ReturnType<typeof validateGoalSpecConsistency>): string[] {
  return 'corrections' in v ? v.corrections.map((c) => c.code) : []
}

console.log('U4.7 structural recovery — LEGACY_CONTRACT_VIOLATION (post-S3B)')

{
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/validateGoalSpec.ts',
    ),
    'utf8',
  )
  assert(!src.includes('MISSING_SUM_MEASURE_AMBIGUITY'), 'amb synth retired')
  assert(!src.includes('MISCLASSIFIED_MONETARY_SUM_KIND'), 'kind recovery retired')
  assert(!src.includes('recoverMisclassified'), 'helper retired')
  assert(
    !/unsupportedReason\s*[=!]=|unsupportedReason\s*\.|unsupportedReason\s*\?/.test(
      src.replace(/unsupportedReason:\s*null/g, ''),
    ),
    'no unsupportedReason semantic inspect',
  )
  assert(!/utterance/i.test(src), 'no utterance')
  assert(!/new RegExp/.test(src), 'no RegExp')
}

// A: domain_query sum null no amb → Binder clarifies (no validator synth)
{
  clearGoalClarificationSession()
  const validated = validateGoalSpecConsistency(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      dialogue: 'ask',
      aggregation: 'sum',
      measure: null,
      ambiguities: [],
    }),
  )
  assertEq(validated.status, 'valid', 'A valid')
  assertEq(validated.goal.ambiguities.length, 0, 'A no synth')
  const bound = bindGoalSpecWithClarification({
    goal: validated.goal,
    storePending: true,
  })
  assertEq(bound.status, 'needs_clarification', 'A binder')
  if (bound.status === 'needs_clarification') {
    assertEq(bound.request.slot, 'measure', 'A slot')
    assert(bound.request.options.length >= 3, 'A typed options')
    const resumed = answerGoalClarification({
      clarificationId: bound.request.id,
      slot: 'measure',
      selectedValue: 'wedding.paid_amount',
    })
    assertEq(resumed.status, 'bound', 'A zero-LLM resume')
    if (resumed.status === 'bound') {
      assertEq(resumed.query.measure, 'wedding.paid_amount', 'A measure')
    }
  }
  console.log('  OK A current-contract bare sum → Binder clarify + resume')
}

// B/C: CONTRACT_VIOLATION_FIXTURE — fail closed
{
  for (const kind of ['clarification', 'unsupported'] as const) {
    const { validated, bound } = pipeline(
      emptyGoalSpec({
        requestKind: kind,
        unsupportedReason: kind === 'unsupported' ? 'x' : null,
        dialogue: 'ask',
        aggregation: 'sum',
        measure: null,
        ambiguities: [],
      }),
    )
    assertEq(validated.goal.requestKind, kind, `${kind} preserved`)
    assertEq(codes(validated).length, 0, `${kind} no recovery codes`)
    assertEq(bound.status, 'unsupported', `${kind} fail-closed`)
  }
  console.log('  OK B/C CONTRACT_VIOLATION_FIXTURE fail-closed')
}

// D/E: unsupported null agg → fail-closed
{
  for (const reason of [
    'x',
    'The utterance does not specify what amount is being asked about.',
  ]) {
    const { validated, bound } = pipeline(
      emptyGoalSpec({
        requestKind: 'unsupported',
        unsupportedReason: reason,
        dialogue: 'ask',
        aggregation: null,
        measure: null,
        ambiguities: [],
      }),
    )
    assertEq(validated.goal.requestKind, 'unsupported', 'D/E kind')
    assertEq(bound.status, 'unsupported', 'D/E binder')
  }
  console.log('  OK D/E fail-closed null agg')
}

// F–H: non-query families unchanged
for (const kind of ['prepare_action', 'product_help', 'goal_plan'] as const) {
  const { validated, bound } = pipeline(
    emptyGoalSpec({
      requestKind: kind,
      dialogue: 'ask',
      aggregation: 'sum',
      measure: null,
      ambiguities: [],
    }),
  )
  assertEq(validated.goal.requestKind, kind, `${kind} kind`)
  assertEq(bound.status, 'unsupported', `${kind} binder`)
  console.log(`  OK ${kind} untouched`)
}

// I: explicit paid → bound
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
  assertEq(validated.goal.measure, 'wedding.paid_amount', 'I measure')
  assertEq(bound.status, 'bound', 'I bound')
  console.log('  OK I explicit paid')
}

// J: existing measure amb preserved; Binder clarifies
{
  const { validated, bound } = pipeline(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      dialogue: 'ask',
      aggregation: 'sum',
      measure: null,
      ambiguities: [{ slot: 'measure', reason: 'monetary_measure_unspecified' }],
    }),
  )
  assertEq(
    validated.goal.ambiguities.filter((a) => a.slot === 'measure').length,
    1,
    'J no dup',
  )
  assertEq(bound.status, 'needs_clarification', 'J binder')
  console.log('  OK J existing amb preserved')
}

// K: count → no measure amb
{
  const { validated } = pipeline(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      dialogue: 'ask',
      aggregation: 'count',
      measure: null,
      ambiguities: [],
    }),
  )
  assert(
    !validated.goal.ambiguities.some((a) => a.slot === 'measure'),
    'K no measure amb',
  )
  console.log('  OK K count')
}

// Fixture G: unsupported + sum + paid stays unsupported
{
  const { validated, bound } = pipeline(
    emptyGoalSpec({
      requestKind: 'unsupported',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
      source: null,
    }),
  )
  assertEq(validated.goal.requestKind, 'unsupported', 'G kind')
  assertEq(bound.status, 'unsupported', 'G binder')
  console.log('  OK G unsupported+sum+paid fail-closed')
}

console.log('U4.7 LEGACY_CONTRACT_VIOLATION: ALL PASSED')
