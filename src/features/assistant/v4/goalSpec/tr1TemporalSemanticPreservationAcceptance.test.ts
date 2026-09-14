/**
 * TR1 — Temporal semantic preservation hardening acceptance.
 *
 * Closed calendar ranges resolve only when whole-expression equivalent.
 * Open / remainder / from-now / before-after stay meaning-only → SC1 incomplete
 * → not canary-authority eligible. No phrase-specific normalizer rules.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/tr1TemporalSemanticPreservationAcceptance.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveAggregateDateRange } from '../../dates'
import {
  assessCanaryReentryEligibility,
  isCanaryReentryEligible,
} from '../authority/canaryReentryEligibility'
import { emptyDomainQuery, type DomainQuery } from '../domainQuery/domainQuery'
import { bindGoalSpec, makeGoalBinderContext } from './bindGoalSpec'
import { compileBoundGoalToDomainQuery } from './compileBoundGoalToDomainQuery'
import { emptyGoalSpec, type GoalSpec } from './goalSpec'
import { normalizeGoalSpecTemporal } from './normalizeGoalSpecTemporal'
import { assessSemanticCoverage } from './semanticCoverage'

const TODAY = '2026-09-14'
const YEAR_2028 = { from: '2028-01-01', to: '2028-12-31' }
const YEAR_2027 = { from: '2027-01-01', to: '2027-12-31' }
const YEAR_2026 = { from: '2026-01-01', to: '2026-12-31' }
const SEPT_2026 = { from: '2026-09-01', to: '2026-09-30' }
const AUG_2026 = { from: '2026-08-01', to: '2026-08-31' }

function countGoal(expression: string | null, extras: Partial<GoalSpec> = {}): GoalSpec {
  return emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'count',
    temporal: {
      expression,
      resolvedRange: null,
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
    ...extras,
  })
}

function run(goalIn: GoalSpec, active: DomainQuery | null = null) {
  const goal = normalizeGoalSpecTemporal(goalIn, TODAY)
  const bound = bindGoalSpec(
    goal,
    makeGoalBinderContext({ activeCollectionQuery: active }),
  )
  if (bound.status !== 'bound') {
    const reentry = assessCanaryReentryEligibility({
      goalSpec: goal,
      interpreterStatus: 'ok',
      resolverOutcome: bound.status,
      clarificationSlot:
        bound.status === 'needs_clarification'
          ? (bound.clarification.ambiguousSlots[0] ??
            bound.clarification.missingSlots[0] ??
            'other')
          : undefined,
    })
    return {
      goal,
      boundStatus: bound.status as string,
      query: null as DomainQuery | null,
      coverage: null,
      reentry,
      eligible: isCanaryReentryEligible(reentry),
    }
  }
  const compiled = compileBoundGoalToDomainQuery(bound.goal)
  assert.equal(compiled.status, 'success')
  const query = compiled.status === 'success' ? compiled.query : null
  const coverage = assessSemanticCoverage({
    goalSpec: goal,
    domainQuery: query!,
  })
  const reentry = assessCanaryReentryEligibility({
    goalSpec: goal,
    boundGoal: bound.goal,
    domainQuery: query,
    interpreterStatus: 'ok',
    resolverOutcome: 'bound',
  })
  return {
    goal,
    boundStatus: 'bound' as string,
    query,
    coverage,
    reentry,
    eligible: isCanaryReentryEligible(reentry),
  }
}

console.log('TR1 temporal semantic preservation')

// No phrase-specific normalizer / coverage patches for open temporal
{
  for (const file of [
    'dates.ts',
    'normalizeGoalSpecTemporal.ts',
    'semanticCoverage.ts',
  ]) {
    const path =
      file === 'dates.ts'
        ? resolve(process.cwd(), 'src/features/assistant/dates.ts')
        : resolve(process.cwd(), `src/features/assistant/v4/goalSpec/${file}`)
    const src = readFileSync(path, 'utf8')
    assert.equal(
      /od dziś|od teraz|jeszcze|reszta tego|do końca tego roku/i.test(src),
      false,
      `${file}: no open-temporal phrase special-cases`,
    )
  }
  console.log('  phrase-specific gate ok')
}

// A — absolute year 2028 → closed → COMPLETE → IC1 eligible
{
  const p = run(countGoal('2028'))
  assert.deepEqual(p.goal.temporal?.resolvedRange, YEAR_2028)
  assert.equal(p.coverage?.status, 'complete')
  assert.equal(p.eligible, true)
  console.log('  A absolute year COMPLETE+eligible ok')
}

// B — absolute month → closed → COMPLETE
{
  const p = run(countGoal('we wrześniu 2026'))
  assert.deepEqual(p.goal.temporal?.resolvedRange, SEPT_2026)
  assert.equal(p.coverage?.status, 'complete')
  assert.equal(p.eligible, true)
  console.log('  B absolute month COMPLETE ok')
}

// C — explicit supported closed range (typed resolvedRange already present)
{
  const p = run(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'count',
      temporal: {
        expression: null,
        resolvedRange: { from: '2026-09-10', to: '2026-09-30' },
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
    }),
  )
  assert.equal(p.boundStatus, 'bound')
  assert.equal(p.coverage?.status, 'complete')
  assert.equal(p.eligible, true)
  // Day-span free text is NOT silently widened to full month
  assert.equal(
    resolveAggregateDateRange('od 10 września do 30 września', TODAY),
    null,
  )
  console.log('  C explicit typed closed range COMPLETE; free-text day span fail-closed ok')
}

// D — from-now → end of year typed meaning without exact boundaries
{
  const p = run(countGoal('w tym roku od dziś'))
  assert.equal(p.goal.temporal?.resolvedRange, null)
  assert.notEqual(p.goal.temporal?.resolvedRange, YEAR_2026)
  assert.equal(p.eligible, false)
  if (p.coverage) {
    assert.equal(p.coverage.status, 'incomplete')
    assert.ok(p.coverage.reasonCodes.includes('unresolved_temporal_intent'))
  } else {
    assert.equal(p.boundStatus, 'unsupported')
  }
  console.log('  D from-now not whole-year ok')
}

// E — remaining current year → not whole-year authority
{
  for (const expr of [
    'do końca tego roku',
    'jeszcze do końca tego roku',
    'reszta tego roku',
  ] as const) {
    const p = run(countGoal(expr))
    assert.equal(p.goal.temporal?.resolvedRange, null, expr)
    assert.equal(p.eligible, false, expr)
  }
  console.log('  E remaining-year fail-closed ok')
}

// F — remaining current month → not full-month authority
{
  for (const expr of [
    'reszta tego miesiąca',
    'w tym miesiącu jeszcze',
    'od dziś do końca miesiąca',
  ] as const) {
    const p = run(countGoal(expr))
    assert.equal(p.goal.temporal?.resolvedRange, null, expr)
    assert.notDeepEqual(p.goal.temporal?.resolvedRange, SEPT_2026, expr)
    assert.equal(p.eligible, false, expr)
  }
  console.log('  F remaining-month fail-closed ok')
}

// G — after today → not silently converted to broad period
{
  for (const expr of [
    'po dziś',
    'po dzisiejszym dniu',
    'od dziś',
  ] as const) {
    const p = run(countGoal(expr))
    assert.equal(p.goal.temporal?.resolvedRange, null, expr)
    assert.equal(p.eligible, false, expr)
  }
  console.log('  G after-today fail-closed ok')
}

// H — before X → no widening of meaning
{
  for (const expr of [
    'przed końcem października',
    'przed grudniem',
    'Od teraz do grudnia',
  ] as const) {
    const p = run(countGoal(expr))
    assert.equal(p.goal.temporal?.resolvedRange, null, expr)
    assert.equal(p.eligible, false, expr)
  }
  console.log('  H before-X / from-now-to-month fail-closed ok')
}

// I — previous active year + unresolved current temporal → do NOT inherit prior year
{
  const active = emptyDomainQuery({
    source: 'wedding',
    aggregate: 'count',
    dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
  })
  const p = run(
    emptyGoalSpec({
      requestKind: 'domain_query',
      dialogue: 'inherit',
      inheritance: { fromActiveCollection: true, fromPrevious: false },
      source: null,
      aggregation: null,
      temporal: {
        expression: 'w tym roku od dziś',
        resolvedRange: null,
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
    }),
    active,
  )
  assert.equal(p.goal.temporal?.resolvedRange, null)
  assert.equal(p.eligible, false)
  if (p.query?.dateBinding) {
    assert.notDeepEqual(p.query.dateBinding.range, YEAR_2027)
  }
  console.log('  I no inherited prior-year under unresolved temporal ok')
}

// J — count→list over valid closed range → identity preserved
{
  const active = emptyDomainQuery({
    source: 'wedding',
    aggregate: 'count',
    dateBinding: { dimension: 'wedding.date', range: AUG_2026 },
  })
  const p = run(
    emptyGoalSpec({
      requestKind: 'domain_query',
      dialogue: 'inherit',
      inheritance: { fromActiveCollection: true, fromPrevious: false },
      source: null,
      aggregation: 'list',
      targets: [{ kind: 'active_collection', label: null }],
      temporal: {
        expression: null,
        resolvedRange: null,
        dateDimension: null,
        dateDimensionAmbiguous: false,
      },
    }),
    active,
  )
  assert.equal(p.boundStatus, 'bound')
  assert.deepEqual(p.query?.dateBinding?.range, AUG_2026)
  assert.equal(p.query?.aggregate, null)
  assert.equal(p.eligible, true)
  console.log('  J count→list identity preserved ok')
}

// Faithful closed relatives still resolve
{
  assert.deepEqual(
    resolveAggregateDateRange('w tym roku', TODAY)?.from &&
      resolveAggregateDateRange('w tym roku', TODAY)?.to
      ? {
          from: resolveAggregateDateRange('w tym roku', TODAY)!.from,
          to: resolveAggregateDateRange('w tym roku', TODAY)!.to,
        }
      : null,
    YEAR_2026,
  )
  assert.deepEqual(
    {
      from: resolveAggregateDateRange('w tym miesiącu', TODAY)!.from,
      to: resolveAggregateDateRange('w tym miesiącu', TODAY)!.to,
    },
    SEPT_2026,
  )
  assert.equal(
    resolveAggregateDateRange('a w przyszłym roku?', TODAY)?.from,
    '2027-01-01',
  )
  console.log('  closed relative year/month still resolve ok')
}

console.log('TR1 temporal semantic preservation: ALL PASSED')
