/**
 * V6-F1.4 — Deterministic TurnPlan unit acceptance (no live Luna).
 */

import assert from 'node:assert/strict'
import type { CollectionMoneyRow } from '../../v4/capabilities/collection/executeCollectionQuery'
import {
  destroyV6CollectionSession,
  v6CollectionStore,
} from '../collections/store'
import {
  executeTurnPlan,
  parseTurnPlanWire,
  plannedOpClassesFromPlan,
  validateTurnPlan,
  checkPlanCompleteness,
} from '../turnPlan'
import type { V6TurnPlan } from '../turnPlan/types'

function row(
  id: string,
  date: string,
  place: string,
  cv: number,
  paid: number,
): CollectionMoneyRow {
  return {
    id,
    displayLabel: id,
    date,
    contractValue: cv,
    paidAmount: paid,
    remainingAmount: Math.max(0, cv - paid),
    locationHaystack: [place],
    locationByRole: {
      reception: [place],
      ceremony: [place],
      preparations: [place],
    },
  }
}

const UNIVERSE: CollectionMoneyRow[] = [
  row('W1', '2026-10-01', 'Villa Love', 12000, 3000),
  row('W2', '2026-11-15', 'Hotel X', 8000, 0),
  row('W3', '2026-12-20', 'Villa Love', 15000, 5000),
  row('W4', '2027-01-10', 'Villa Love', 9000, 1000),
  row('W5', '2027-03-01', 'Barn Y', 11000, 0),
]

function weddings() {
  return UNIVERSE.map((r) => ({
    id: r.id,
    price: r.contractValue,
    payments: [
      {
        id: `p_${r.id}`,
        label: 'p',
        amount: r.paidAmount,
        paid: r.paidAmount > 0,
        type: 'other' as const,
        paidAt: r.paidAmount > 0 ? '2026-01-01' : undefined,
      },
    ],
  }))
}

const nullTemporal = {
  kind: 'future_from_now',
  inclusive: true,
  year: null,
  month: null,
  from_kind: null,
  from_date: null,
  from_year: null,
  from_month: null,
  to_kind: null,
  to_date: null,
  to_year: null,
  to_month: null,
}

const year2027 = {
  kind: 'closed_calendar_year',
  inclusive: null,
  year: 2027,
  month: null,
  from_kind: null,
  from_date: null,
  from_year: null,
  from_month: null,
  to_kind: null,
  to_date: null,
  to_year: null,
  to_month: null,
}

async function runPlan(wire: unknown) {
  destroyV6CollectionSession()
  const parsed = parseTurnPlanWire(wire)
  assert.equal(parsed.ok, true, JSON.stringify(parsed))
  if (!parsed.ok) throw new Error('parse')
  const v = validateTurnPlan(parsed.plan)
  assert.equal(v.ok, true, JSON.stringify(v))
  return executeTurnPlan({
    plan: parsed.plan,
    turnId: 't_unit',
    todayKey: '2026-09-14',
    universeRows: UNIVERSE,
    weddings: weddings(),
  })
}

// --- search ---
{
  const r = await runPlan({
    steps: [
      {
        id: 's1',
        kind: 'SEARCH_COLLECTION',
        input_from_step: null,
        input_handle: null,
        search: {
          source: 'wedding',
          filters: null,
          exclude_place: null,
          temporal: nullTemporal,
          sort: { field: 'wedding.date', direction: 'asc' },
          slice: { limit: 3, offset: null },
        },
        transform_ops: null,
        aggregation: null,
        measure: null,
      },
    ],
    output: {
      kind: 'COLLECTION',
      from_step: 's1',
      reason: null,
      slot: null,
      text: null,
    },
  })
  assert.equal(r.completeness.ok, true)
  assert.equal(r.executed.length, 1)
  assert.ok(r.executed[0]!.ok)
  console.log('  OK search')
}

