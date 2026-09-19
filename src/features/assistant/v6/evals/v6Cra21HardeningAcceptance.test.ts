/**
 * V6-CRA2.1 — Targeted temporal / ranking / LIST_RELATED hardening acceptance.
 */
import assert from 'node:assert/strict'
import { mapNativeQueryArgs } from '../agent/mapNativeToolArgs'
import { checkTurnPlanCapability } from '../capability/checkTurnPlanCapability'
import { parseTurnPlanWire } from '../turnPlan/parse'
import { V6_AGENT_SYSTEM_PROMPT } from '../agent/prompt'
import { V6_CAPABILITY_REGISTRY_TEXT } from '../agent/requestedOperations'

const nullBag = {
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

function searchWire(temporal: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    source: 'wedding',
    filters: null,
    concept_filters: null,
    exclude_place: null,
    temporal,
    sort: null,
    slice: null,
    ...extra,
  }
}

function emptyStepBag(overrides: Record<string, unknown>) {
  return {
    id: 's1',
    kind: 'SEARCH_COLLECTION',
    input_from_step: null,
    input_handle: null,
    search: null,
    transform_ops: null,
    aggregation: null,
    measure: null,
    detail_selector: null,
    inspect_concepts: null,
    relation: null,
    relation_limit: null,
    ...overrides,
  }
}

// ---- TEMPORAL ----
{
  const ok = mapNativeQueryArgs(
    searchWire({
      kind: 'closed_calendar_month',
      ...nullBag,
      year: 2026,
      month: 10,
    }),
  )
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.deepEqual(ok.value.relativeTemporal, {
      kind: 'closed_calendar_month',
      year: 2026,
      month: 10,
    })
  }
}

{
  const ok = mapNativeQueryArgs(
    searchWire({
      kind: 'closed_calendar_month',
      ...nullBag,
      year: 2027,
      month: 3,
    }),
  )
  assert.equal(ok.ok, true)
}

{
  const badMonth = mapNativeQueryArgs(
    searchWire({
      kind: 'closed_calendar_month',
      ...nullBag,
      year: 2026,
      month: null,
    }),
  )
  assert.equal(badMonth.ok, false)
  if (!badMonth.ok) {
    assert.match(badMonth.detail, /closed_calendar_month_month_required/)
  }
}

{
  const yearOnly = mapNativeQueryArgs(
    searchWire({
      kind: 'closed_calendar_year',
      ...nullBag,
      year: 2026,
    }),
  )
  assert.equal(yearOnly.ok, true)
  if (yearOnly.ok) {
    assert.deepEqual(yearOnly.value.relativeTemporal, {
      kind: 'closed_calendar_year',
      year: 2026,
    })
  }
}

assert.match(V6_AGENT_SYSTEM_PROMPT, /closed_calendar_month/)
assert.match(V6_CAPABILITY_REGISTRY_TEXT, /ALWAYS requires temporal\.year AND temporal\.month/)

// ---- RANKING composition guidance (prompt contract) ----
assert.match(V6_CAPABILITY_REGISTRY_TEXT, /member ranking via Sort/)
assert.match(V6_AGENT_SYSTEM_PROMPT, /Highest\/lowest by a sortable concept/)
assert.match(V6_CAPABILITY_REGISTRY_TEXT, /AGGREGATE only/)
assert.doesNotMatch(
  V6_CAPABILITY_REGISTRY_TEXT,
  /rank \/ top-N ranking across groups/,
)

{
  const ranked = mapNativeQueryArgs(
    searchWire(
      {
        kind: 'future_from_now',
        ...nullBag,
        inclusive: true,
      },
      {
        sort: { field: 'FIN.REMAINING_TO_PAY', direction: 'desc' },
        slice: { limit: 1, offset: null },
      },
    ),
  )
  assert.equal(ranked.ok, true)
  if (ranked.ok) {
    assert.equal(ranked.value.sort?.field, 'FIN.REMAINING_TO_PAY')
    assert.equal(ranked.value.sort?.direction, 'desc')
    assert.equal(ranked.value.slice?.limit, 1)
  }
}

{
  const lowest = mapNativeQueryArgs(
    searchWire(null, {
      sort: { field: 'FIN.REMAINING_TO_PAY', direction: 'asc' },
      slice: { limit: 1, offset: null },
    }),
  )
  assert.equal(lowest.ok, true)
}

{
  const top3 = mapNativeQueryArgs(
    searchWire(null, {
      sort: { field: 'FIN.CONTRACT_VALUE', direction: 'desc' },
      slice: { limit: 3, offset: null },
    }),
  )
  assert.equal(top3.ok, true)
  if (top3.ok) assert.equal(top3.value.slice?.limit, 3)
}

