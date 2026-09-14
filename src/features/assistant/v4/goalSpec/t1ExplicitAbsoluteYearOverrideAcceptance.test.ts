/**
 * T1 — Explicit absolute-year temporal correction must override inherited date.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/t1ExplicitAbsoluteYearOverrideAcceptance.test.ts
 */

import { resolveAggregateDateRange } from '../../dates'
import { emptyDomainQuery, type DomainQuery } from '../domainQuery/domainQuery'
import { bindGoalSpec, makeGoalBinderContext } from './bindGoalSpec'
import { compileBoundGoalToDomainQuery } from './compileBoundGoalToDomainQuery'
import { emptyGoalSpec } from './goalSpec'
import { normalizeGoalSpecTemporal } from './normalizeGoalSpecTemporal'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

const TODAY = '2026-09-13'
const AUGUST = resolveAggregateDateRange('sierpień', TODAY)!
const SEPTEMBER = resolveAggregateDateRange('wrzesień', TODAY)!
const YEAR_2027 = { from: '2027-01-01', to: '2027-12-31' }
const YEAR_2028 = { from: '2028-01-01', to: '2028-12-31' }

function dq(partial: Partial<DomainQuery>): DomainQuery {
  return emptyDomainQuery(partial)
}

function villaLove2027(): DomainQuery {
  return dq({
    aggregate: 'count',
    measure: null,
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
}

function yearOnly2027(): DomainQuery {
  return dq({
    aggregate: null,
    measure: null,
    dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
  })
}

function binderCtx(query: DomainQuery | null) {
  return makeGoalBinderContext({ activeCollectionQuery: query })
}

function temporalDelta(expression: string) {
  return emptyGoalSpec({
    requestKind: 'domain_query',
    dialogue: 'inherit',
    inheritance: { fromActiveCollection: true, fromPrevious: false },
    source: null,
    aggregation: null,
    measure: null,
    temporal: {
      expression,
      resolvedRange: null,
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
  })
}

function runNormalized(goal: ReturnType<typeof emptyGoalSpec>, active: DomainQuery | null) {
  const normalized = normalizeGoalSpecTemporal(goal, TODAY)
  const bound = bindGoalSpec(normalized, binderCtx(active))
  return { normalized, bound }
}

function mustCompile(
  goal: ReturnType<typeof emptyGoalSpec>,
  active: DomainQuery | null,
): DomainQuery {
  const { bound } = runNormalized(goal, active)
  assert(bound.status === 'bound', `expected bound, got ${bound.status}`)
  if (bound.status !== 'bound') throw new Error('unreachable')
  const compiled = compileBoundGoalToDomainQuery(bound.goal)
  assert(compiled.status === 'success', `compile: ${compiled.status}`)
  if (compiled.status !== 'success') throw new Error('unreachable')
  return compiled.query
}

console.log('T1 explicit absolute year override acceptance')

// --- Parser: absolute-year expression forms ---
{
  const cases: Array<[string, string, string]> = [
    ['2028', YEAR_2028.from, YEAR_2028.to],
    ['a w 2028?', YEAR_2028.from, YEAR_2028.to],
    ['w 2028', YEAR_2028.from, YEAR_2028.to],
    ['w 2028 roku', YEAR_2028.from, YEAR_2028.to],
    ['2028?', YEAR_2028.from, YEAR_2028.to],
    ['rok 2028', YEAR_2028.from, YEAR_2028.to],
  ]
  for (const [expr, from, to] of cases) {
    const range = resolveAggregateDateRange(expr, TODAY)
    assert(!!range, `parser resolves ${JSON.stringify(expr)}`)
    assert(range!.from === from && range!.to === to, `parser range ${expr}`)
  }
  assert(
    resolveAggregateDateRange('sierpień 2028', TODAY)?.from === '2028-08-01',
    'month+year preserved',
  )
  assert(
    resolveAggregateDateRange('w przyszłym roku', TODAY)?.from === '2027-01-01',
    'relative year preserved',
  )
  assert(
    resolveAggregateDateRange('od 2027 do 2028', TODAY) === null,
    'ambiguous multi-year stays null',
  )
  console.log('  parser absolute-year forms ok')
}

// A — active 2027 + "a w 2028?" → DQ 2028
{
  const query = mustCompile(temporalDelta('a w 2028?'), yearOnly2027())
  assert(query.dateBinding?.range.from === YEAR_2028.from, 'A from')
  assert(query.dateBinding?.range.to === YEAR_2028.to, 'A to')
  console.log('  A active 2027 → a w 2028? ok')
}

// B — Villa Love + 2027 + "w 2028" → venue kept, year 2028
{
  const query = mustCompile(temporalDelta('w 2028'), villaLove2027())
  assert(
    query.relations.some((r) => r.value === 'Villa Love'),
    'B venue',
  )
  assert(query.dateBinding?.range.from === YEAR_2028.from, 'B from')
  assert(query.dateBinding?.range.to === YEAR_2028.to, 'B to')
  console.log('  B venue + year replace ok')
}

// C — zero-result Villa Love 2027 + explicit 2028 → venue + 2028
{
  const active = villaLove2027()
  // Prior collection empty does not clear relations; year replace still applies.
  const query = mustCompile(temporalDelta('a w 2028?'), active)
  assert(
    query.relations.some((r) => r.value === 'Villa Love'),
    'C venue',
  )
  assert(query.dateBinding?.range.from === YEAR_2028.from, 'C from')
  assert(query.dateBinding?.range.to === YEAR_2028.to, 'C to')
  assert(
    !query.relations.some((r) => r.value === 'Hotel Stary'),
    'C no unrelated venue',
  )
  console.log('  C zero-result preservation ok')
}

// D / E — expression forms through normalize → dateBinding
{
  for (const expr of ['w 2028 roku', '2028?'] as const) {
    const query = mustCompile(temporalDelta(expr), yearOnly2027())
    assert(query.dateBinding?.range.from === YEAR_2028.from, `${expr} from`)
    assert(query.dateBinding?.range.to === YEAR_2028.to, `${expr} to`)
  }
  console.log('  D/E expression forms → dateBinding ok')
}

// F — month correction: August → September
{
  const active = dq({
    aggregate: 'count',
    dateBinding: {
      dimension: 'wedding.date',
      range: { from: AUGUST.from, to: AUGUST.to },
    },
  })
  const query = mustCompile(temporalDelta('wrzesień'), active)
  assert(query.dateBinding?.range.from === SEPTEMBER.from, 'F from')
  assert(query.dateBinding?.range.to === SEPTEMBER.to, 'F to')
  console.log('  F month override ok')
}

// G — no temporal delta → inherited temporal remains
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    dialogue: 'inherit',
    inheritance: { fromActiveCollection: true, fromPrevious: false },
    source: null,
    aggregation: null,
    temporal: null,
  })
  const query = mustCompile(goal, villaLove2027())
  assert(query.dateBinding?.range.from === YEAR_2027.from, 'G from')
  assert(query.dateBinding?.range.to === YEAR_2027.to, 'G to')
  console.log('  G no-delta inheritance ok')
}

