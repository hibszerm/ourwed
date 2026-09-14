/**
 * V1 — Typed GoalSpec consistency validator (deterministic fixtures).
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/v1GoalSpecConsistencyValidatorAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyGoalSpec } from './goalSpec'
import {
  validateGoalSpecConsistency,
  type ValidateGoalSpecConsistencyResult,
} from './validateGoalSpec'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

console.log('V1 GoalSpec consistency validator acceptance')

// --- Gate: no NL / utterance / phrase maps in validator ---
{
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/validateGoalSpec.ts',
    ),
    'utf8',
  )
  const forbidden = [
    /utterance/i,
    /userText/i,
    /user_text/i,
    /regex/i,
    /new RegExp/,
    /\.match\(/,
    /\.test\(/,
    /phrase/i,
    /łączna/,
    /wpłynęło/,
    /pokaż/,
    /\bile\b/,
    /morpholog/i,
    /alias/i,
  ]
  for (const re of forbidden) {
    assert(!re.test(src), `language-independence: forbidden pattern ${re}`)
  }
  console.log('  OK language-independence gate')
}

function mustNormalized(
  r: ValidateGoalSpecConsistencyResult,
): Extract<ValidateGoalSpecConsistencyResult, { status: 'normalized' }> {
  assert(r.status === 'normalized', `expected normalized got ${r.status}`)
  return r
}

function mustClarify(
  r: ValidateGoalSpecConsistencyResult,
): Extract<
  ValidateGoalSpecConsistencyResult,
  { status: 'needs_clarification' }
> {
  assert(
    r.status === 'needs_clarification',
    `expected needs_clarification got ${r.status}`,
  )
  return r
}

// A1: resolved measure + measure ambiguity → strip ambiguity
{
  const goal = emptyGoalSpec({
    source: 'wedding',
    aggregation: 'sum',
    measure: 'wedding.contract_value',
    ambiguities: [{ slot: 'measure', reason: 'over_clarify' }],
  })
  const r = mustNormalized(validateGoalSpecConsistency(goal))
  assert(r.goal.measure === 'wedding.contract_value', 'measure preserved')
  assert(r.goal.ambiguities.length === 0, 'measure amb removed')
  assert(
    r.corrections.some((c) => c.code === 'CONFLICTING_RESOLVED_AMBIGUITY'),
    'correction code',
  )
  console.log('  OK resolved+measure-amb strip')
}

// A2: count + money measure → clear measure
{
  const goal = emptyGoalSpec({
    source: 'wedding',
    aggregation: 'count',
    measure: 'wedding.paid_amount',
  })
  const r = mustNormalized(validateGoalSpecConsistency(goal))
  assert(r.goal.measure === null, 'measure cleared')
  assert(
    r.corrections.some((c) => c.code === 'INVALID_AGGREGATION_MEASURE_PAIR'),
    'pair code',
  )
  console.log('  OK count+money clear')
}

// A3: sum + null measure + no amb → validator stays valid (no synth);
// Binder owns NeedsClarification(measure) under S3B / post-U4.7.
{
  const goal = emptyGoalSpec({
    source: 'wedding',
    aggregation: 'sum',
    measure: null,
    ambiguities: [],
  })
  const r = validateGoalSpecConsistency(goal)
  assert(r.status === 'valid', 'A3 valid without synth amb')
  assert(r.goal.ambiguities.length === 0, 'A3 no synthetic measure amb')
  assert(r.goal.measure === null, 'A3 no invent measure')
  console.log('  OK sum+null no synth (Binder owns clarify)')
}

// B1: sum + null + measure amb → clarify, do NOT invent measure
{
  const goal = emptyGoalSpec({
    source: 'wedding',
    aggregation: 'sum',
    measure: null,
    ambiguities: [{ slot: 'measure', reason: 'unspecified' }],
  })
  const r = mustClarify(validateGoalSpecConsistency(goal))
  assert(r.goal.measure === null, 'must not invent measure')
  assert(r.corrections.length === 0, 'no unsafe repair')
  console.log('  OK sum+null+amb no invent')
}

// A4: wedding temporal + date_dimension amb → unique wedding.date
{
  const goal = emptyGoalSpec({
    source: 'wedding',
    aggregation: 'sum',
    measure: 'wedding.contract_value',
    temporal: {
      expression: 'września',
      resolvedRange: { from: '2026-09-01', to: '2026-09-30' },
      dateDimension: null,
      dateDimensionAmbiguous: true,
    },
    ambiguities: [{ slot: 'date_dimension', reason: 'which_date' }],
  })
  const r = mustNormalized(validateGoalSpecConsistency(goal))
  assert(r.goal.temporal?.dateDimension === 'wedding.date', 'dim set')
  assert(r.goal.temporal?.dateDimensionAmbiguous === false, 'flag clear')
  assert(
    !r.goal.ambiguities.some((a) => a.slot === 'date_dimension'),
    'date amb removed',
  )
  assert(r.goal.measure === 'wedding.contract_value', 'measure untouched')
  console.log('  OK date_dimension normalize')
}

// Safety: list + null measure untouched
{
  const goal = emptyGoalSpec({
    source: 'wedding',
    aggregation: 'list',
    measure: null,
  })
  const r = validateGoalSpecConsistency(goal)
  assert(r.status === 'valid', 'list+null valid')
  console.log('  OK list+null untouched')
}

// Safety: never map sum+null → contract_value
{
  const goal = emptyGoalSpec({
    source: 'wedding',
    aggregation: 'sum',
    measure: null,
    ambiguities: [{ slot: 'measure', reason: 'x' }],
  })
  const r = validateGoalSpecConsistency(goal)
  assert(r.goal.measure !== 'wedding.contract_value', 'no CV guess')
  assert(r.goal.measure !== 'wedding.paid_amount', 'no paid guess')
  console.log('  OK no measure invent')
}

// Entity: multi ambiguousKinds → add entity_kind amb
{
  const goal = emptyGoalSpec({
    source: 'wedding',
    aggregation: 'list',
    relations: [
      {
        relation: 'unknown',
        field: null,
        op: 'eq',
        value: { text: 'Gold', kindHint: 'unknown' },
        ambiguousKinds: ['package', 'extra'],
      },
    ],
  })
  const r = mustClarify(validateGoalSpecConsistency(goal))
  assert(
    r.goal.ambiguities.some((a) => a.slot === 'entity_kind'),
    'entity_kind amb',
  )
  console.log('  OK entity multi-kind amb')
}

// Non-domain_query passthrough
{
  const goal = emptyGoalSpec({
    requestKind: 'product_help',
    topicKey: 'contracts',
  })
  const r = validateGoalSpecConsistency(goal)
  assert(r.status === 'valid', 'product_help untouched')
  console.log('  OK non-domain_query passthrough')
}

console.log('V1 GoalSpec consistency validator: ALL PASSED')