{
  // Pure aggregate plan: no sort/slice on search — structural example
  const wire = {
    steps: [
      emptyStepBag({
        id: 'set',
        kind: 'SEARCH_COLLECTION',
        search: searchWire({
          kind: 'future_from_now',
          ...nullBag,
          inclusive: true,
        }),
      }),
      emptyStepBag({
        id: 'agg',
        kind: 'AGGREGATE_COLLECTION',
        input_from_step: 'set',
        aggregation: 'sum',
        measure: 'FIN.REMAINING_TO_PAY',
      }),
    ],
    output: {
      kind: 'AGGREGATE',
      from_step: 'agg',
      reason: null,
      slot: null,
      text: null,
    },
  }
  const parsed = parseTurnPlanWire(wire)
  assert.equal(parsed.ok, true)
  if (parsed.ok) {
    const search = parsed.plan.steps[0]
    assert.equal(search?.kind, 'SEARCH_COLLECTION')
    if (search?.kind === 'SEARCH_COLLECTION') {
      assert.equal(search.search.sort, null)
      assert.equal(search.search.slice, null)
    }
    assert.equal(checkTurnPlanCapability(parsed.plan).verdict, 'SUPPORTED')
  }
}

// ---- LIST_RELATED requiredness + inspect vs list ----
{
  const inspectName = parseTurnPlanWire({
    steps: [
      emptyStepBag({
        id: 'd',
        kind: 'INSPECT_RESOURCE',
        input_handle: 'col_1',
        inspect_concepts: ['PKG.NAME'],
      }),
    ],
    output: {
      kind: 'DETAIL',
      from_step: 'd',
      reason: null,
      slot: null,
      text: null,
    },
  })
  assert.equal(inspectName.ok, true)
  if (inspectName.ok) {
    assert.equal(checkTurnPlanCapability(inspectName.plan).verdict, 'SUPPORTED')
  }
}

{
  const items = parseTurnPlanWire({
    steps: [
      emptyStepBag({
        id: 'd',
        kind: 'LIST_RELATED',
        input_handle: 'col_1',
        relation: 'PACKAGE_ITEMS',
      }),
    ],
    output: {
      kind: 'DETAIL',
      from_step: 'd',
      reason: null,
      slot: null,
      text: null,
    },
  })
  assert.equal(items.ok, true)
}

{
  const extras = parseTurnPlanWire({
    steps: [
      emptyStepBag({
        id: 'd',
        kind: 'LIST_RELATED',
        input_handle: 'col_1',
        relation: 'EXTRAS',
      }),
    ],
    output: {
      kind: 'DETAIL',
      from_step: 'd',
      reason: null,
      slot: null,
      text: null,
    },
  })
  assert.equal(extras.ok, true)
}

{
  const payments = parseTurnPlanWire({
    steps: [
      emptyStepBag({
        id: 'd',
        kind: 'LIST_RELATED',
        input_handle: 'col_1',
        relation: 'PAYMENTS',
      }),
    ],
    output: {
      kind: 'DETAIL',
      from_step: 'd',
      reason: null,
      slot: null,
      text: null,
    },
  })
  assert.equal(payments.ok, true)
}

{
  const missingRelation = parseTurnPlanWire({
    steps: [
      emptyStepBag({
        id: 'd',
        kind: 'LIST_RELATED',
        input_handle: 'col_1',
        relation: null,
      }),
    ],
    output: {
      kind: 'DETAIL',
      from_step: 'd',
      reason: null,
      slot: null,
      text: null,
    },
  })
  assert.equal(missingRelation.ok, false)
  if (!missingRelation.ok) {
    assert.match(missingRelation.detail, /relation_required/)
  }
}

{
  const unknownRelation = checkTurnPlanCapability({
    steps: [
      {
        id: 'd',
        kind: 'LIST_RELATED',
        inputFromStep: null,
        inputHandle: 'col_1',
        relation: 'NOT_A_RELATION',
        limit: null,
      },
    ],
    output: { kind: 'DETAIL', fromStep: 'd' },
  })
  assert.equal(unknownRelation.verdict, 'UNSUPPORTED')
  assert.equal(unknownRelation.code, 'unsupported_relation')
}

assert.match(V6_CAPABILITY_REGISTRY_TEXT, /Never choose LIST_RELATED for an inspect-only scalar/)
assert.match(V6_CAPABILITY_REGISTRY_TEXT, /PKG\.NAME/)

console.log('v6Cra21HardeningAcceptance PASS')
