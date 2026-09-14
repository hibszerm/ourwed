/**
 * S3 — U4.7 retirement proof (post-S3B / post-S4B contract).
 *
 * Legacy B/C/D are CONTRACT_VIOLATION_FIXTURE: thin+full fail closed.
 * Current-contract incomplete queries: full≡thin NeedsClarification(measure).
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/s3ThinValidatorRetirementProofAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyDomainQuery } from '../domainQuery/domainQuery'
import { emptyGoalSpec, type GoalSpec } from './goalSpec'
import { clearGoalClarificationSession } from './goalClarificationSession'
import { bindGoalSpecWithClarification } from './resumeGoalClarification'
import {
  validateGoalSpecConsistency,
  type ValidateGoalSpecPolicy,
} from './validateGoalSpec'
import { slotsFromDomainQuery, slotsFromBoundGoal } from './regression/semanticDiff'
import { AUGUST_2026, YEAR_2027 } from './regression/semanticRegressionCases'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`FAIL: ${msg} (${String(a)} !== ${String(b)})`)
}

type PipelineOutcome = {
  requestKind: GoalSpec['requestKind']
  status: 'bound' | 'needs_clarification' | 'unsupported'
  slot?: string
  reason?: string
  measure?: string | null
  source?: string | null
  aggregation?: string | null
  dateFrom?: string | null
  inventedMeasure: boolean
}

function runPipeline(
  goal: GoalSpec,
  policy: ValidateGoalSpecPolicy,
  active = null as ReturnType<typeof emptyDomainQuery> | null,
): PipelineOutcome {
  clearGoalClarificationSession()
  const validated = validateGoalSpecConsistency(goal, undefined, { policy })
  const bound = bindGoalSpecWithClarification({
    goal: validated.goal,
    activeCollectionQuery: active,
    storePending: false,
  })
  if (bound.status === 'bound') {
    const g = slotsFromBoundGoal(bound.goal)
    const q = slotsFromDomainQuery(bound.query)
    return {
      requestKind: validated.goal.requestKind,
      status: 'bound',
      measure: g.measure ?? null,
      source: g.source ?? null,
      aggregation: g.aggregation ?? null,
      dateFrom: q.dateFrom ?? null,
      inventedMeasure: false,
    }
  }
  if (bound.status === 'needs_clarification') {
    return {
      requestKind: validated.goal.requestKind,
      status: 'needs_clarification',
      slot: bound.request.slot,
      measure: validated.goal.measure,
      source: validated.goal.source,
      aggregation: validated.goal.aggregation,
      inventedMeasure: false,
    }
  }
  return {
    requestKind: validated.goal.requestKind,
    status: 'unsupported',
    reason: bound.reason,
    measure: validated.goal.measure,
    source: validated.goal.source,
    aggregation: validated.goal.aggregation,
    inventedMeasure: false,
  }
}

function compareUseful(
  full: PipelineOutcome,
  thin: PipelineOutcome,
): {
  equivalent: boolean
  usefulRegression: boolean
  notes: string
} {
  if (full.status === thin.status) {
    if (full.status === 'needs_clarification' && full.slot === thin.slot) {
      return { equivalent: true, usefulRegression: false, notes: 'same clarification' }
    }
    if (full.status === 'bound') {
      const same =
        full.measure === thin.measure &&
        full.source === thin.source &&
        full.aggregation === thin.aggregation &&
        full.dateFrom === thin.dateFrom
      return {
        equivalent: same,
        usefulRegression: !same,
        notes: same ? 'same bound' : 'bound slot mismatch',
      }
    }
    if (full.status === 'unsupported') {
      return { equivalent: true, usefulRegression: false, notes: 'both unsupported' }
    }
  }
  if (
    full.status === 'needs_clarification' &&
    thin.status === 'unsupported'
  ) {
    return {
      equivalent: false,
      usefulRegression: true,
      notes: `clarification(${full.slot}) → unsupported(${thin.reason})`,
    }
  }
  if (full.status === 'bound' && thin.status !== 'bound') {
    return {
      equivalent: false,
      usefulRegression: true,
      notes: `bound → ${thin.status}`,
    }
  }
  return {
    equivalent: false,
    usefulRegression: false,
    notes: `${full.status} vs ${thin.status}`,
  }
}

console.log('S3 Thin validator / U4.7 retirement proof (post-S3B)')

// --- False confidence: never invent concrete measure ---
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'sum',
    measure: null,
  })
  const thin = runPipeline(goal, 'thin')
  assertEq(thin.status, 'needs_clarification', 'no invent: clarify')
  assertEq(thin.slot, 'measure', 'no invent: measure slot')
  assertEq(thin.measure, null, 'no invent: measure stays null')
  console.log('  OK false-confidence (no concrete measure)')
}

type HistRow = {
  id: string
  goal: GoalSpec
  /** LEGACY_CONTRACT_GUARD | CURRENT_CONTRACT */
  class: 'CURRENT_CONTRACT' | 'CONTRACT_VIOLATION_FIXTURE' | 'SAFE_NON_QUERY'
}