// H — non-temporal sparse GoalSpec keeps venue + measure inherit path
{
  const active = dq({
    aggregate: 'sum',
    measure: 'wedding.paid_amount',
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
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    dialogue: 'inherit',
    inheritance: { fromActiveCollection: true, fromPrevious: false },
    source: null,
    aggregation: 'count',
    measure: null,
    temporal: null,
  })
  const query = mustCompile(goal, active)
  assert(
    query.relations.some((r) => r.value === 'Villa Love'),
    'H venue',
  )
  assert(query.dateBinding?.range.from === YEAR_2027.from, 'H date')
  assert(query.aggregate === 'count', 'H aggregate')
  assert(query.measure === null, 'H measure cleared for count')
  console.log('  H sparse non-temporal inherit ok')
}

// I — unresolved explicit temporal must NOT inherit previous year
{
  const { bound } = runNormalized(
    temporalDelta('zupełnie nieparsowalny okres'),
    villaLove2027(),
  )
  assert(bound.status === 'unsupported', 'I unsupported')
  if (bound.status === 'unsupported') {
    assert(
      bound.reason === 'temporal_expression_unresolved',
      'I reason',
    )
  }
  // Binder sees expression without resolvedRange (normalize skipped) → fail closed
  const binderOnly = bindGoalSpec(
    emptyGoalSpec({
      requestKind: 'domain_query',
      dialogue: 'inherit',
      inheritance: { fromActiveCollection: true, fromPrevious: false },
      aggregation: 'count',
      source: 'wedding',
      temporal: {
        expression: 'foobar temporal',
        resolvedRange: null,
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
    }),
    binderCtx(villaLove2027()),
  )
  assert(binderOnly.status === 'unsupported', 'I binder unsupported')
  if (binderOnly.status === 'unsupported') {
    assert(
      binderOnly.reason === 'temporal_expression_unresolved',
      'I binder reason',
    )
  }
  console.log('  I unresolved explicit temporal fail-closed ok')
}

console.log('T1 PASS')
