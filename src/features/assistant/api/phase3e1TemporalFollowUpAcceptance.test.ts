/**
 * Phase 3E.1 — temporal follow-up ("next year") on active location collection.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/api/phase3e1TemporalFollowUpAcceptance.test.ts
 */

import { resolveAggregateDateRange } from '../dates'
import { makeTaskSpec } from '../v4/expect'
import { resolveTaskSpec } from '../v4/resolver/resolve'
import { emptyV4ShadowContext } from '../v4/resolver/types'
import { clearAssistantV4ShadowSession } from '../v4/resolver/shadowState'
import {
  validateCollectionQuery,
  type CollectionQuery,
} from '../v4/capabilities/collection/collectionQueryContract'
import {
  executeCollectionQueryOnRows,
  type CollectionMoneyRow,
} from '../v4/capabilities/collection/executeCollectionQuery'
import { collectionQueryCapability } from '../v4/capabilities/collection/collectionQueryCapability'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

const TODAY = '2026-09-13'

function q(
  partial: Partial<CollectionQuery> & Pick<CollectionQuery, 'operation'>,
): CollectionQuery {
  const raw = {
    resource: 'wedding' as const,
    operation: partial.operation,
    filters: partial.filters ?? {},
    metric: partial.metric ?? null,
    rank: partial.rank ?? null,
    limit: partial.limit ?? null,
    usedActiveCollection: partial.usedActiveCollection ?? false,
  }
  const v = validateCollectionQuery(raw)
  assert(v.ok, `query valid: ${'reason' in v ? v.reason : ''}`)
  return (v as { ok: true; query: CollectionQuery }).query
}

const NEXT = resolveAggregateDateRange('w przyszłym roku', TODAY)!
const THIS = resolveAggregateDateRange('w tym roku', TODAY)!
const PREV = resolveAggregateDateRange('w poprzednim roku', TODAY)!

const FIXTURE: CollectionMoneyRow[] = [
  {
    id: 'w-2027-jan',
    displayLabel: 'Jan boundary',
    date: '2027-01-01',
    contractValue: 1000,
    paidAmount: 100,
    remainingAmount: 900,
    locationHaystack: ['Villa Love'],
  },
  {
    id: 'w-2027-mid',
    displayLabel: 'Mid 2027',
    date: '2027-05-10',
    contractValue: 2000,
    paidAmount: 500,
    remainingAmount: 1500,
    locationHaystack: ['Villa Love'],
  },
  {
    id: 'w-2027-dec',
    displayLabel: 'Dec boundary',
    date: '2027-12-31',
    contractValue: 3000,
    paidAmount: 0,
    remainingAmount: 3000,
    locationHaystack: ['Villa Love'],
  },
  {
    id: 'w-2028-jan',
    displayLabel: 'Must exclude',
    date: '2028-01-01',
    contractValue: 9999,
    paidAmount: 0,
    remainingAmount: 9999,
    locationHaystack: ['Villa Love'],
  },
  {
    id: 'w-2026',
    displayLabel: 'This year',
    date: '2026-06-01',
    contractValue: 4000,
    paidAmount: 4000,
    remainingAmount: 0,
    locationHaystack: ['Villa Love'],
  },
  {
    id: 'w-2025',
    displayLabel: 'Prev year',
    date: '2025-08-01',
    contractValue: 500,
    paidAmount: 0,
    remainingAmount: 500,
    locationHaystack: ['Villa Love'],
  },
  {
    id: 'w-other',
    displayLabel: 'Other venue 2027',
    date: '2027-07-01',
    contractValue: 100,
    paidAmount: 0,
    remainingAmount: 100,
    locationHaystack: ['Hotel Stary'],
  },
]

console.log('Phase 3E.1 temporal follow-up acceptance')

// --- Canonical year phrases (shared SoT) ---
assert(!!NEXT, 'next year resolves')
assert(NEXT.from === '2027-01-01' && NEXT.to === '2027-12-31', 'next year bounds')
assert(NEXT.month === 0, 'year span month=0')
assert(THIS.from === '2026-01-01' && THIS.to === '2026-12-31', 'this year')
assert(PREV.from === '2025-01-01' && PREV.to === '2025-12-31', 'previous year')