// --- search + temporal ---
{
  const r = await runPlan({
    steps: [
      {
        id: 's1',
        kind: 'SEARCH_COLLECTION',
        input_from_step: null,
        input_handle: null,
        search: {
          source: 'wedding',
          filters: null,
          exclude_place: null,
          temporal: year2027,
          sort: null,
          slice: null,
        },
        transform_ops: null,
        aggregation: null,
        measure: null,
      },
    ],
    output: {
      kind: 'COLLECTION',
      from_step: 's1',
      reason: null,
      slot: null,
      text: null,
    },
  })
  assert.equal(r.completeness.ok, true)
  assert.ok(plannedOpClassesFromPlan(r.plan).includes('Temporal'))
  console.log('  OK search + temporal')
}

// --- search + sort + slice ---
{
  const r = await runPlan({
    steps: [
      {
        id: 's1',
        kind: 'SEARCH_COLLECTION',
        input_from_step: null,
        input_handle: null,
        search: {
          source: 'wedding',
          filters: null,
          exclude_place: null,
          temporal: nullTemporal,
          sort: { field: 'wedding.date', direction: 'asc' },
          slice: { limit: 3, offset: 0 },
        },
        transform_ops: null,
        aggregation: null,
        measure: null,
      },
    ],
    output: {
      kind: 'COLLECTION',
      from_step: 's1',
      reason: null,
      slot: null,
      text: null,
    },
  })
  const ops = plannedOpClassesFromPlan(r.plan)
  assert.ok(ops.includes('Sort') && ops.includes('Slice'))
  console.log('  OK search + sort + slice')
}

// --- search + exclude ---
{
  const r = await runPlan({
    steps: [
      {
        id: 's1',
        kind: 'SEARCH_COLLECTION',
        input_from_step: null,
        input_handle: null,
        search: {
          source: 'wedding',
          filters: null,
          exclude_place: {
            field: 'place.name',
            op: 'contains',
            value: 'Villa Love',
            role: null,
          },
          temporal: nullTemporal,
          sort: null,
          slice: null,
        },
        transform_ops: null,
        aggregation: null,
        measure: null,
      },
    ],
    output: {
      kind: 'COLLECTION',
      from_step: 's1',
      reason: null,
      slot: null,
      text: null,
    },
  })
  assert.ok(plannedOpClassesFromPlan(r.plan).includes('Exclude'))
  assert.equal(r.completeness.ok, true)
  console.log('  OK search + exclude')
}

// --- search + aggregate count ---
{
  const r = await runPlan({
    steps: [
      {
        id: 's1',
        kind: 'SEARCH_COLLECTION',
        input_from_step: null,
        input_handle: null,
        search: {
          source: 'wedding',
          filters: null,
          exclude_place: null,
          temporal: year2027,
          sort: null,
          slice: null,
        },
        transform_ops: null,
        aggregation: null,
        measure: null,
      },
      {
        id: 's2',
        kind: 'AGGREGATE_COLLECTION',
        input_from_step: 's1',
        input_handle: null,
        search: null,
        transform_ops: null,
        aggregation: 'count',
        measure: null,
      },
    ],
    output: {
      kind: 'AGGREGATE',
      from_step: 's2',
      reason: null,
      slot: null,
      text: null,
    },
  })
  assert.equal(r.completeness.ok, true)
  assert.equal(r.aggregateByStepId.s2?.kind, 'count_result')
  console.log('  OK search + aggregate count')
}

// --- composition: temporal + exclude + sort + slice + aggregate ---
{
  const r = await runPlan({
    steps: [
      {
        id: 's1',
        kind: 'SEARCH_COLLECTION',
        input_from_step: null,
        input_handle: null,
        search: {
          source: 'wedding',
          filters: null,
          exclude_place: {
            field: 'place.name',
            op: 'contains',
            value: 'Villa Love',
            role: null,
          },
          temporal: year2027,
          sort: { field: 'wedding.date', direction: 'asc' },
          slice: { limit: 5, offset: null },
        },
        transform_ops: null,
        aggregation: null,
        measure: null,
      },
      {
        id: 's2',
        kind: 'AGGREGATE_COLLECTION',
        input_from_step: 's1',
        input_handle: null,
        search: null,
        transform_ops: null,
        aggregation: 'sum',
        measure: 'remaining_amount',
      },
    ],
    output: {
      kind: 'AGGREGATE',
      from_step: 's2',
      reason: null,
      slot: null,
      text: null,
    },
  })
  assert.equal(r.completeness.ok, true)
  assert.equal(r.aggregateByStepId.s2?.kind, 'money_aggregate')
  console.log('  OK full composition + finance aggregate')
}

