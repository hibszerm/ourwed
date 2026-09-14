/**
 * SC1 — Semantic coverage authority gate acceptance.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/sc1SemanticCoverageAuthorityAcceptance.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { decideAssistantAuthority } from '../authority/decideAuthority'
import { emptyDomainQuery, type DomainQuery } from '../domainQuery/domainQuery'
import { bindGoalSpec, makeGoalBinderContext } from './bindGoalSpec'
import { compileBoundGoalToDomainQuery } from './compileBoundGoalToDomainQuery'
import { emptyGoalSpec, type GoalSpec } from './goalSpec'
import { normalizeGoalSpecTemporal } from './normalizeGoalSpecTemporal'
import {
  assessSemanticCoverage,
  type SemanticCoverageResult,
} from './semanticCoverage'

const TODAY = '2026-09-14'
const YEAR_2027 = { from: '2027-01-01', to: '2027-12-31' }
const YEAR_2028 = { from: '2028-01-01', to: '2028-12-31' }
const AUGUST = { from: '2026-08-01', to: '2026-08-31' }

function dq(partial: Partial<DomainQuery> = {}): DomainQuery {
  return emptyDomainQuery(partial)
}

function countQuery(partial: Partial<DomainQuery> = {}): DomainQuery {
  return dq({ aggregate: 'count', measure: null, ...partial })
}

function listQuery(partial: Partial<DomainQuery> = {}): DomainQuery {
  return dq({ aggregate: null, measure: null, limit: 20, ...partial })
}

function authorityFromCoverage(
  coverage: SemanticCoverageResult,
  opts: {
    mode?: 'shadow' | 'canary'
    canaryEligible?: boolean
    query?: DomainQuery
  } = {},
) {
  const query = opts.query ?? countQuery()
  const sliceOk =
    query.source === 'wedding' &&
    ((query.aggregate === 'count' && query.measure == null) ||
      (query.aggregate === null && query.measure == null) ||
      (query.aggregate === 'sum' && query.measure != null))
  return decideAssistantAuthority({
    effectiveMode: opts.mode ?? 'canary',
    requestKind: 'domain_query',
    interpreterStatus: 'ok',
    resolverOutcome: 'bound',
    domainQueryStatus: sliceOk ? 'valid' : 'slice_ineligible',
    canaryEligible: opts.canaryEligible ?? true,
    semanticCoverageStatus: coverage.status,
    semanticCoverageReasons:
      coverage.status === 'incomplete' ? coverage.reasonCodes : undefined,
  })
}

function assertIncomplete(
  coverage: SemanticCoverageResult,
  msg: string,
  expectedCode?: string,
) {
  assert.equal(coverage.status, 'incomplete', msg)
  if (coverage.status === 'incomplete' && expectedCode) {
    assert.ok(
      coverage.reasonCodes.includes(expectedCode as never),
      `${msg}: expected ${expectedCode}, got ${coverage.reasonCodes.join(',')}`,
    )
  }
}

console.log('SC1 semantic coverage authority')

// Gate: no raw-language heuristics in coverage / decideAuthority
{
  for (const file of [
    'semanticCoverage.ts',
    resolve(process.cwd(), 'src/features/assistant/v4/authority/decideAuthority.ts'),
  ]) {
    const path = file.includes('/')
      ? file
      : resolve(process.cwd(), `src/features/assistant/v4/goalSpec/${file}`)
    const src = readFileSync(path, 'utf8')
    assert(!/najwięcej|jeszcze|pokaż je|question\.contains/i.test(src), `${path}: no phrases`)
  }
  console.log('  raw-language gate ok')
}

// A — groupBy + rank GoalSpec vs simple count DQ → incomplete → V3
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'rank',
    groupBy: ['wedding.date'],
    orderBy: [{ field: 'wedding.date', direction: 'desc' }],
  })
  const query = countQuery()
  const coverage = assessSemanticCoverage({ goalSpec: goal, domainQuery: query })
  assertIncomplete(coverage, 'A coverage', 'groupby_not_executable')
  assertIncomplete(coverage, 'A rank', 'unsupported_aggregation')
  const d = authorityFromCoverage(coverage, { query })
  assert.equal(d.kind, 'v3_fallback', 'A authority')
  if (d.kind === 'v3_fallback') {
    assert.equal(d.reason, 'SEMANTIC_COVERAGE_INCOMPLETE')
  }
  console.log('  A group/rank → incomplete ok')
}

// B — orderBy present but wiped / not executable
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'count',
    orderBy: [{ field: 'wedding.date', direction: 'desc' }],
  })
  const query = countQuery()
  const coverage = assessSemanticCoverage({
    goalSpec: goal,
    boundGoal: {
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'count',
      measure: null,
      temporal: { resolvedRange: null, dateDimension: null },
      relations: [],
      orderBy: [],
      groupBy: [],
      aspects: [],
      targets: [],
    },
    domainQuery: query,
  })
  assertIncomplete(coverage, 'B', 'orderby_not_preserved')
  const d = authorityFromCoverage(coverage)
  assert.equal(d.kind, 'v3_fallback', 'B authority')
  console.log('  B orderBy → incomplete ok')
}

// C — unresolved material temporal + inherited collection
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    dialogue: 'inherit',
    inheritance: { fromActiveCollection: true, fromPrevious: false },
    aggregation: 'count',
    temporal: {
      expression: 'do końca tego roku',
      resolvedRange: null,
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
  })
  const active = countQuery({
    dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
  })
  // Binder fail-closes; coverage also incomplete on GoalSpec alone
  const coverage = assessSemanticCoverage({
    goalSpec: goal,
    domainQuery: active,
  })
  assertIncomplete(coverage, 'C', 'unresolved_temporal_intent')
  const bind = bindGoalSpec(
    goal,
    makeGoalBinderContext({ activeCollectionQuery: active }),
  )
  assert.equal(bind.status, 'unsupported', 'C binder unsupported')
  const d = authorityFromCoverage(coverage, { query: active })
  assert.equal(d.kind, 'v3_fallback', 'C no V5')
  console.log('  C unresolved temporal ok')
}

// D — supported closed date + count
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'count',
    temporal: {
      expression: '2028',
      resolvedRange: YEAR_2028,
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
  })
  const query = countQuery({
    dateBinding: { dimension: 'wedding.date', range: YEAR_2028 },
  })
  const coverage = assessSemanticCoverage({ goalSpec: goal, domainQuery: query })
  assert.equal(coverage.status, 'complete', 'D')
  const d = authorityFromCoverage(coverage, { query })
  assert.equal(d.kind, 'v5_authority')
  assert.equal(d.visibleOwner, 'v5')
  console.log('  D closed date count ok')
}

// E — closed date + venue + count
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'count',
    temporal: {
      expression: '2028',
      resolvedRange: YEAR_2028,
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: { text: 'Villa Love', kindHint: 'venue' },
      },
    ],
  })
  const query = countQuery({
    dateBinding: { dimension: 'wedding.date', range: YEAR_2028 },
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: 'Villa Love',
      },
    ],
  })
  const coverage = assessSemanticCoverage({ goalSpec: goal, domainQuery: query })
  assert.equal(coverage.status, 'complete', 'E')
  console.log('  E venue + date count ok')
}

// F — sum + finance measure + date
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'sum',
    measure: 'wedding.paid_amount',
    temporal: {
      expression: null,
      resolvedRange: AUGUST,
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
  })
  const query = dq({
    aggregate: 'sum',
    measure: 'wedding.paid_amount',
    dateBinding: { dimension: 'wedding.date', range: AUGUST },
  })
  const coverage = assessSemanticCoverage({ goalSpec: goal, domainQuery: query })
  assert.equal(coverage.status, 'complete', 'F')
  const d = authorityFromCoverage(coverage, { query })
  assert.equal(d.kind, 'v5_authority', 'F authority')
  console.log('  F sum + measure ok')
}

// G — count(Q) → list(Q) identity
{
  const active = countQuery({
    dateBinding: { dimension: 'wedding.date', range: AUGUST },
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: 'Villa Love',
      },
    ],
  })
  const listGoal = emptyGoalSpec({
    requestKind: 'domain_query',
    dialogue: 'inherit',
    inheritance: { fromActiveCollection: true, fromPrevious: false },
    aggregation: 'list',
    source: null,
    temporal: null,
  })
  const bound = bindGoalSpec(
    listGoal,
    makeGoalBinderContext({ activeCollectionQuery: active }),
  )
  assert.equal(bound.status, 'bound', 'G bound')
  if (bound.status !== 'bound') throw new Error('unreachable')
  const compiled = compileBoundGoalToDomainQuery(bound.goal)
  assert.equal(compiled.status, 'success', 'G compile')
  if (compiled.status !== 'success') throw new Error('unreachable')
  assert.equal(compiled.query.aggregate, null, 'G list')
  assert.equal(
    compiled.query.dateBinding?.range.from,
    AUGUST.from,
    'G date',
  )
  assert.ok(
    compiled.query.relations.some((r) => r.value === 'Villa Love'),
    'G venue',
  )
  const coverage = assessSemanticCoverage({
    goalSpec: listGoal,
    boundGoal: bound.goal,
    domainQuery: compiled.query,
  })
  assert.equal(coverage.status, 'complete', 'G coverage')
  console.log('  G count→list identity ok')
}

// H — zero-result Q → list(Q)
{
  const active = countQuery({
    dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: 'Villa Love',
      },
    ],
  })
  const listGoal = emptyGoalSpec({
    requestKind: 'domain_query',
    dialogue: 'inherit',
    inheritance: { fromActiveCollection: true, fromPrevious: false },
    aggregation: 'list',
  })
  const bound = bindGoalSpec(
    listGoal,
    makeGoalBinderContext({ activeCollectionQuery: active }),
  )
  assert.equal(bound.status, 'bound', 'H bound')
  if (bound.status !== 'bound') throw new Error('unreachable')
  const compiled = compileBoundGoalToDomainQuery(bound.goal)
  assert.equal(compiled.status, 'success')
  if (compiled.status !== 'success') throw new Error('unreachable')
  assert.equal(compiled.query.dateBinding?.range.from, YEAR_2027.from)
  assert.ok(compiled.query.relations.some((r) => r.value === 'Villa Love'))
  const coverage = assessSemanticCoverage({
    goalSpec: listGoal,
    boundGoal: bound.goal,
    domainQuery: compiled.query,
  })
  assert.equal(coverage.status, 'complete', 'H')
  console.log('  H zero-result identity ok')
}

// I — unsupported aggregates
for (const agg of ['avg', 'min', 'max', 'rank', 'group'] as const) {
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: agg,
  })
  const coverage = assessSemanticCoverage({
    goalSpec: goal,
    domainQuery: countQuery(),
  })
  assertIncomplete(coverage, `I ${agg}`, 'unsupported_aggregation')
  const d = authorityFromCoverage(coverage)
  assert.equal(d.kind, 'v3_fallback', `I ${agg} authority`)
}
console.log('  I unsupported aggregates ok')

// J — non-place unsupported relation
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'count',
    relations: [
      {
        relation: 'package',
        field: 'package.name',
        op: 'contains',
        value: 'Gold',
      },
    ],
  })
  const coverage = assessSemanticCoverage({
    goalSpec: goal,
    domainQuery: countQuery(),
  })
  assertIncomplete(coverage, 'J', 'unsupported_relation')
  const bind = bindGoalSpec(goal, makeGoalBinderContext({}))
  assert.equal(bind.status, 'unsupported', 'J binder')
  console.log('  J unsupported relation ok')
}

// K — non-allowlisted user → V3 even if coverage complete
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'count',
  })
  const query = countQuery()
  const coverage = assessSemanticCoverage({ goalSpec: goal, domainQuery: query })
  assert.equal(coverage.status, 'complete')
  const d = authorityFromCoverage(coverage, {
    mode: 'canary',
    canaryEligible: false,
    query,
  })
  assert.equal(d.kind, 'v3_fallback')
  if (d.kind === 'v3_fallback') {
    assert.equal(d.reason, 'CANARY_INELIGIBLE')
  }
  console.log('  K non-allowlisted ok')
}

// L — runtime shadow → V3 visible regardless of coverage complete
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'count',
    temporal: {
      expression: '2028',
      resolvedRange: YEAR_2028,
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
  })
  const query = countQuery({
    dateBinding: { dimension: 'wedding.date', range: YEAR_2028 },
  })
  const coverage = assessSemanticCoverage({ goalSpec: goal, domainQuery: query })
  assert.equal(coverage.status, 'complete')
  const d = authorityFromCoverage(coverage, {
    mode: 'shadow',
    canaryEligible: true,
    query,
  })
  assert.equal(d.kind, 'v5_authority')
  assert.equal(d.visibleOwner, 'v3')
  assert.equal(d.ownershipActive, false)
  console.log('  L shadow V3 visible ok')
}

// Normalized absolute year remains complete (T1 path)
{
  const goal = normalizeGoalSpecTemporal(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'count',
      temporal: {
        expression: 'a w 2028?',
        resolvedRange: null,
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
    }),
    TODAY,
  )
  assert.ok(goal.temporal?.resolvedRange)
  const query = countQuery({
    dateBinding: {
      dimension: 'wedding.date',
      range: goal.temporal!.resolvedRange!,
    },
  })
  assert.equal(
    assessSemanticCoverage({ goalSpec: goal, domainQuery: query }).status,
    'complete',
    'T1 year form complete',
  )
}

// Capability matrix (typed shapes)
{
  const cases: Array<{
    id: string
    expect: 'complete' | 'incomplete'
    goal: GoalSpec
    query: DomainQuery
  }> = [
    {
      id: 'count+closed-temporal',
      expect: 'complete',
      goal: emptyGoalSpec({
        requestKind: 'domain_query',
        source: 'wedding',
        aggregation: 'count',
        temporal: {
          expression: '2028',
          resolvedRange: YEAR_2028,
          dateDimension: 'wedding.date',
          dateDimensionAmbiguous: false,
        },
      }),
      query: countQuery({
        dateBinding: { dimension: 'wedding.date', range: YEAR_2028 },
      }),
    },
    {
      id: 'list+inherit-empty-delta',
      expect: 'complete',
      goal: emptyGoalSpec({
        requestKind: 'domain_query',
        dialogue: 'inherit',
        aggregation: 'list',
      }),
      query: listQuery({
        dateBinding: { dimension: 'wedding.date', range: AUGUST },
      }),
    },
    {
      id: 'sum+money',
      expect: 'complete',
      goal: emptyGoalSpec({
        requestKind: 'domain_query',
        source: 'wedding',
        aggregation: 'sum',
        measure: 'wedding.remaining_amount',
      }),
      query: dq({
        aggregate: 'sum',
        measure: 'wedding.remaining_amount',
      }),
    },
    {
      id: 'reject-group',
      expect: 'incomplete',
      goal: emptyGoalSpec({
        requestKind: 'domain_query',
        aggregation: 'count',
        groupBy: ['wedding.date'],
      }),
      query: countQuery(),
    },
    {
      id: 'reject-avg',
      expect: 'incomplete',
      goal: emptyGoalSpec({
        requestKind: 'domain_query',
        aggregation: 'avg',
        measure: 'wedding.contract_value',
      }),
      query: countQuery(),
    },
    {
      id: 'reject-unresolved-temporal',
      expect: 'incomplete',
      goal: emptyGoalSpec({
        requestKind: 'domain_query',
        aggregation: 'count',
        temporal: {
          expression: 'reszta roku',
          resolvedRange: null,
          dateDimension: 'wedding.date',
          dateDimensionAmbiguous: false,
        },
      }),
      query: countQuery(),
    },
  ]
  for (const c of cases) {
    const r = assessSemanticCoverage({
      goalSpec: c.goal,
      domainQuery: c.query,
    })
    assert.equal(r.status, c.expect, `matrix ${c.id}`)
  }
  console.log('  capability matrix ok')
}

console.log('SC1 semantic coverage authority: PASS')
