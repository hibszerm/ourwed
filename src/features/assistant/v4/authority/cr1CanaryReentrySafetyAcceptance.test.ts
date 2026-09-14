/**
 * CR1 — Canary re-entry safety gate acceptance (typed fixtures).
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/authority/cr1CanaryReentrySafetyAcceptance.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyDomainQuery, type DomainQuery } from '../domainQuery/domainQuery'
import { bindGoalSpec, makeGoalBinderContext } from '../goalSpec/bindGoalSpec'
import { compileBoundGoalToDomainQuery } from '../goalSpec/compileBoundGoalToDomainQuery'
import type { BoundGoal } from '../goalSpec/boundGoal'
import { emptyGoalSpec, type GoalSpec } from '../goalSpec/goalSpec'
import { normalizeGoalSpecTemporal } from '../goalSpec/normalizeGoalSpecTemporal'
import { normalizeDomainQuerySemantics } from '../goalSpec/compareGoalSpecSemantics'
import {
  assessCanaryReentryEligibility,
  isCanaryReentryEligible,
  type CanaryReentryEligibility,
} from './canaryReentryEligibility'
import { decideAssistantAuthority } from './decideAuthority'

const TODAY = '2026-09-14'
const YEAR_2028 = { from: '2028-01-01', to: '2028-12-31' }
const YEAR_2027 = { from: '2027-01-01', to: '2027-12-31' }

type Pipeline = {
  goal: GoalSpec
  resolverOutcome: 'bound' | 'needs_clarification' | 'unsupported'
  query: DomainQuery | null
  boundGoal: BoundGoal | null
  reentry: CanaryReentryEligibility
}

function runPipeline(
  goalIn: GoalSpec,
  active: DomainQuery | null = null,
): Pipeline {
  const goal = normalizeGoalSpecTemporal(goalIn, TODAY)
  const bound = bindGoalSpec(
    goal,
    makeGoalBinderContext({ activeCollectionQuery: active }),
  )

  if (bound.status === 'needs_clarification') {
    const reentry = assessCanaryReentryEligibility({
      goalSpec: goal,
      interpreterStatus: 'ok',
      resolverOutcome: 'needs_clarification',
      clarificationSlot: bound.clarification.ambiguousSlots[0] ??
        bound.clarification.missingSlots[0] ??
        'other',
    })
    return {
      goal,
      resolverOutcome: 'needs_clarification',
      query: null,
      boundGoal: null,
      reentry,
    }
  }

  if (bound.status === 'unsupported') {
    const reentry = assessCanaryReentryEligibility({
      goalSpec: goal,
      interpreterStatus:
        goal.requestKind === 'unsupported' ? 'unsupported' : 'ok',
      resolverOutcome: 'unsupported',
    })
    return {
      goal,
      resolverOutcome: 'unsupported',
      query: null,
      boundGoal: null,
      reentry,
    }
  }

  const compiled = compileBoundGoalToDomainQuery(bound.goal)
  assert.equal(compiled.status, 'success', 'compile should success for bound')
  const query = compiled.status === 'success' ? compiled.query : null
  const reentry = assessCanaryReentryEligibility({
    goalSpec: goal,
    boundGoal: bound.goal,
    domainQuery: query,
    interpreterStatus: 'ok',
    resolverOutcome: 'bound',
  })
  return {
    goal,
    resolverOutcome: 'bound',
    query,
    boundGoal: bound.goal,
    reentry,
  }
}

function assertIneligible(p: Pipeline, label: string, reasonHint?: string) {
  assert.equal(p.reentry.status, 'ineligible', `${label} must be ineligible`)
  assert.equal(isCanaryReentryEligible(p.reentry), false, `${label} helper`)
  if (reasonHint && p.reentry.status === 'ineligible') {
    const joined = p.reentry.reasonCodes.join(',')
    assert.ok(
      joined.includes(reasonHint) ||
        p.reentry.decision.kind === 'v3_fallback',
      `${label} expect reason~${reasonHint}, got ${joined} / ${p.reentry.decision.kind}`,
    )
  }
}

function assertEligibleAuthority(p: Pipeline, label: string) {
  assert.equal(p.reentry.status, 'eligible', `${label} eligible`)
  if (p.reentry.status === 'eligible') {
    assert.equal(p.reentry.kind, 'v5_authority', `${label} authority kind`)
    assert.equal(p.reentry.wouldOwnVisibly, true, `${label} would own`)
  }
}

console.log('CR1 canary re-entry safety')

// --- Authority path wiring: SC1 required before ownership ---
{
  const host = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/AssistantHost.tsx'),
    'utf8',
  )
  assert.ok(host.includes('assessSemanticCoverage'), 'host assesses coverage')
  assert.ok(host.includes('decideAssistantAuthority'), 'host decides')
  assert.ok(host.includes('isIc1CanaryDomainQueryEligible'), 'host IC1 slice')
  const decide = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/authority/decideAuthority.ts',
    ),
    'utf8',
  )
  assert.ok(
    decide.includes("coverage !== 'complete'"),
    'decide requires complete coverage',
  )
  assert.ok(
    decide.includes('SEMANTIC_COVERAGE_INCOMPLETE'),
    'decide emits coverage incomplete',
  )
  console.log('  OK authority path wiring')
}

// --- Fail-closed rich / unexecutable ---
{
  const monthMost = runPipeline(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'rank',
      groupBy: ['wedding.date.month'],
      orderBy: [{ field: 'count', direction: 'desc' }],
      limit: 1,
      temporal: {
        expression: null,
        resolvedRange: null,
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
    }),
  )
  assertIneligible(monthMost, 'month-most rank', 'UNSUPPORTED')
  assert.equal(monthMost.resolverOutcome, 'unsupported')
  console.log('  OK month-most fail-closed')
}

{
  const remaining = runPipeline(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'count',
      temporal: {
        expression: 'jeszcze do końca tego roku',
        resolvedRange: null,
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
    }),
  )
  assertIneligible(remaining, 'remaining-year', 'UNSUPPORTED')
  assert.equal(remaining.resolverOutcome, 'unsupported')
  // Must not silently become closed full-year authority
  assert.equal(remaining.goal.temporal?.resolvedRange, null)
  console.log('  OK remaining-year fail-closed')
}

{
  const topN = runPipeline(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'list',
      orderBy: [{ field: 'wedding.date', direction: 'asc' }],
      limit: 3,
      temporal: {
        expression: '2028',
        resolvedRange: null,
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
    }),
  )
  // May bind then fail SC1 on order/limit, or unsupported — either ineligible
  assertIneligible(topN, 'top-N')
  console.log('  OK top-N fail-closed')
}

for (const agg of ['avg', 'min', 'max'] as const) {
  const p = runPipeline(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: agg,
      measure: agg === 'avg' ? 'wedding.contract_value' : null,
    }),
  )
  assertIneligible(p, agg, 'UNSUPPORTED')
}
console.log('  OK avg/min/max fail-closed')

{
  const comparison = runPipeline(
    emptyGoalSpec({
      requestKind: 'unsupported',
      unsupportedReason: 'comparison_not_representable',
    }),
  )
  assertIneligible(comparison, 'comparison unsupported')
  console.log('  OK comparison/unsupported fail-closed')
}

{
  const negation = runPipeline(
    emptyGoalSpec({
      requestKind: 'unsupported',
      unsupportedReason: 'exclusion_not_representable',
    }),
  )
  assertIneligible(negation, 'negation unsupported')
}

{
  const badRel = runPipeline(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'count',
      relations: [
        {
          relation: 'package',
          field: 'package.name',
          op: 'contains',
          value: { text: 'Gold', kindHint: 'package' },
        },
      ],
      temporal: {
        expression: '2028',
        resolvedRange: null,
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
    }),
  )
  assertIneligible(badRel, 'unsupported relation')
  console.log('  OK unsupported relation fail-closed')
}

{
  // Bound count with leftover groupBy → SC1 incomplete even if DQ is IC1 shape
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'count',
    groupBy: ['wedding.date.month'],
    temporal: {
      expression: null,
      resolvedRange: YEAR_2028,
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
  })
  const query = emptyDomainQuery({
    source: 'wedding',
    aggregate: 'count',
    dateBinding: { dimension: 'wedding.date', range: YEAR_2028 },
  })
  const reentry = assessCanaryReentryEligibility({
    goalSpec: goal,
    domainQuery: query,
    interpreterStatus: 'ok',
    resolverOutcome: 'bound',
  })
  assert.equal(reentry.status, 'ineligible')
  if (reentry.status === 'ineligible') {
    assert.ok(
      reentry.reasonCodes.includes('groupby_not_executable') ||
        reentry.reasonCodes.includes('SEMANTIC_COVERAGE_INCOMPLETE'),
    )
  }
  console.log('  OK incomplete coverage fail-closed')
}

{
  const schema = assessCanaryReentryEligibility({
    goalSpec: null,
    interpreterStatus: 'schema_error',
    resolverOutcome: 'interpret_error',
  })
  assert.equal(schema.status, 'ineligible')
  console.log('  OK invalid GoalSpec / schema fail-closed')
}

// --- Positive eligible IC1 cases (simulated canary+allowlist) ---
{
  const y2028 = runPipeline(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'count',
      temporal: {
        expression: '2028',
        resolvedRange: null,
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
    }),
  )
  assertEligibleAuthority(y2028, 'count 2028')
  assert.deepEqual(y2028.query?.dateBinding?.range, YEAR_2028)
  console.log('  OK count 2028 eligible')
}

{
  const countQ = emptyDomainQuery({
    source: 'wedding',
    aggregate: 'count',
    dateBinding: { dimension: 'wedding.date', range: YEAR_2028 },
  })
  const listFollow = runPipeline(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'list',
      dialogue: 'inherit',
      inheritance: { fromActiveCollection: true, fromPrevious: true },
    }),
    countQ,
  )
  assertEligibleAuthority(listFollow, 'list follow-up')
  assert.equal(listFollow.query?.aggregate, null)
  assert.deepEqual(listFollow.query?.dateBinding?.range, YEAR_2028)
  // Identity: only aggregation (and list limit) changes
  const nCount = normalizeDomainQuerySemantics(countQ)
  const nList = normalizeDomainQuerySemantics(listFollow.query!)
  assert.equal(nCount.source, nList.source)
  assert.equal(nCount.measure, nList.measure)
  assert.equal(nCount.dateFrom, nList.dateFrom)
  assert.equal(nCount.dateTo, nList.dateTo)
  assert.equal(nCount.placeName, nList.placeName)
  assert.equal(nCount.aggregate, 'count')
  assert.equal(nList.aggregate, null)
  console.log('  OK count→list identity + eligible')
}

{
  const venueYear = runPipeline(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'count',
      relations: [
        {
          relation: 'place',
          field: 'place.name',
          op: 'contains',
          value: { text: 'Villa Love', kindHint: 'venue' },
        },
      ],
      temporal: {
        expression: '2027',
        resolvedRange: null,
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
    }),
  )
  assertEligibleAuthority(venueYear, 'venue+year count')
  console.log('  OK venue+year eligible')
}

for (const measure of [
  'wedding.contract_value',
  'wedding.paid_amount',
  'wedding.remaining_amount',
] as const) {
  const p = runPipeline(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'sum',
      measure,
      temporal: {
        expression: '2027',
        resolvedRange: null,
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
    }),
  )
  assertEligibleAuthority(p, `sum ${measure}`)
}
console.log('  OK finance sums eligible')

{
  // Zero-result collection identity: same Q shape remains Q
  const zeroQ = emptyDomainQuery({
    source: 'wedding',
    aggregate: 'count',
    dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: 'Nonexistent Venue XYZ',
      },
    ],
  })
  const listAfterZero = runPipeline(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'list',
      dialogue: 'inherit',
      inheritance: { fromActiveCollection: true, fromPrevious: true },
    }),
    zeroQ,
  )
  assertEligibleAuthority(listAfterZero, 'zero-result → list')
  assert.deepEqual(
    listAfterZero.query?.dateBinding?.range,
    YEAR_2027,
  )
  assert.equal(
    listAfterZero.query?.relations[0]?.value,
    'Nonexistent Venue XYZ',
  )
  console.log('  OK zero-result identity')
}

{
  // Typed measure clarification → eligible clarification ownership under canary
  const money = runPipeline(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'sum',
      measure: null,
      ambiguities: [{ slot: 'measure', reason: 'money_aspect_ambiguous' }],
      temporal: {
        expression: '2027',
        resolvedRange: YEAR_2027,
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
    }),
  )
  // Binder clarifies missing measure for sum
  assert.ok(
    money.resolverOutcome === 'needs_clarification' ||
      money.reentry.status === 'eligible',
    'measure ambiguity clarifies or eligible',
  )
  if (money.resolverOutcome === 'needs_clarification') {
    assert.equal(money.reentry.status, 'eligible')
    if (money.reentry.status === 'eligible') {
      assert.equal(money.reentry.kind, 'v5_clarification')
    }
  }
  console.log('  OK measure clarification eligible under canary sim')
}

// Shadow mode: even eligible pipeline must not own visibly today
{
  const d = decideAssistantAuthority({
    effectiveMode: 'shadow',
    canaryEligible: true,
    requestKind: 'domain_query',
    interpreterStatus: 'ok',
    resolverOutcome: 'bound',
    domainQueryStatus: 'valid',
    semanticCoverageStatus: 'complete',
  })
  assert.equal(d.kind, 'v5_authority')
  if (d.kind === 'v5_authority') {
    assert.equal(d.visibleOwner, 'v3')
    assert.equal(d.ownershipActive, false)
  }
  console.log('  OK shadow remains non-owning')
}

// TR1: open/remainder compounds must not over-resolve into closed authority.
{
  for (const expr of [
    'w tym roku od dziś',
    'Od teraz do grudnia',
    'do końca tego roku',
  ] as const) {
    const open = runPipeline(
      emptyGoalSpec({
        requestKind: 'domain_query',
        source: 'wedding',
        aggregation: 'count',
        temporal: {
          expression: expr,
          resolvedRange: null,
          dateDimension: 'wedding.date',
          dateDimensionAmbiguous: false,
        },
      }),
    )
    assert.equal(
      open.goal.temporal?.resolvedRange,
      null,
      `TR1: ${expr} must stay unresolved`,
    )
    assertIneligible(open, `open-temporal ${expr}`)
  }
  console.log('  OK TR1 open-temporal fail-closed (no false authority)')
}

console.log('CR1 canary re-entry safety: ALL PASSED')