// --- refine existing collection ---
{
  destroyV6CollectionSession()
  const seed = await executeTurnPlan({
    plan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: {
            type: 'Search',
            source: 'wedding',
            relativeTemporal: { kind: 'future_from_now', inclusive: true },
            sort: { field: 'wedding.date', direction: 'asc' },
            slice: { limit: 3, offset: 0 },
          },
        },
      ],
      output: { kind: 'COLLECTION', fromStep: 's1' },
    },
    turnId: 'seed',
    todayKey: '2026-09-14',
    universeRows: UNIVERSE,
  })
  const handle = seed.stepHandleById.s1!
  const r = await executeTurnPlan({
    plan: {
      steps: [
        {
          id: 't1',
          kind: 'TRANSFORM_COLLECTION',
          inputFromStep: null,
          inputHandle: handle,
          ops: [
            {
              op: 'Filter',
              place: {
                field: 'place.name',
                op: 'contains',
                value: 'Villa Love',
              },
            },
          ],
        },
      ],
      output: { kind: 'COLLECTION', fromStep: 't1' },
    },
    turnId: 'refine',
    todayKey: '2026-09-14',
    universeRows: UNIVERSE,
  })
  assert.equal(r.completeness.ok, true)
  const parent = v6CollectionStore.get(handle)!
  const child = v6CollectionStore.get(r.stepHandleById.t1!)!
  assert.ok(
    child.snapshotMemberIds.every((id) => parent.snapshotMemberIds.includes(id)),
  )
  console.log('  OK refine existing collection + subset')
}

// --- restore ---
{
  destroyV6CollectionSession()
  const seed = await executeTurnPlan({
    plan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: {
            type: 'Search',
            source: 'wedding',
            relativeTemporal: { kind: 'future_from_now', inclusive: true },
            sort: { field: 'wedding.date', direction: 'asc' },
            slice: { limit: 3 },
          },
        },
        {
          id: 't1',
          kind: 'TRANSFORM_COLLECTION',
          inputFromStep: 's1',
          inputHandle: null,
          ops: [
            {
              op: 'Filter',
              place: {
                field: 'place.name',
                op: 'contains',
                value: 'Villa Love',
              },
            },
          ],
        },
      ],
      output: { kind: 'COLLECTION', fromStep: 't1' },
    },
    turnId: 'seed2',
    todayKey: '2026-09-14',
    universeRows: UNIVERSE,
  })
  const root = seed.stepHandleById.s1!
  const r = await executeTurnPlan({
    plan: {
      steps: [
        {
          id: 'r1',
          kind: 'RESTORE_COLLECTION',
          inputHandle: root,
        },
      ],
      output: { kind: 'COLLECTION', fromStep: 'r1' },
    },
    turnId: 'restore',
    todayKey: '2026-09-14',
    universeRows: UNIVERSE,
  })
  assert.equal(r.completeness.ok, true)
  assert.equal(v6CollectionStore.getActive()?.handle, root)
  console.log('  OK restore')
}

