/**
 * S1 — Context Resolver foundation acceptance.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/s1ContextResolverFoundationAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyDomainQuery } from '../domainQuery/domainQuery'
import {
  getFieldCollectionSource,
  SEMANTIC_FIELD_REGISTRY,
} from '../domainQuery/fieldRegistry'
import { applyGoalClarificationAnswer } from './applyGoalClarificationAnswer'
import { bindGoalSpec, makeGoalBinderContext } from './bindGoalSpec'
import { emptyGoalSpec } from './goalSpec'
import {
  clearGoalClarificationSession,
  getPendingGoalClarification,
} from './goalClarificationSession'
import {
  answerGoalClarification,
  bindGoalSpecWithClarification,
} from './resumeGoalClarification'
import {
  isSourceCompatible,
  resolveCollectionSource,
} from './resolveCollectionSource'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function assertEq<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`FAIL: ${msg} (${String(a)} !== ${String(b)})`)
}

console.log('S1 Context Resolver foundation')

// Registry: entity ≠ collectionSource for place
{
  assertEq(
    SEMANTIC_FIELD_REGISTRY['wedding.paid_amount'].collectionSource,
    'wedding',
    'paid collectionSource',
  )
  assertEq(
    SEMANTIC_FIELD_REGISTRY['place.name'].entity,
    'place',
    'place entity',
  )
  assertEq(
    SEMANTIC_FIELD_REGISTRY['place.name'].collectionSource,
    null,
    'place collectionSource null',
  )
  assertEq(getFieldCollectionSource('wedding.paid_amount'), 'wedding', 'helper')
  assertEq(getFieldCollectionSource('place.name'), null, 'helper place')
  console.log('  OK registry collectionSource')
}

// A–C: measure → source from registry
{
  for (const measure of [
    'wedding.paid_amount',
    'wedding.contract_value',
    'wedding.remaining_amount',
  ] as const) {
    const r = resolveCollectionSource(
      emptyGoalSpec({
        source: null,
        aggregation: 'sum',
        measure,
      }),
    )
    assertEq(r.status, 'resolved', `${measure} status`)
    if (r.status === 'resolved') {
      assertEq(r.source, 'wedding', `${measure} source`)
      assertEq(r.via, 'measure', `${measure} via`)
    }
    const bound = bindGoalSpec(
      emptyGoalSpec({
        requestKind: 'domain_query',
        source: null,
        aggregation: 'sum',
        measure,
      }),
      makeGoalBinderContext({}),
    )
    assertEq(bound.status, 'bound', `${measure} bind`)
    if (bound.status === 'bound') {
      assertEq(bound.goal.source, 'wedding', `${measure} bound source`)
    }
  }
  console.log('  OK A–C measure → wedding')
}

// D: place relation does not set source=place
{
  const bound = bindGoalSpec(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: null,
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
      relations: [
        {
          relation: 'place',
          field: 'place.name',
          op: 'contains',
          value: 'Villa Love',
        },
      ],
    }),
    makeGoalBinderContext({}),
  )
  assertEq(bound.status, 'bound', 'D bound')
  if (bound.status === 'bound') {
    assertEq(bound.goal.source, 'wedding', 'D source wedding')
    assert(
      bound.goal.relations.some((r) => r.value === 'Villa Love'),
      'D place relation',
    )
  }
  console.log('  OK D place ≠ source')
}

// E: compatible inherit
{
  assert(isSourceCompatible('wedding', 'wedding'), 'E compatible')
  const r = resolveCollectionSource(
    emptyGoalSpec({
      source: null,
      aggregation: 'list',
      measure: null,
    }),
    {
      activeCollectionQuery: emptyDomainQuery({ source: 'wedding' }),
    },
  )
  assertEq(r.status, 'resolved', 'E status')
  if (r.status === 'resolved') {
    assertEq(r.via, 'inherited', 'E via inherit')
  }
  console.log('  OK E compatible inherit')
}

// F: incompatible synthetic ownership rejects inherit
{
  const bound = bindGoalSpec(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: null,
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
    }),
    makeGoalBinderContext({
      activeCollectionQuery: emptyDomainQuery({ source: 'wedding' }),
      getCollectionSource: (id) =>
        id === 'wedding.paid_amount'
          ? 'synthetic_other'
          : getFieldCollectionSource(id),
    }),
  )
  assertEq(bound.status, 'unsupported', 'F unsupported')
  if (bound.status === 'unsupported') {
    assert(
      bound.reason.includes('synthetic_other') ||
        bound.reason.includes('not_in_g7'),
      `F reason ${bound.reason}`,
    )
  }
  console.log('  OK F incompatible reject')
}

// G: typed clarification patches measure only; Resolver derives source
{
  clearGoalClarificationSession()
  const first = bindGoalSpecWithClarification({
    goal: emptyGoalSpec({
      requestKind: 'domain_query',
      source: null,
      aggregation: 'sum',
      measure: null,
      ambiguities: [{ slot: 'measure', reason: 'sum_requires_measure' }],
    }),
    activeCollectionQuery: null,
    storePending: true,
  })
  assertEq(first.status, 'needs_clarification', 'G clarify')
  if (first.status !== 'needs_clarification') throw new Error('unreachable')
  assertEq(first.request.pendingGoal.source, null, 'G pending source null')

  const applied = applyGoalClarificationAnswer(first.request, {
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
  })
  assert(applied.ok, 'G apply ok')
  if (!applied.ok) throw new Error('unreachable')
  assertEq(applied.goal.measure, 'wedding.paid_amount', 'G patched measure')
  assertEq(applied.goal.source, null, 'G patch did not set source')

  const after = bindGoalSpecWithClarification({
    goal: applied.goal,
    activeCollectionQuery: null,
    storePending: false,
  })
  assertEq(after.status, 'bound', 'G resolver bound')
  if (after.status === 'bound') {
    assertEq(after.goal.source, 'wedding', 'G source from registry')
    assertEq(after.goal.measure, 'wedding.paid_amount', 'G measure')
    assertEq(after.query.source, 'wedding', 'G DQ source')
    assertEq(after.query.aggregate, 'sum', 'G DQ agg')
    assertEq(after.query.measure, 'wedding.paid_amount', 'G DQ measure')
  }
  console.log('  OK G patch-only + Resolver source')
}

// Full click path (pending intact)
{
  clearGoalClarificationSession()
  const first = bindGoalSpecWithClarification({
    goal: emptyGoalSpec({
      requestKind: 'domain_query',
      source: null,
      aggregation: 'sum',
      measure: null,
    }),
    storePending: true,
  })
  assertEq(first.status, 'needs_clarification', 'click clarify')
  if (first.status !== 'needs_clarification') throw new Error('unreachable')
  const pending = getPendingGoalClarification()
  assert(!!pending, 'pending set')
  assertEq(pending!.pendingGoal.source, null, 'click pending source null')
  const resumed = answerGoalClarification({
    clarificationId: first.request.id,
    slot: 'measure',
    selectedValue: 'wedding.paid_amount',
  })
  assertEq(resumed.status, 'bound', 'click bound')
  if (resumed.status === 'bound') {
    assertEq(resumed.query.measure, 'wedding.paid_amount', 'click DQ')
    assertEq(resumed.patchedGoal.source, null, 'patched GoalSpec source still null')
    assertEq(resumed.goal.source, 'wedding', 'BoundGoal source wedding')
  }
  clearGoalClarificationSession()
  console.log('  OK full typed resume path')
}

// Defer: sum + null measure + null source → measure clarify (not source invent)
{
  const r = resolveCollectionSource(
    emptyGoalSpec({ source: null, aggregation: 'sum', measure: null }),
  )
  assertEq(r.status, 'defer_for_measure', 'defer')
  console.log('  OK defer_for_measure')
}

// Zero-LLM static
{
  const resolver = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/resolveCollectionSource.ts',
    ),
    'utf8',
  )
  const resume = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/resumeGoalClarification.ts',
    ),
    'utf8',
  )
  assert(!/interpretGoalSpec/.test(resolver), 'no interpret in resolver')
  assert(!/v5_goal_interpret/.test(resolver), 'no edge mode in resolver')
  assert(!/tryAutoResolveWeddingCollectionSource/.test(resume), 'U4.8 removed')
  assert(!/wpłynęło|pokaż je|ile to będzie/.test(resolver), 'no Polish phrases')
  assert(!/new RegExp/.test(resolver), 'no regex')
  console.log('  OK zero-LLM / no raw text')
}

console.log('S1 Context Resolver foundation: ALL PASSED')
