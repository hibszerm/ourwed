/**
 * V6-F1 — Structural foundation acceptance (deterministic, no live Luna).
 * Proves Flow A, zero-result identity, complex composition, invariants.
 */

import assert from 'node:assert/strict'
import { destroyV6CollectionSession, v6CollectionStore } from '../collections/store'
import { assertSnapshotSubset } from '../collections/store'
import { resolveRelativeTemporal, dateMatchesBound } from '../semantics/temporal'
import type { CollectionMoneyRow } from '../../v4/capabilities/collection/executeCollectionQuery'
import { queryCollection } from '../tools/queryCollection'
import { transformCollection } from '../tools/transformCollection'
import { aggregateCollection } from '../tools/aggregateCollection'
import { restoreCollection } from '../tools/restoreCollection'
import { decideV6Authority } from '../authority/decide'
import { tryCompileSearchToDomainQuery } from '../execution/compileToDomainQuery'
import type { SearchAction } from '../semantics/types'
import type { Payment } from '@/types/wedding'

const TODAY = '2026-09-14'

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

/** Universe: mix of past/future, Villa Love / other, 2026/2027. */
const UNIVERSE: CollectionMoneyRow[] = [
  row('W_past', '2026-08-01', 'Villa Love', 10000, 2000),
  row('W1', '2026-10-01', 'Villa Love', 12000, 3000),
  row('W2', '2026-11-15', 'Hotel X', 8000, 0),
  row('W3', '2026-12-20', 'Villa Love', 15000, 5000),
  row('W4', '2027-01-10', 'Villa Love', 9000, 1000),
  row('W5', '2027-03-01', 'Barn Y', 11000, 0),
  row('W6', '2027-06-01', 'Villa Love', 7000, 7000),
  row('W7', '2027-09-12', 'Hotel X', 13000, 2000),
  row('W_far', '2028-05-01', 'Villa Love', 5000, 0),
]

function weddingFixtures() {
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
    ] satisfies Payment[],
  }))
}

function reset() {
  destroyV6CollectionSession()
}

