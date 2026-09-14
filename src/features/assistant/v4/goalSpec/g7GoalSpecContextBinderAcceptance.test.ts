/**
 * G7 — GoalSpec Context Binder foundation acceptance.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/g7GoalSpecContextBinderAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveAggregateDateRange } from '../../dates'
import { makeTaskSpec } from '../expect'
import { resolveTaskSpec } from '../resolver/resolve'
import {
  emptyV4ShadowContext,
  type ResolvedTask,
  type V4ShadowContext,
} from '../resolver/types'
import {
  applyAssistantV4ShadowTransition,
  clearAssistantV4ShadowSession,
  mergeShadowOverlay,
} from '../resolver/shadowState'
import { stashCollectionQueryExecutionExtrasForTests } from '../capabilities/collection/collectionQueryCapability'
import type { CollectionMoneyRow } from '../capabilities/collection/executeCollectionQuery'
import { executeDomainQueryOnRows } from '../domainQuery/executeDomainQuery'
import { executeCollectionDomainQueryPrimary } from '../domainQuery/executeCollectionDomainQueryPrimary'
import { emptyDomainQuery, type DomainQuery } from '../domainQuery/domainQuery'
import { compileResolvedSemanticsToDomainQuery } from '../domainQuery/compileResolvedSemantics'
import { emptyGoalSpec } from './goalSpec'
import { adaptResolvedTaskToGoalSpec } from './adaptResolvedTaskToGoalSpec'
import { bindGoalSpec, makeGoalBinderContext } from './bindGoalSpec'
import { compileBoundGoalToDomainQuery } from './compileBoundGoalToDomainQuery'
import { compareThreeWayViaBinder } from './compareThreeWayViaBinder'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

const TODAY = '2026-09-13'
const AUGUST = resolveAggregateDateRange('sierpień', TODAY)!
const SEPTEMBER = resolveAggregateDateRange('wrzesień', TODAY)!
const YEAR_2027 = { from: '2027-01-01', to: '2027-12-31' }
const YEAR_2028 = { from: '2028-01-01', to: '2028-12-31' }

const ROWS: CollectionMoneyRow[] = [
  {
    id: 'aug-vl',
    displayLabel: 'Aug VL',
    date: '2026-08-10',
    contractValue: 10000,
    paidAmount: 1000,
    remainingAmount: 9000,
    locationHaystack: ['Villa Love'],
    locationByRole: { reception: ['Villa Love'] },
  },
  {
    id: 'aug-hs',
    displayLabel: 'Aug HS',
    date: '2026-08-20',
    contractValue: 7000,
    paidAmount: 7000,
    remainingAmount: 0,
    locationHaystack: ['Hotel Stary'],
    locationByRole: { reception: ['Hotel Stary'] },
  },
  {
    id: 'sep-vl',
    displayLabel: 'Sep VL',
    date: '2026-09-05',
    contractValue: 8000,
    paidAmount: 8000,
    remainingAmount: 0,
    locationHaystack: ['Villa Love'],
    locationByRole: { reception: ['Villa Love'] },
  },
  {
    id: 'vl-2028',
    displayLabel: 'VL 2028',
    date: '2028-04-01',
    contractValue: 15000,
    paidAmount: 500,
    remainingAmount: 14500,
    locationHaystack: ['Villa Love'],
    locationByRole: { reception: ['Villa Love'] },
  },
  {
    id: 'hs-2027',
    displayLabel: 'HS 2027',
    date: '2027-06-01',
    contractValue: 9000,
    paidAmount: 0,
    remainingAmount: 9000,
    locationHaystack: ['Hotel Stary'],
    locationByRole: { reception: ['Hotel Stary'] },
  },
]

function mustResolved(r: ReturnType<typeof resolveTaskSpec>): ResolvedTask {
  assert(r.status === 'resolved', `resolved got ${r.status}`)
  return r as ResolvedTask
}

function dq(partial: Partial<DomainQuery>): DomainQuery {
  return emptyDomainQuery(partial)
}

function villaLove2027(measure: DomainQuery['measure'] = null): DomainQuery {
  return dq({
    aggregate: measure ? 'sum' : 'count',
    measure,
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

function binderCtx(query: DomainQuery | null) {
  return makeGoalBinderContext({ activeCollectionQuery: query })
}

function runBound(goal: ReturnType<typeof emptyGoalSpec>, query: DomainQuery | null) {
  const bound = bindGoalSpec(goal, binderCtx(query))
  assert(bound.status === 'bound', `bound expected, got ${bound.status}`)
  if (bound.status !== 'bound') throw new Error('unreachable')
  const compiled = compileBoundGoalToDomainQuery(bound.goal)
  assert(compiled.status === 'success', `compile: ${compiled.status}`)
  if (compiled.status !== 'success') throw new Error('unreachable')
  return { bound: bound.goal, query: compiled.query }
}

async function primary(resolved: ResolvedTask) {
  return executeCollectionDomainQueryPrimary({
    resolved,
    disableBaseline: true,
    executeDomain: async (q) => {
      const r = executeDomainQueryOnRows(ROWS, q)
      if (!r.ok) throw new Error(r.failure.detail)
      return r
    },
  })
}

function applyPrimaryToShadow(
  resolved: ResolvedTask,
  result: Extract<
    Awaited<ReturnType<typeof executeCollectionDomainQueryPrimary>>,
    { ok: true }
  >['result'],
) {
  stashCollectionQueryExecutionExtrasForTests({
    activeCollection: {
      resource: 'weddings',
      query: result.activeCollection.query,
      filters: result.activeCollection.filters,
      memberIds: result.activeCollection.memberIds,
      resultCount: result.activeCollection.resultCount,
    },
    activeResource: result.activeResource,
  })
  applyAssistantV4ShadowTransition({
    taskSpec: resolved.mergedTaskSpec,
    resolution: resolved,
    capabilityExecution: {
      status: 'success',
      capabilityId: 'collection.query',
      observation: result.observation,
      selectionMs: 0,
      executionMs: 0,
    },
  })
}

function shadowCtx(): V4ShadowContext {
  return mergeShadowOverlay(emptyV4ShadowContext())
}

console.log('G7 GoalSpec Context Binder acceptance')

// --- Gate: no NL / CollectionQuery in binder modules ---
{
  for (const file of [
    'bindGoalSpec.ts',
    'compileBoundGoalToDomainQuery.ts',
    'boundGoal.ts',
    'binderTypes.ts',
    'compareThreeWayViaBinder.ts',
  ]) {
    const src = readFileSync(
      resolve(process.cwd(), `src/features/assistant/v4/goalSpec/${file}`),
      'utf8',
    )
    assert(!/new RegExp|\.match\(\//.test(src), `${file}: no regex`)
    assert(!/Villa Love|przyszł|sierpień/.test(src), `${file}: no phrases`)
    assert(
      !/from ['"].*collectionQuery|CollectionQueryInput|executeCollectionQuery/.test(
        src,
      ),
      `${file}: no CQ import/use`,
    )
    assert(
      !/\bmemberIds\b/.test(src) || file.includes('compare'),
      `${file}: no memberIds`,
    )
  }
  const compileSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/goalSpec/compileBoundGoalToDomainQuery.ts',
    ),
    'utf8',
  )
  assert(!compileSrc.includes('GoalBinderContext'), 'G compiler no binder ctx')
  assert(!compileSrc.includes('activeCollection'), 'G compiler no collection ctx')
  assert(!compileSrc.includes('bindGoalSpec'), 'G compiler no binder')
}

// ========== AUTHORITY A — legacy filters absent ==========
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'list',
  })
  const { query } = runBound(goal, villaLove2027())
  assert(
    query.relations.some((r) => r.value === 'Villa Love'),
    'A place from DQ',
  )
  assert(query.dateBinding?.range.from === YEAR_2027.from, 'A date from DQ')
}

// ========== AUTHORITY B — no CollectionQuery (source gate) ==========
  // CollectionQuery must not appear as an import/runtime dependency
  assert(
    !Object.keys(makeGoalBinderContext({})).includes('collectionQuery'),
    'B no collectionQuery on context',
  )

// ========== AUTHORITY C — memberIds ignored ==========
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'count',
  })
  const bound = bindGoalSpec(goal, binderCtx(villaLove2027()))
  assert(bound.status === 'bound', 'C bound')
  // memberIds not even on binder context type
  const compiled = compileBoundGoalToDomainQuery(
    (bound as { status: 'bound'; goal: import('./boundGoal').BoundGoal }).goal,
  )
  assert(compiled.status === 'success', 'C compile')
  if (compiled.status === 'success') {
    const exec = executeDomainQueryOnRows(ROWS, compiled.query)
    assert(exec.ok && exec.observation.totalCount === 0, 'C semantic 0 not membership')
  }
}

// ========== AUTHORITY D — stale filters N/A (binder has no filters input) ==========
{
  // Prove DomainQuery wins: context only has DQ
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    aggregation: 'count',
    source: 'wedding',
  })
  const { query } = runBound(goal, villaLove2027())
  assert(
    query.relations.some((r) => r.value === 'Villa Love'),
    'D only DQ place',
  )
}

// ========== AUTHORITY E — explicit overrides inherited ==========
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'count',
    temporal: {
      expression: null,
      resolvedRange: YEAR_2028,
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
  })
  const { query } = runBound(goal, villaLove2027())
  assert(query.dateBinding?.range.from === YEAR_2028.from, 'E date replaced')
  assert(
    query.relations.some((r) => r.value === 'Villa Love'),
    'E venue kept',
  )
}

// ========== AUTHORITY F — zero-result inherits ==========
{
  const zeroQ = villaLove2027()
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'list',
  })
  const { query } = runBound(goal, zeroQ)
  assert(query.dateBinding?.range.from === YEAR_2027.from, 'F date')
  assert(
    query.relations.some((r) => r.value === 'Villa Love'),
    'F venue',
  )
  const exec = executeDomainQueryOnRows(ROWS, query)
  assert(exec.ok && exec.observation.totalCount === 0, 'F still zero')
}

// ========== AUTHORITY G — compiler BoundGoal only (source gate) ==========
console.log('  authority G via source gate')

// ========== AUTHORITY H — missing measure → clarification ==========
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'sum',
    measure: null,
  })
  const r = bindGoalSpec(goal, binderCtx(null))
  assert(r.status === 'needs_clarification', 'H clarify')
  if (r.status === 'needs_clarification') {
    assert(r.clarification.missingSlots.includes('measure'), 'H measure slot')
  }
}

// ========== AUTHORITY I — close destroys conversation context ==========
{
  clearAssistantV4ShadowSession()
  const r = mustResolved(
    resolveTaskSpec(
      makeTaskSpec({
        op: 'count',
        subject: 'wedding',
        temporal: { phrase: 'sierpień', kind: 'range' },
      }),
      emptyV4ShadowContext(),
    ),
  )
  const p = await primary(r)
  assert(p.ok, 'I seed')
  if (p.ok) applyPrimaryToShadow(r, p.result)
  assert(shadowCtx().activeCollection?.query != null, 'I has DQ')
  clearAssistantV4ShadowSession()
  assert(shadowCtx().activeCollection == null, 'I cleared')
  const after = bindGoalSpec(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'list',
    }),
    binderCtx(shadowCtx().activeCollection?.query ?? null),
  )
  assert(after.status === 'bound', 'I fresh bind')
  if (after.status === 'bound') {
    assert(after.goal.relations.length === 0, 'I no inherited place')
    assert(after.goal.temporal.resolvedRange == null, 'I no inherited date')
  }
}

console.log('  authority A–I ok')

// ========== THREE-WAY G5/G6/G7 ==========
{
  const cases = [
    mustResolved(
      resolveTaskSpec(
        makeTaskSpec({
          op: 'count',
          subject: 'wedding',
          temporal: { phrase: 'sierpień', kind: 'range' },
        }),
        emptyV4ShadowContext(),
      ),
    ),
    mustResolved(
      resolveTaskSpec(
        makeTaskSpec({
          op: 'sum',
          subject: 'remaining',
          temporal: { phrase: 'sierpień', kind: 'range' },
          qualifiers: {
            aspect: null,
            rank: null,
            destination: null,
            titleHint: 'Villa Love',
            unsupportedReason: null,
          },
        }),
        emptyV4ShadowContext(),
      ),
    ),
    mustResolved(
      resolveTaskSpec(
        makeTaskSpec({
          op: 'list',
          subject: 'wedding',
          qualifiers: {
            aspect: null,
            rank: null,
            destination: 'reception',
            titleHint: 'Hotel Stary',
            unsupportedReason: null,
          },
        }),
        emptyV4ShadowContext(),
      ),
    ),
  ]
  for (const resolved of cases) {
    const cmp = compareThreeWayViaBinder(resolved)
    assert(cmp.agreeAll, `3-way: ${cmp.reasons.join(',')}`)
  }
  console.log('  three-way ok')
}

// ========== CHAIN A — SIMPLE CONTINUATION via Binder ==========
{
  clearAssistantV4ShadowSession()
  const r1 = mustResolved(
    resolveTaskSpec(
      makeTaskSpec({
        op: 'count',
        subject: 'wedding',
        temporal: { phrase: 'sierpień', kind: 'range' },
      }),
      emptyV4ShadowContext(),
    ),
  )
  const p1 = await primary(r1)
  assert(p1.ok && p1.result.observation.totalCount === 2, 'A count')
  if (p1.ok) applyPrimaryToShadow(r1, p1.result)
  let activeQ = shadowCtx().activeCollection?.query ?? null
  assert(activeQ != null, 'A active DQ')

  const listGoal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'list',
    dialogue: 'inherit',
  })
  const list = runBound(listGoal, activeQ)
  assert(list.query.dateBinding?.range.from === AUGUST.from, 'A list date')
  assert(list.query.aggregate === null, 'A list agg')

  // Advance shadow via G5 primary for realism
  const r2 = mustResolved(
    resolveTaskSpec(
      makeTaskSpec({
        op: 'list',
        subject: 'wedding',
        resource: { kind: 'active_collection' },
        fieldSource: {
          op: 'explicit',
          subject: 'omitted',
          resource: 'inherit',
          participant: 'omitted',
          temporal: 'omitted',
        },
      }),
      shadowCtx(),
    ),
  )
  const p2 = await primary(r2)
  if (p2.ok) applyPrimaryToShadow(r2, p2.result)
  activeQ = shadowCtx().activeCollection?.query ?? null

  const sumGoal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'sum',
    measure: 'wedding.remaining_amount',
    dialogue: 'inherit',
  })
  const sum = runBound(sumGoal, activeQ)
  assert(sum.query.dateBinding?.range.from === AUGUST.from, 'A sum date')
  const sumExec = executeDomainQueryOnRows(ROWS, sum.query)
  assert(sumExec.ok && sumExec.observation.amount === 9000, 'A remaining')

  const sepGoal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'list',
    temporal: {
      expression: null,
      resolvedRange: { from: SEPTEMBER.from, to: SEPTEMBER.to },
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
  })
  const sep = runBound(sepGoal, activeQ)
  assert(sep.query.dateBinding?.range.from === SEPTEMBER.from, 'A sep')
  const sepExec = executeDomainQueryOnRows(ROWS, sep.query)
  assert(sepExec.ok && sepExec.observation.totalCount === 1, 'A sep list=1')
  console.log('  chain A ok')
}

// ========== CHAIN B — ZERO RESULT ==========
{
  const active = villaLove2027()
  const list = runBound(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'list',
    }),
    active,
  )
  assert(executeDomainQueryOnRows(ROWS, list.query).ok, 'B list ok')
  assert(
    (executeDomainQueryOnRows(ROWS, list.query) as { ok: true; observation: { totalCount: number } })
      .observation.totalCount === 0,
    'B list []',
  )

  const sum = runBound(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'sum',
      measure: 'wedding.remaining_amount',
    }),
    active,
  )
  const sumExec = executeDomainQueryOnRows(ROWS, sum.query)
  assert(sumExec.ok && sumExec.observation.amount === 0, 'B sum 0')

  const y2028 = runBound(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'count',
      temporal: {
        expression: null,
        resolvedRange: YEAR_2028,
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
    }),
    active,
  )
  assert(
    y2028.query.relations.some((r) => r.value === 'Villa Love'),
    'B venue kept',
  )
  const e2028 = executeDomainQueryOnRows(ROWS, y2028.query)
  assert(e2028.ok && e2028.observation.totalCount === 1, 'B 2028=1')
  console.log('  chain B ok')
}

// ========== CHAIN C — REPLACEMENT ==========
{
  const active = villaLove2027()
  const venueB = runBound(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'count',
      relations: [
        {
          relation: 'place',
          field: 'place.name',
          op: 'contains',
          value: { text: 'Hotel Stary', kindHint: 'venue' },
        },
      ],
    }),
    active,
  )
  assert(
    venueB.query.relations.some((r) => r.value === 'Hotel Stary'),
    'C venue B',
  )
  assert(venueB.query.dateBinding?.range.from === YEAR_2027.from, 'C year kept')
  assert(
    !venueB.query.relations.some((r) => r.value === 'Villa Love'),
    'C no venue A',
  )

  const yearY = runBound(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'count',
      temporal: {
        expression: null,
        resolvedRange: YEAR_2028,
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
    }),
    venueB.query,
  )
  assert(
    yearY.query.relations.some((r) => r.value === 'Hotel Stary'),
    'C venue B kept',
  )
  assert(yearY.query.dateBinding?.range.from === YEAR_2028.from, 'C 2028')
  console.log('  chain C ok')
}

// ========== CHAIN D — MEASURE ==========
{
  const active = dq({
    aggregate: 'count',
    measure: null,
    dateBinding: { dimension: 'wedding.date', range: { from: AUGUST.from, to: AUGUST.to } },
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: 'Villa Love',
      },
    ],
  })
  for (const [measure, expected] of [
    ['wedding.contract_value', 10000],
    ['wedding.paid_amount', 1000],
    ['wedding.remaining_amount', 9000],
  ] as const) {
    const { query } = runBound(
      emptyGoalSpec({
        requestKind: 'domain_query',
        source: 'wedding',
        aggregation: 'sum',
        measure,
      }),
      active,
    )
    assert(query.dateBinding?.range.from === AUGUST.from, `D ${measure} date`)
    assert(
      query.relations.some((r) => r.value === 'Villa Love'),
      `D ${measure} venue`,
    )
    const exec = executeDomainQueryOnRows(ROWS, query)
    assert(exec.ok && exec.observation.amount === expected, `D ${measure}`)
  }
  console.log('  chain D ok')
}

// ========== CHAIN E — CLARIFICATION ==========
{
  const r = bindGoalSpec(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'sum',
      measure: null,
    }),
    binderCtx(null),
  )
  assert(r.status === 'needs_clarification', 'E clarify')
  if (r.status === 'needs_clarification') {
    assert(r.clarification.missingSlots.includes('measure'), 'E measure')
    assert((r.clarification.choices?.length ?? 0) >= 1, 'E choices')
  }

  const dim = bindGoalSpec(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'sum',
      measure: 'wedding.remaining_amount',
      temporal: {
        expression: 'w przyszłym tygodniu',
        resolvedRange: null,
        dateDimension: null,
        dateDimensionAmbiguous: true,
      },
    }),
    binderCtx(null),
  )
  assert(dim.status === 'needs_clarification', 'E date dim')
  if (dim.status === 'needs_clarification') {
    assert(
      dim.clarification.ambiguousSlots.includes('date_dimension'),
      'E date_dimension slot',
    )
  }
  console.log('  chain E ok')
}

// ========== CHAIN F — RESET ==========
{
  clearAssistantV4ShadowSession()
  assert(shadowCtx().activeCollection == null, 'F empty')
  console.log('  chain F ok')
}

// Equivalence: binder continuation matches G5 resolve path
{
  const resolved = mustResolved(
    resolveTaskSpec(
      makeTaskSpec({
        op: 'sum',
        subject: 'remaining',
        resource: { kind: 'active_collection' },
        fieldSource: {
          op: 'explicit',
          subject: 'explicit',
          resource: 'inherit',
          participant: 'omitted',
          temporal: 'omitted',
        },
      }),
      {
        ...emptyV4ShadowContext(),
        activeCollection: {
          resource: 'weddings',
          query: villaLove2027(),
          resultCount: 0,
        },
      },
    ),
  )
  const g5 = compileResolvedSemanticsToDomainQuery(resolved)
  const goal = adaptResolvedTaskToGoalSpec(resolved)
  // Binder with same active DQ (filters absent on context)
  const bound = bindGoalSpec(goal, binderCtx(villaLove2027()))
  assert(g5.status === 'success' && bound.status === 'bound', 'equiv statuses')
  if (g5.status === 'success' && bound.status === 'bound') {
    const g7 = compileBoundGoalToDomainQuery(bound.goal)
    assert(g7.status === 'success', 'equiv g7')
    if (g7.status === 'success') {
      assert(g5.query.measure === g7.query.measure, 'equiv measure')
      assert(
        g5.query.dateBinding?.range.from === g7.query.dateBinding?.range.from,
        'equiv date',
      )
      assert(
        JSON.stringify(g5.query.relations) === JSON.stringify(g7.query.relations),
        'equiv relations',
      )
    }
  }
}

// G8.2 — Aggregation inheritance from active DomainQuery (typed deltas only)
{
  console.log('  G8.2 aggregation inheritance')

  // Pure temporal delta: inherit count (even when prior resultCount=0)
  {
    const active = emptyDomainQuery({
      aggregate: 'count',
      relations: [
        {
          relation: 'place',
          field: 'place.name',
          op: 'contains',
          value: 'Villa Love',
        },
      ],
      dateBinding: {
        dimension: 'wedding.date',
        range: YEAR_2027,
      },
    })
    const goal = emptyGoalSpec({
      requestKind: 'domain_query',
      dialogue: 'inherit',
      source: 'wedding',
      aggregation: null,
      measure: null,
      temporal: {
        expression: '2028',
        resolvedRange: YEAR_2028,
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
      inheritance: { fromActiveCollection: true, fromPrevious: true },
    })
    const bound = bindGoalSpec(goal, binderCtx(active))
    assert(bound.status === 'bound', 'delta year binds')
    if (bound.status === 'bound') {
      assert(bound.goal.aggregation === 'count', 'inherits count')
      assert(
        bound.goal.relations.some((r) => r.value === 'Villa Love'),
        'inherits place',
      )
      assert(bound.goal.temporal.resolvedRange?.from === '2028-01-01', 'year 2028')
      const compiled = compileBoundGoalToDomainQuery(bound.goal)
      assert(compiled.status === 'success', 'delta year compiles')
    }
  }

  // Explicit list replaces inherited count
  {
    const active = emptyDomainQuery({
      aggregate: 'count',
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
      source: 'wedding',
      aggregation: 'list',
      inheritance: { fromActiveCollection: true, fromPrevious: true },
    })
    const bound = bindGoalSpec(goal, binderCtx(active))
    assert(bound.status === 'bound', 'list delta binds')
    if (bound.status === 'bound') {
      assert(bound.goal.aggregation === 'list', 'explicit list wins')
    }
  }

  // DomainQuery aggregate=null → list inheritance
  {
    const active = emptyDomainQuery({
      aggregate: null,
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
      source: 'wedding',
      aggregation: null,
      inheritance: { fromActiveCollection: true, fromPrevious: true },
    })
    const bound = bindGoalSpec(goal, binderCtx(active))
    assert(bound.status === 'bound', 'list-active binds')
    if (bound.status === 'bound') {
      assert(bound.goal.aggregation === 'list', 'null DQ aggregate → list')
    }
  }

  // measure set + aggregation null → DO NOT inherit count / infer sum
  {
    const active = emptyDomainQuery({
      aggregate: 'count',
      dateBinding: {
        dimension: 'wedding.date',
        range: AUGUST,
      },
    })
    const goal = emptyGoalSpec({
      requestKind: 'domain_query',
      dialogue: 'inherit',
      source: 'wedding',
      aggregation: null,
      measure: 'wedding.remaining_amount',
      inheritance: { fromActiveCollection: true, fromPrevious: true },
    })
    const bound = bindGoalSpec(goal, binderCtx(active))
    assert(bound.status === 'needs_clarification', 'measure without agg clarifies')
    if (bound.status === 'needs_clarification') {
      assert(
        bound.clarification.missingSlots.includes('aggregation'),
        'asks for aggregation',
      )
    }
  }

  // Correction place delta: inherit count + year
  {
    const active = villaLove2027()
    const goal = emptyGoalSpec({
      requestKind: 'domain_query',
      dialogue: 'correct',
      source: 'wedding',
      aggregation: null,
      relations: [
        {
          relation: 'place',
          field: 'place.name',
          op: 'contains',
          value: 'Hotel Stary',
        },
      ],
      correction: { targetSlot: 'place', patch: {} },
      inheritance: { fromActiveCollection: true, fromPrevious: true },
    })
    const bound = bindGoalSpec(goal, binderCtx(active))
    assert(bound.status === 'bound', 'correction binds')
    if (bound.status === 'bound') {
      assert(bound.goal.aggregation === 'count', 'correction inherits count')
      assert(
        bound.goal.temporal.resolvedRange?.from === '2027-01-01',
        'correction keeps year',
      )
      assert(
        bound.goal.relations.some((r) => r.value === 'Hotel Stary'),
        'correction place B',
      )
    }
  }
}

console.log('G7 GoalSpec Context Binder acceptance: PASS')