const MONEY_AMB = {
  slot: 'measure' as const,
  reason: 'sum_requires_measure',
  candidates: [
    { id: 'wedding.contract_value', label: 'c' },
    { id: 'wedding.paid_amount', label: 'p' },
    { id: 'wedding.remaining_amount', label: 'r' },
  ],
}

const HIST: HistRow[] = [
  {
    id: 'A',
    class: 'CURRENT_CONTRACT',
    goal: emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'sum',
      measure: null,
      ambiguities: [MONEY_AMB],
    }),
  },
  {
    id: 'B',
    class: 'CONTRACT_VIOLATION_FIXTURE',
    goal: emptyGoalSpec({
      requestKind: 'clarification',
      aggregation: 'sum',
      measure: null,
      ambiguities: [MONEY_AMB],
    }),
  },
  {
    id: 'C',
    class: 'CONTRACT_VIOLATION_FIXTURE',
    goal: emptyGoalSpec({
      requestKind: 'unsupported',
      unsupportedReason: 'DIAGNOSTIC_ONLY_DO_NOT_PARSE',
      aggregation: 'sum',
      measure: null,
      ambiguities: [MONEY_AMB],
    }),
  },
  {
    id: 'D',
    class: 'CONTRACT_VIOLATION_FIXTURE',
    goal: emptyGoalSpec({
      requestKind: 'unsupported',
      unsupportedReason: 'x',
      aggregation: 'sum',
      measure: null,
      ambiguities: [],
    }),
  },
  {
    id: 'E',
    class: 'SAFE_NON_QUERY',
    goal: emptyGoalSpec({
      requestKind: 'unsupported',
      aggregation: null,
      measure: null,
    }),
  },
  {
    id: 'F',
    class: 'CURRENT_CONTRACT',
    goal: emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
    }),
  },
  {
    id: 'G',
    class: 'SAFE_NON_QUERY',
    goal: emptyGoalSpec({
      requestKind: 'unsupported',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
      source: null,
    }),
  },
  {
    id: 'H',
    class: 'SAFE_NON_QUERY',
    goal: emptyGoalSpec({
      requestKind: 'unsupported',
      aggregation: null,
      measure: null,
      source: null,
    }),
  },
]

type HistResult = {
  id: string
  class: HistRow['class']
  full: PipelineOutcome
  thin: PipelineOutcome
  equivalent: boolean
  usefulRegression: boolean
  notes: string
}

const histResults: HistResult[] = []
let usefulRegressionsOnCurrent = 0

for (const h of HIST) {
  const full = runPipeline(h.goal, 'full')
  const thin = runPipeline(h.goal, 'thin')
  const cmp = compareUseful(full, thin)
  histResults.push({
    id: h.id,
    class: h.class,
    full,
    thin,
    ...cmp,
  })
  if (h.class === 'CURRENT_CONTRACT' && cmp.usefulRegression) {
    usefulRegressionsOnCurrent += 1
  }
  console.log(
    `  HIST ${h.id} [${h.class}]: full=${full.status}${full.slot ? `(${full.slot})` : ''}` +
      ` thin=${thin.status}${thin.slot ? `(${thin.slot})` : thin.reason ? `(${thin.reason})` : ''}` +
      ` eq=${cmp.equivalent}`,
  )
}

// A: current incomplete → clarify both
{
  const a = histResults.find((r) => r.id === 'A')!
  assert(a.full.status === 'needs_clarification' && a.full.slot === 'measure', 'A full')
  assert(a.thin.status === 'needs_clarification' && a.thin.slot === 'measure', 'A thin')
  assert(a.equivalent, 'A full≡thin')
}

// E/H unsupported both
for (const id of ['E', 'H'] as const) {
  const r = histResults.find((x) => x.id === id)!
  assertEq(r.full.status, 'unsupported', `${id} full unsupported`)
  assertEq(r.thin.status, 'unsupported', `${id} thin unsupported`)
}

// F bound both
{
  const f = histResults.find((r) => r.id === 'F')!
  assertEq(f.full.status, 'bound', 'F full')
  assertEq(f.thin.status, 'bound', 'F thin')
  assertEq(f.full.measure, 'wedding.paid_amount', 'F measure')
}

// B/C/D: CONTRACT_VIOLATION_FIXTURE — fail closed both (no promotion)
{
  for (const id of ['B', 'C', 'D'] as const) {
    const r = histResults.find((x) => x.id === id)!
    assertEq(r.full.status, 'unsupported', `${id} full fail-closed`)
    assertEq(r.thin.status, 'unsupported', `${id} thin fail-closed`)
    assert(r.equivalent, `${id} full≡thin fail-closed`)
    assertEq(r.full.requestKind, r.thin.requestKind, `${id} kind preserved`)
  }
  console.log('  OK B/C/D CONTRACT_VIOLATION_FIXTURE fail-closed (both policies)')
}