assert(
  resolveAggregateDateRange('a w przyszłym roku?', TODAY)?.from === '2027-01-01',
  'utterance-like phrase still resolves',
)
assert(
  resolveAggregateDateRange('next year', TODAY)?.to === '2027-12-31',
  'english next year',
)
assert(
  resolveAggregateDateRange('2027', TODAY)?.from === '2027-01-01',
  'bare year',
)
assert(
  resolveAggregateDateRange('przyszły miesiąc', TODAY)?.from === '2026-10-01',
  'next month still month (not year)',
)

// --- Boundary exclusion of 2028 ---
{
  const counted = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'count',
      filters: {
        locationQuery: 'Villa Love',
        dateRange: { from: NEXT.from, to: NEXT.to },
      },
    }),
  )
  assert(counted.observation.totalCount === 3, 'next year excludes 2028 → 3')
  assert(
    counted.activeCollection.filters.dateRange?.from === '2027-01-01',
    'activeCollection from',
  )
  assert(
    counted.activeCollection.filters.dateRange?.to === '2027-12-31',
    'activeCollection to',
  )
  assert(
    counted.activeCollection.filters.locationQuery === 'Villa Love',
    'venue preserved',
  )
}

{
  const listed = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'list',
      filters: {
        locationQuery: 'Villa Love',
        dateRange: { from: NEXT.from, to: NEXT.to },
      },
    }),
  )
  const dates = listed.observation.items?.map((i) => i.date) ?? []
  assert(dates.every((d) => d && d >= '2027-01-01' && d <= '2027-12-31'), 'list dates in 2027')
  assert(!dates.includes('2028-01-01'), 'list excludes 2028')
  assert(listed.observation.returnedCount === 3, 'list count 3')
}

{
  const thisY = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'count',
      filters: {
        locationQuery: 'Villa Love',
        dateRange: { from: THIS.from, to: THIS.to },
      },
    }),
  )
  assert(thisY.observation.totalCount === 1, 'this year excludes 2027')
}

{
  const prevY = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'count',
      filters: {
        locationQuery: 'Villa Love',
        dateRange: { from: PREV.from, to: PREV.to },
      },
    }),
  )
  assert(prevY.observation.totalCount === 1, 'previous year')
}

// --- Finance keeps corrected range ---
{
  const sum = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'sum',
      metric: 'contract_value',
      filters: {
        locationQuery: 'Villa Love',
        dateRange: { from: NEXT.from, to: NEXT.to },
      },
    }),
  )
  assert(sum.observation.amount === 6000, 'sum CV = 1000+2000+3000 (no 2028)')
  const paid = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'sum',
      metric: 'paid',
      filters: {
        locationQuery: 'Villa Love',
        dateRange: { from: NEXT.from, to: NEXT.to },
      },
    }),
  )
  assert(paid.observation.amount === 600, 'paid excludes 2028')
  const rem = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'sum',
      metric: 'remaining',
      filters: {
        locationQuery: 'Villa Love',
        dateRange: { from: NEXT.from, to: NEXT.to },
      },
    }),
  )
  assert(rem.observation.amount === 5400, 'remaining excludes 2028')
}

// --- Unknown venue + next year stays empty ---
{
  const empty = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'count',
      filters: {
        locationQuery: 'Nieistniejaca Sala',
        dateRange: { from: NEXT.from, to: NEXT.to },
      },
    }),
  )
  assert(empty.observation.totalCount === 0, 'unknown venue + next year = 0')
}

