/**
 * V6-F1.2 — Native tool arg mapping acceptance (no live Luna).
 */

import assert from 'node:assert/strict'
import {
  mapNativeAggregateArgs,
  mapNativeQueryArgs,
  mapNativeTransformArgs,
  assertNoInventedVocabulary,
} from '../agent/mapNativeToolArgs'
import { V6_NATIVE_OPENAI_TOOLS } from '../agent/nativeTools'

assert.equal(V6_NATIVE_OPENAI_TOOLS.length, 4)
assert.ok(
  !V6_NATIVE_OPENAI_TOOLS.some(
    (t) =>
      (t as { function?: { name?: string } }).function?.name === 'complete_turn',
  ),
)
console.log('  OK native tool count (no complete_turn)')

const q = mapNativeQueryArgs({
  source: 'wedding',
  filters: null,
  exclude_place: null,
  temporal: {
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
  },
  sort: { field: 'wedding.date', direction: 'asc' },
  slice: { limit: 3, offset: null },
})
assert.equal(q.ok, true)
if (q.ok) {
  assert.equal(q.value.relativeTemporal?.kind, 'future_from_now')
  assert.equal(q.value.slice?.limit, 3)
}
console.log('  OK map query_collection')

const t = mapNativeTransformArgs({
  parent_handle: 'col_1',
  ops: [
    {
      op: 'Filter',
      place: {
        field: 'place.name',
        op: 'contains',
        value: 'Villa Love',
        role: null,
      },
      temporal: null,
      sort: null,
      slice: null,
      exclude: null,
    },
  ],
})
assert.equal(t.ok, true)
console.log('  OK map transform_collection')

const monthRefine = mapNativeTransformArgs({
  parent_handle: 'col_1',
  ops: [
    {
      op: 'RelativeTemporal',
      place: null,
      temporal: {
        kind: 'closed_calendar_month',
        inclusive: null,
        year: 2027,
        month: 6,
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
      exclude: null,
    },
  ],
})
assert.equal(monthRefine.ok, true)
if (monthRefine.ok) {
  assert.equal(monthRefine.value.ops[0]?.op, 'RelativeTemporal')
}
console.log('  OK month refine via RelativeTemporal (not place Filter)')

const placeFilterNoPlace = mapNativeTransformArgs({
  parent_handle: 'col_1',
  ops: [
    {
      op: 'Filter',
      place: null,
      temporal: {
        kind: 'closed_calendar_month',
        inclusive: null,
        year: 2027,
        month: 6,
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
      exclude: null,
    },
  ],
})
assert.equal(placeFilterNoPlace.ok, false)
console.log('  OK Filter without place rejected (month must use RelativeTemporal)')

const a = mapNativeAggregateArgs({
  collection: 'col_1',
  aggregation: 'sum',
  measure: 'remaining_amount',
})
assert.equal(a.ok, true)
console.log('  OK map aggregate_collection')

const invented = assertNoInventedVocabulary({ metric: 'x', collection: 'c' })
assert.ok(invented)
console.log('  OK reject invented metric key')

const offset = assertNoInventedVocabulary({
  temporal: { kind: 'closed_calendar_year', offset: 1 },
})
assert.ok(offset)
console.log('  OK reject temporal.offset')

console.log('v6NativeToolsMappingAcceptance PASS')