async function flowA() {
  reset()
  // Turn 1: nearest 3 future
  const t1 = await queryCollection(
    {
      type: 'Search',
      source: 'wedding',
      relativeTemporal: { kind: 'future_from_now', inclusive: true },
      sort: { field: 'wedding.date', direction: 'asc' },
      slice: { limit: 3 },
    },
    { turnId: 't1', todayKey: TODAY, universeRows: UNIVERSE },
  )
  assert.equal(t1.ok, true)
  if (!t1.ok) return
  const colA = v6CollectionStore.get(t1.data.handle)!
  assert.deepEqual(colA.snapshotMemberIds, ['W1', 'W2', 'W3'])
  assert.equal(colA.totalCount, 3)
  assert.equal(colA.ordering?.direction, 'asc')

  // Turn 2: Villa Love refine — subset only
  const t2 = await transformCollection({
    parentHandle: colA.handle,
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
    turnId: 't2',
    todayKey: TODAY,
    universeRows: UNIVERSE,
  })
  assert.equal(t2.ok, true)
  if (!t2.ok) return
  const colB = v6CollectionStore.get(t2.data.handle)!
  assert.ok(assertSnapshotSubset(colB.snapshotMemberIds, colA.snapshotMemberIds))
  assert.deepEqual(colB.snapshotMemberIds, ['W1', 'W3'])
  // Must NOT include W4 (Villa Love but outside parent snapshot)
  assert.ok(!colB.snapshotMemberIds.includes('W4'))

  // Turn 3: sum contract_value
  const t3 = await aggregateCollection(
    {
      type: 'Aggregate',
      collection: colB.handle,
      aggregation: 'sum',
      measure: 'contract_value',
    },
    { weddings: weddingFixtures() },
  )
  assert.equal(t3.ok, true)
  if (!t3.ok) return
  assert.equal(t3.data.provenance, 'canonical_finance')
  assert.equal(t3.data.value, 12000 + 15000)
  assert.equal(v6CollectionStore.getActive()?.handle, colB.handle)

  // Turn 4: remaining
  const t4 = await aggregateCollection(
    {
      type: 'Aggregate',
      collection: colB.handle,
      aggregation: 'sum',
      measure: 'remaining_amount',
    },
    { weddings: weddingFixtures() },
  )
  assert.equal(t4.ok, true)
  if (!t4.ok) return
  assert.equal(t4.data.provenance, 'canonical_finance')
  assert.equal(t4.data.value, (12000 - 3000) + (15000 - 5000))

  // Turn 5: exclude first of colB → drop W1
  const t5 = await transformCollection({
    parentHandle: colB.handle,
    ops: [{ op: 'Exclude', by: 'ordinal', ordinal: 1 }],
    turnId: 't5',
    universeRows: UNIVERSE,
  })
  assert.equal(t5.ok, true)
  if (!t5.ok) return
  const colC = v6CollectionStore.get(t5.data.handle)!
  assert.deepEqual(colC.snapshotMemberIds, ['W3'])
  assert.ok(assertSnapshotSubset(colC.snapshotMemberIds, colB.snapshotMemberIds))

  // Turn 6: restore colA
  const t6 = restoreCollection({ type: 'Restore', collection: colA.handle })
  assert.equal(t6.ok, true)
  assert.equal(v6CollectionStore.getActive()?.handle, colA.handle)
  assert.deepEqual(v6CollectionStore.getActive()?.snapshotMemberIds, [
    'W1',
    'W2',
    'W3',
  ])

  // Turn 7: only September — ambiguous year → we require explicit month with year in F1 ops
  // Using closed_calendar_month 2026-09 on restored colA → empty (none in Sep among W1-3)
  const t7 = await transformCollection({
    parentHandle: colA.handle,
    ops: [
      {
        op: 'RelativeTemporal',
        temporal: {
          kind: 'closed_calendar_month',
          year: 2026,
          month: 9,
        },
      },
    ],
    turnId: 't7',
    todayKey: TODAY,
    universeRows: UNIVERSE,
  })
  assert.equal(t7.ok, true)
  if (!t7.ok) return
  const colSep = v6CollectionStore.get(t7.data.handle)!
  assert.equal(colSep.totalCount, 0)
  assert.deepEqual(colSep.snapshotMemberIds, [])

  // Turn 8: count active (colSep zero)
  const t8 = await aggregateCollection({
    type: 'Aggregate',
    collection: colSep.handle,
    aggregation: 'count',
  })
  assert.equal(t8.ok, true)
  if (!t8.ok) return
  assert.equal(t8.data.value, 0)

  console.log('  OK Flow A 8-turn structural')
}

async function zeroResultIdentity() {
  reset()
  const q = await queryCollection(
    {
      type: 'Search',
      source: 'wedding',
      relativeTemporal: {
        kind: 'closed_calendar_year',
        year: 2031,
      },
    },
    { turnId: 'z1', todayKey: TODAY, universeRows: UNIVERSE },
  )
  assert.equal(q.ok, true)
  if (!q.ok) return
  const zero = v6CollectionStore.get(q.data.handle)!
  assert.equal(zero.totalCount, 0)
  assert.deepEqual(zero.snapshotMemberIds, [])

  // Prior non-empty must not leak: create another then restore zero
  const other = await queryCollection(
    {
      type: 'Search',
      source: 'wedding',
      relativeTemporal: { kind: 'future_from_now', inclusive: true },
      slice: { limit: 3 },
      sort: { field: 'wedding.date', direction: 'asc' },
    },
    { turnId: 'z2', todayKey: TODAY, universeRows: UNIVERSE },
  )
  assert.equal(other.ok, true)
  const restored = restoreCollection({ type: 'Restore', collection: zero.handle })
  assert.equal(restored.ok, true)
  assert.equal(v6CollectionStore.getActive()?.handle, zero.handle)
  assert.equal(v6CollectionStore.getActive()?.totalCount, 0)
  console.log('  OK zero-result identity')
}