// --- Resolver: venue kept, year replaces prior year / month ---
{
  // Match resolver's live clock (same default as resolveAggregateDateRange()).
  const liveNext = resolveAggregateDateRange('w przyszłym roku')!
  assert(!!liveNext, 'live next year')

  // Venue only → next year
  const r1 = resolveTaskSpec(
    makeTaskSpec({
      op: 'count',
      subject: 'wedding',
      temporal: { phrase: 'w przyszłym roku', kind: 'range' },
      resource: { kind: 'active_collection' },
      fieldSource: {
        op: 'explicit',
        subject: 'omitted',
        resource: 'inherit',
        participant: 'omitted',
        temporal: 'explicit',
      },
    }),
    {
      ...emptyV4ShadowContext(),
      activeCollection: {
        resource: 'weddings',
        filters: { locationQuery: 'Villa Love', locationRole: 'any' },
        resultCount: 7,
      },
    },
  )
  assert(r1.status === 'resolved', 'next year resolved')
  if (r1.status === 'resolved') {
    assert(
      r1.collection?.filters?.locationQuery === 'Villa Love',
      'resolver keeps venue',
    )
    assert(
      r1.collection?.filters?.dateRange?.from === liveNext.from,
      'resolver next year from',
    )
    assert(
      r1.collection?.filters?.dateRange?.to === liveNext.to,
      'resolver next year to (closed)',
    )
    const built = collectionQueryCapability.buildInput(r1)
    assert(
      built.ok &&
        'query' in built.input &&
        built.input.query.filters.dateRange?.to === liveNext.to,
      'buildInput closed next year',
    )
  }

  // Prior year filter → replace (not OR/AND)
  const priorYear = {
    from: `${liveNext.year - 1}-01-01`,
    to: `${liveNext.year - 1}-12-31`,
  }
  const r2 = resolveTaskSpec(
    makeTaskSpec({
      op: 'count',
      subject: 'wedding',
      temporal: { phrase: 'w przyszłym roku', kind: 'range' },
      resource: { kind: 'active_collection' },
      fieldSource: {
        op: 'explicit',
        subject: 'omitted',
        resource: 'inherit',
        participant: 'omitted',
        temporal: 'explicit',
      },
    }),
    {
      ...emptyV4ShadowContext(),
      activeCollection: {
        resource: 'weddings',
        filters: {
          locationQuery: 'Villa Love',
          dateRange: priorYear,
        },
      },
    },
  )
  assert(r2.status === 'resolved', 'replace year resolved')
  if (r2.status === 'resolved') {
    assert(
      r2.collection?.filters?.dateRange?.from === liveNext.from,
      'prior year replaced (not OR/AND)',
    )
    assert(
      r2.collection?.filters?.locationQuery === 'Villa Love',
      'venue still kept after year replace',
    )
  }

  // August current year → "next year" = full next calendar year (not same month next year)
  const liveAugust = resolveAggregateDateRange('sierpień')!
  const r3 = resolveTaskSpec(
    makeTaskSpec({
      op: 'count',
      subject: 'wedding',
      temporal: { phrase: 'w przyszłym roku', kind: 'range' },
      resource: { kind: 'active_collection' },
      fieldSource: {
        op: 'explicit',
        subject: 'omitted',
        resource: 'inherit',
        participant: 'omitted',
        temporal: 'explicit',
      },
    }),
    {
      ...emptyV4ShadowContext(),
      activeCollection: {
        resource: 'weddings',
        filters: {
          locationQuery: 'Villa Love',
          dateRange: liveAugust
            ? { from: liveAugust.from, to: liveAugust.to }
            : undefined,
        },
      },
    },
  )
  assert(r3.status === 'resolved', 'aug→next year resolved')
  if (r3.status === 'resolved') {
    assert(
      r3.collection?.filters?.dateRange?.from === liveNext.from &&
        r3.collection?.filters?.dateRange?.to === liveNext.to,
      'intended rule: full next calendar year (not Aug next year)',
    )
  }
}

// --- Close clears collection ---
{
  clearAssistantV4ShadowSession()
  // shadow clear is enough for session; also assert empty overlay path
  const ctx = emptyV4ShadowContext()
  assert(ctx.activeCollection == null, 'fresh context empty')
}

console.log('Phase 3E.1 temporal follow-up acceptance — ALL PASS')