// G: unsupported + sum + explicit paid — must stay unsupported
{
  const g = histResults.find((r) => r.id === 'G')!
  assertEq(g.full.status, 'unsupported', 'G full')
  assertEq(g.thin.status, 'unsupported', 'G thin')
  console.log('  OK G: unsupported+sum+paid stays unsupported (both)')
}

assertEq(usefulRegressionsOnCurrent, 0, 'no useful regression on CURRENT_CONTRACT')

// Bare domain_query + sum + null + [] (rule #2 independence)
{
  const bare = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'sum',
    measure: null,
    ambiguities: [],
  })
  const full = runPipeline(bare, 'full')
  const thin = runPipeline(bare, 'thin')
  assertEq(full.status, 'needs_clarification', 'bare full')
  assertEq(thin.status, 'needs_clarification', 'bare thin')
  assertEq(full.slot, 'measure', 'bare slot')
  assertEq(thin.slot, 'measure', 'bare slot thin')
  console.log('  OK bare sum+null+[] → clarify without synthetic amb')
}

// --- S0 hard gate samples ---
{
  const augustPaid = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'sum',
    measure: 'wedding.paid_amount',
    temporal: {
      expression: null,
      resolvedRange: AUGUST_2026,
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
  })
  const full1 = runPipeline(augustPaid, 'full')
  const thin1 = runPipeline(augustPaid, 'thin')
  assert(full1.status === 'bound' && thin1.status === 'bound', 'S0 august bound')
  assertEq(full1.measure, thin1.measure, 'S0 august measure')

  const active = emptyDomainQuery({
    source: 'wedding',
    aggregate: 'sum',
    measure: 'wedding.paid_amount',
    dateBinding: { dimension: 'wedding.date', range: AUGUST_2026 },
  })
  const nextYear = emptyGoalSpec({
    requestKind: 'domain_query',
    dialogue: 'inherit',
    source: null,
    aggregation: null,
    measure: null,
    inheritance: { fromActiveCollection: true, fromPrevious: true },
    temporal: {
      expression: null,
      resolvedRange: YEAR_2027,
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
  })
  const full2 = runPipeline(nextYear, 'full', active)
  const thin2 = runPipeline(nextYear, 'thin', active)
  assert(full2.status === 'bound' && thin2.status === 'bound', 'S0 next year')
  assertEq(full2.dateFrom, YEAR_2027.from, 'S0 year')
  assertEq(thin2.dateFrom, YEAR_2027.from, 'S0 year thin')
  assertEq(full2.measure, 'wedding.paid_amount', 'S0 inherit measure')
  assertEq(thin2.measure, 'wedding.paid_amount', 'S0 inherit measure thin')

  const list = emptyGoalSpec({
    requestKind: 'domain_query',
    dialogue: 'inherit',
    source: 'wedding',
    aggregation: 'list',
    inheritance: { fromActiveCollection: true, fromPrevious: true },
  })
  const full3 = runPipeline(list, 'full', active)
  const thin3 = runPipeline(list, 'thin', active)
  assert(full3.status === 'bound' && thin3.status === 'bound', 'S0 show them')
  assertEq(full3.dateFrom, AUGUST_2026.from, 'S0 list date')
  assertEq(thin3.dateFrom, AUGUST_2026.from, 'S0 list date thin')

  console.log('  OK S0 sample gates equivalent under both policies')
}

// --- Resolver must not contain U4.7 kind recovery ---
{
  const resolver = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/v4/goalSpec/resolveCollectionSource.ts'),
    'utf8',
  )
  const bind = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/v4/goalSpec/bindGoalSpec.ts'),
    'utf8',
  )
  const validator = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/v4/goalSpec/validateGoalSpec.ts'),
    'utf8',
  )
  assert(!/MISCLASSIFIED_MONETARY_SUM_KIND/.test(resolver), 'resolver no U4.7')
  assert(!/MISCLASSIFIED_MONETARY_SUM_KIND/.test(validator), 'validator retired kind')
  assert(!/MISSING_SUM_MEASURE_AMBIGUITY/.test(validator), 'validator retired amb synth')
  assert(!/recoverMisclassified/.test(bind), 'binder no kind recovery')
  assert(!/recoverMisclassified/.test(validator), 'validator no kind recovery')
  console.log('  OK Resolver/validator boundary (U4.7 gone)')
}

// --- Default policy: no kind promotion ---
{
  const v = validateGoalSpecConsistency(
    emptyGoalSpec({
      requestKind: 'unsupported',
      aggregation: 'sum',
      measure: null,
    }),
  )
  assertEq(v.goal.requestKind, 'unsupported', 'default does not recover kind')
  console.log('  OK production default does not promote mis-kind')
}

console.log('  RETIREMENT GATES: SAFE (current-contract useful regressions = 0)')
console.log('S3 Thin validator / U4.7 retirement proof: ALL PASSED (RETIRED)')