async function complexNovel() {
  reset()
  // next year, exclude Villa Love, sort asc, limit 5 → then sum remaining
  const q = await queryCollection(
    {
      type: 'Search',
      source: 'wedding',
      relativeTemporal: { kind: 'closed_calendar_year', year: 2027 },
      excludePlace: {
        field: 'place.name',
        op: 'contains',
        value: 'Villa Love',
      },
      sort: { field: 'wedding.date', direction: 'asc' },
      slice: { limit: 5 },
    },
    { turnId: 'c1', todayKey: TODAY, universeRows: UNIVERSE },
  )
  assert.equal(q.ok, true)
  if (!q.ok) return
  const col = v6CollectionStore.get(q.data.handle)!
  // 2027 non-Villa: W5, W7 (W4 and W6 are Villa Love)
  assert.deepEqual(col.snapshotMemberIds, ['W5', 'W7'])

  const agg = await aggregateCollection(
    {
      type: 'Aggregate',
      collection: col.handle,
      aggregation: 'sum',
      measure: 'remaining_amount',
    },
    { weddings: weddingFixtures() },
  )
  assert.equal(agg.ok, true)
  if (!agg.ok) return
  assert.equal(agg.data.provenance, 'canonical_finance')
  assert.equal(agg.data.value, 11000 + (13000 - 2000))
  console.log('  OK complex novel composition')
}

function failClosedInvariants() {
  reset()
  // Dropping sort must not happen — unsupported path is fail, not weaken
  // Temporal unresolved year
  const bad = resolveRelativeTemporal({
    kind: 'closed_calendar_year',
    year: 1800,
  })
  assert.equal(bad.kind, 'unresolved')

  const open = resolveRelativeTemporal(
    { kind: 'future_from_now', inclusive: true },
    TODAY,
  )
  assert.equal(open.kind, 'open_end')
  if (open.kind === 'open_end') {
    assert.equal(dateMatchesBound('2026-09-14', open), true)
    assert.equal(dateMatchesBound('2026-09-13', open), false)
  }

  // Authority never visible
  const auth = decideV6Authority({ toolOk: true, observationValid: true })
  assert.equal(auth.visibleOwner, 'none')

  // DomainQuery compile only for closed (no exclude)
  const searchOpen: SearchAction = {
    type: 'Search',
    source: 'wedding',
    relativeTemporal: { kind: 'future_from_now', inclusive: true },
    sort: { field: 'wedding.date', direction: 'asc' },
    slice: { limit: 3 },
  }
  assert.equal(tryCompileSearchToDomainQuery(searchOpen, TODAY), null)

  const searchClosed: SearchAction = {
    type: 'Search',
    source: 'wedding',
    relativeTemporal: { kind: 'closed_calendar_year', year: 2027 },
    sort: { field: 'wedding.date', direction: 'asc' },
    slice: { limit: 5 },
  }
  const dq = tryCompileSearchToDomainQuery(searchClosed, TODAY)
  assert.ok(dq)
  assert.equal(dq!.dateBinding?.range.from, '2027-01-01')
  assert.equal(dq!.limit, 5)
  assert.equal(dq!.orderBy[0]?.field, 'wedding.date')

  console.log('  OK fail-closed + DQ IR compile')
}

function unauthorizedKeys() {
  // Structural: tool args must not accept ownerId — validateDomainQuery already forbids;
  // V6 toolFail AUTHORIZATION is reserved; assert no ownerId in store API surface.
  const col = v6CollectionStore.create({
    source: 'wedding',
    semanticDefinition: {
      source: 'wedding',
      filters: [],
      excludePlaces: [],
      relativeTemporal: null,
      sort: null,
      slice: null,
      transformOps: [],
    },
    ordering: null,
    totalCount: 0,
    parentHandle: null,
    createdAtTurn: 't',
    fetchedAt: new Date().toISOString(),
    snapshotMemberIds: [],
    preview: [],
  })
  assert.ok(!('ownerId' in col))
  assert.ok(!('userId' in col))
  console.log('  OK no identity keys on collection')
}

async function main() {
  console.log('V6-F1 foundation acceptance')
  await flowA()
  await zeroResultIdentity()
  await complexNovel()
  failClosedInvariants()
  unauthorizedKeys()
  destroyV6CollectionSession()
  console.log('V6-F1 foundation acceptance PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