// --- zero-result ---
{
  const r = await runPlan({
    steps: [
      {
        id: 's1',
        kind: 'SEARCH_COLLECTION',
        input_from_step: null,
        input_handle: null,
        search: {
          source: 'wedding',
          filters: null,
          exclude_place: null,
          temporal: {
            kind: 'closed_calendar_year',
            inclusive: null,
            year: 2035,
            month: null,
            from_kind: null,
            from_date: null,
            from_year: null,
            from_month: null,
            to_kind: null,
            to_date: null,
            to_year: null,
            to_month: null,
          },
          sort: null,
          slice: null,
        },
        transform_ops: null,
        aggregation: null,
        measure: null,
      },
    ],
    output: {
      kind: 'COLLECTION',
      from_step: 's1',
      reason: null,
      slot: null,
      text: null,
    },
  })
  assert.equal(r.completeness.ok, true)
  assert.equal(
    (r.executed[0]!.observation as { totalCount: number }).totalCount,
    0,
  )
  console.log('  OK zero-result')
}

// --- unsupported output (no execution) ---
{
  const parsed = parseTurnPlanWire({
    steps: [],
    output: {
      kind: 'UNSUPPORTED',
      from_step: null,
      reason: 'group_analytics_not_supported',
      slot: null,
      text: null,
    },
  })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) throw new Error('x')
  assert.equal(validateTurnPlan(parsed.plan).ok, true)
  const r = await executeTurnPlan({
    plan: parsed.plan,
    turnId: 'u',
  })
  assert.equal(r.executed.length, 0)
  assert.equal(r.completeness.ok, true)
  console.log('  OK unsupported rejection (no business execution)')
}

// --- invalid dependency ---
{
  const parsed = parseTurnPlanWire({
    steps: [
      {
        id: 's2',
        kind: 'AGGREGATE_COLLECTION',
        input_from_step: 's1',
        input_handle: null,
        search: null,
        transform_ops: null,
        aggregation: 'count',
        measure: null,
      },
    ],
    output: {
      kind: 'AGGREGATE',
      from_step: 's2',
      reason: null,
      slot: null,
      text: null,
    },
  })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) throw new Error('x')
  const v = validateTurnPlan(parsed.plan)
  assert.equal(v.ok, false)
  console.log('  OK invalid dependency rejection')
}

// --- aggregate finalization without observation rejected ---
{
  const plan: V6TurnPlan = {
    steps: [
      {
        id: 's1',
        kind: 'SEARCH_COLLECTION',
        search: {
          type: 'Search',
          source: 'wedding',
          relativeTemporal: { kind: 'closed_calendar_year', year: 2027 },
        },
      },
      {
        id: 's2',
        kind: 'AGGREGATE_COLLECTION',
        inputFromStep: 's1',
        inputHandle: null,
        aggregation: 'count',
        measure: null,
      },
    ],
    output: { kind: 'AGGREGATE', fromStep: 's2' },
  }
  // Simulate search executed but aggregate skipped — totalCount must NOT authorize
  destroyV6CollectionSession()
  const partial = await executeTurnPlan({
    plan: {
      steps: [plan.steps[0]!],
      output: { kind: 'COLLECTION', fromStep: 's1' },
    },
    turnId: 'partial',
    todayKey: '2026-09-14',
    universeRows: UNIVERSE,
  })
  const fakeExecuted = [
    ...partial.executed,
    // pretend aggregate step missing
  ]
  const blocked = checkPlanCompleteness({
    plan,
    executed: fakeExecuted,
    aggregateByStepId: {},
  })
  assert.equal(blocked.ok, false)
  if (!blocked.ok) {
    assert.ok(
      blocked.code === 'PLAN_INCOMPLETE' ||
        blocked.code === 'MISSING_AGGREGATE_OBSERVATION',
    )
  }
  // Also: collection_result alone cannot authorize AGGREGATE output
  const blocked2 = checkPlanCompleteness({
    plan,
    executed: [
      {
        ...partial.executed[0]!,
        stepId: 's2',
        kind: 'AGGREGATE_COLLECTION',
        toolName: 'aggregate_collection',
        toolArgs: {},
        // observation is still collection_result — must fail
        observation: partial.executed[0]!.observation,
      },
    ],
    aggregateByStepId: {},
  })
  assert.equal(blocked2.ok, false)
  console.log('  OK aggregate finalization without AggregateObservation rejected')
}

destroyV6CollectionSession()
console.log('v6TurnPlanAcceptance PASS')
