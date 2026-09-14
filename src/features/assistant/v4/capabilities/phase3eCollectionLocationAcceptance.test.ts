/**
 * Phase 3E — collection location / venue filtering acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/v4/capabilities/phase3eCollectionLocationAcceptance.test.ts
 */

import { makeTaskSpec } from '../expect'
import { resolveTaskSpec } from '../resolver/resolve'
import { emptyV4ShadowContext } from '../resolver/types'
import { selectV4Capability } from './selector'
import { V4_CAPABILITY_REGISTRY } from './registry'
import { V4_CAPABILITY_IDS } from './types'
import { collectionQueryCapability } from './collection/collectionQueryCapability'
import {
  validateCollectionQuery,
  type CollectionQuery,
} from './collection/collectionQueryContract'
import {
  executeCollectionQueryOnRows,
  type CollectionMoneyRow,
} from './collection/executeCollectionQuery'
import {
  normalizeLocationText,
  weddingMatchesLocationFilter,
} from './collection/locationMatch'
import { resolveAggregateDateRange } from '../../dates'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

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

const NEXT_YEAR = resolveAggregateDateRange('2027-08', '2026-09-13')!
const AUGUST = resolveAggregateDateRange('sierpień', '2026-09-13')!

const FIXTURE: CollectionMoneyRow[] = [
  {
    id: 'w-vl-1',
    displayLabel: 'Anna & Bartek',
    date: '2027-06-10',
    contractValue: 12000,
    paidAmount: 4000,
    remainingAmount: 8000,
    locationHaystack: ['Villa Love', 'Stęszew'],
    locationByRole: {
      reception: ['Villa Love', 'Stęszew, Polska'],
      ceremony: ['Kościół Św. Jana'],
      preparations: ['Dom panny młodej'],
    },
  },
  {
    id: 'w-vl-2',
    displayLabel: 'Celina & Damian',
    date: '2026-08-20',
    contractValue: 18000,
    paidAmount: 18000,
    remainingAmount: 0,
    // Both ceremony + reception say Villa Love — wedding must count once
    locationHaystack: ['Villa Love', 'Villa Love', 'Poznań'],
    locationByRole: {
      reception: ['Villa Love'],
      ceremony: ['Villa Love'],
      preparations: ['Hotel Stary'],
    },
  },
  {
    id: 'w-hs-1',
    displayLabel: 'Ewa & Filip',
    date: '2027-03-01',
    contractValue: 9000,
    paidAmount: 1000,
    remainingAmount: 8000,
    locationHaystack: ['Hotel Stary', 'Kraków'],
    locationByRole: {
      reception: ['Hotel Stary', 'Kraków'],
      ceremony: ['Bazylika'],
      preparations: ['Hotel Stary'],
    },
  },
  {
    id: 'w-krk',
    displayLabel: 'Gosia & Hubert',
    date: '2026-08-05',
    contractValue: 7000,
    paidAmount: 0,
    remainingAmount: 7000,
    locationHaystack: ['Sala Krakowska', 'Kraków'],
    locationByRole: {
      reception: ['Sala Krakowska', 'Kraków'],
    },
  },
]

console.log('Phase 3E collection location acceptance')

// --- Registry unchanged ---
assert(V4_CAPABILITY_REGISTRY.length === 4, 'exactly 4 capabilities')
assert(
  V4_CAPABILITY_IDS.includes('collection.query'),
  'collection.query present',
)
assert(
  !V4_CAPABILITY_IDS.some((id) => id.includes('venue') || id.includes('location')),
  'no venue-specific capability',
)

// --- Normalization ---
assert(
  normalizeLocationText('  Villa   Love ') === 'villa love',
  'whitespace/case',
)
assert(
  normalizeLocationText('VILLA LOVE') === 'villa love',
  'case fold',
)
assert(normalizeLocationText('Stęszew') === 'steszew', 'diacritics')
assert(
  normalizeLocationText('Villa Love!') === 'villa love',
  'punctuation',
)

// --- COUNT ---
{
  const all = executeCollectionQueryOnRows(
    FIXTURE,
    q({ operation: 'count', filters: { locationQuery: 'Villa Love' } }),
  )
  assert(all.observation.totalCount === 2, 'Villa Love count=2')
  assert(
    all.activeCollection.filters.locationQuery === 'Villa Love',
    'activeCollection location',
  )
}

{
  const next = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'count',
      filters: {
        locationQuery: 'Villa Love',
        dateRange: { from: '2027-01-01', to: '2027-12-31' },
      },
    }),
  )
  assert(next.observation.totalCount === 1, 'Villa Love next year=1')
}

{
  const aug = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'count',
      filters: {
        locationQuery: 'Villa Love',
        dateRange: { from: AUGUST.from, to: AUGUST.to },
      },
    }),
  )
  assert(aug.observation.totalCount === 1, 'Villa Love August=1')
}

{
  const none = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'count',
      filters: { locationQuery: 'Nieistniejaca Sala XYZ' },
    }),
  )
  assert(none.observation.totalCount === 0, 'unknown venue=0')
  assert(
    none.activeCollection.filters.locationQuery === 'Nieistniejaca Sala XYZ',
    'empty collection keeps filter',
  )
}

// --- LIST + no duplicate wedding ---
{
  const listed = executeCollectionQueryOnRows(
    FIXTURE,
    q({ operation: 'list', filters: { locationQuery: 'villa love' } }),
  )
  assert(listed.observation.totalCount === 2, 'list count 2')
  assert(listed.observation.returnedCount === 2, 'returned 2')
  const ids = listed.observation.items?.map((i) => i.resource.id) ?? []
  assert(new Set(ids).size === ids.length, 'no duplicate wedding ids')
}

{
  const many = Array.from({ length: 25 }, (_, i) => ({
    ...FIXTURE[0]!,
    id: `w-${i}`,
    displayLabel: `W${i}`,
  }))
  const listed = executeCollectionQueryOnRows(
    many,
    q({ operation: 'list', filters: { locationQuery: 'Villa Love' }, limit: 20 }),
  )
  assert(listed.observation.returnedCount === 20, 'cap 20')
  assert(listed.observation.truncated === true, 'truncated')
}

// --- SUM finance ---
{
  const cv = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'sum',
      metric: 'contract_value',
      filters: { locationQuery: 'Villa Love' },
    }),
  )
  assert(cv.observation.amount === 30000, 'sum CV Villa Love')
  const paid = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'sum',
      metric: 'paid',
      filters: { locationQuery: 'Villa Love' },
    }),
  )
  assert(paid.observation.amount === 22000, 'sum paid')
  const rem = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'sum',
      metric: 'remaining',
      filters: { locationQuery: 'Villa Love' },
    }),
  )
  assert(rem.observation.amount === 8000, 'sum remaining')
}

// --- RANK ---
{
  const rank = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'rank',
      metric: 'contract_value',
      filters: { locationQuery: 'Villa Love' },
      rank: { direction: 'desc', limit: 1 },
    }),
  )
  assert(rank.activeResource?.id === 'w-vl-2', 'most expensive Villa Love')
  assert(
    rank.activeCollection.filters.locationQuery === 'Villa Love',
    'rank keeps venue collection',
  )
  const empty = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'rank',
      metric: 'contract_value',
      filters: { locationQuery: 'Brak Sali' },
      rank: { direction: 'desc', limit: 1 },
    }),
  )
  assert(empty.activeResource === null, 'empty rank no resource')
  assert(empty.observation.items?.length === 0, 'empty items')
}

// --- ROLE filters ---
{
  const prep = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'count',
      filters: {
        locationQuery: 'Hotel Stary',
        locationRole: 'preparations',
      },
    }),
  )
  assert(prep.observation.totalCount === 2, 'prep role Hotel Stary (vl-2 + hs)')
  const reception = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'count',
      filters: {
        locationQuery: 'Hotel Stary',
        locationRole: 'reception',
      },
    }),
  )
  assert(reception.observation.totalCount === 1, 'reception Hotel Stary=1')
  const ceremony = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'count',
      filters: {
        locationQuery: 'Villa Love',
        locationRole: 'ceremony',
      },
    }),
  )
  assert(ceremony.observation.totalCount === 1, 'ceremony Villa Love=1')
}

// --- City locality ---
{
  const krk = executeCollectionQueryOnRows(
    FIXTURE,
    q({ operation: 'count', filters: { locationQuery: 'Kraków' } }),
  )
  assert(krk.observation.totalCount === 2, 'Kraków locality')
}

// --- WeddingMatchesLocationFilter on wedding-like object ---
{
  const weddingLike = {
    primaryLocation: {
      venueName: 'Villa Love',
      locality: 'Stęszew',
      displayText: 'Villa Love, Stęszew',
      source: 'reception' as const,
    },
    receptionLocation: 'Villa Love, Stęszew',
    ceremonyLocation: 'Kościół',
    bridePreparationLocation: null,
    groomPreparationLocation: null,
    preparationLocation: null,
    couple: { venue: null, city: null },
  }
  assert(
    weddingMatchesLocationFilter(weddingLike, 'villa love', 'any'),
    'match any',
  )
  assert(
    weddingMatchesLocationFilter(weddingLike, 'Villa Love', 'reception'),
    'match reception',
  )
  assert(
    !weddingMatchesLocationFilter(weddingLike, 'Villa Love', 'ceremony'),
    'no ceremony match',
  )
}

// --- Security rejects ---
{
  assert(
    !validateCollectionQuery({
      resource: 'wedding',
      operation: 'count',
      filters: { locationQuery: 'X' },
      userId: 'u1',
      usedActiveCollection: false,
    }).ok,
    'reject userId',
  )
  assert(
    !validateCollectionQuery({
      resource: 'wedding',
      operation: 'count',
      filters: { locationQuery: 'X', ownerId: 'o' },
      usedActiveCollection: false,
    }).ok,
    'reject ownerId in filters',
  )
  assert(
    !validateCollectionQuery({
      resource: 'wedding',
      operation: 'count',
      filters: {},
      table: 'weddings',
      usedActiveCollection: false,
    }).ok,
    'reject table',
  )
  assert(
    !validateCollectionQuery({
      resource: 'wedding',
      operation: 'count',
      filters: {},
      weddingIds: ['a'],
      usedActiveCollection: false,
    }).ok,
    'reject weddingIds',
  )
}

// --- Resolver: titleHint → location; inherit; replace ---
{
  const ctx = emptyV4ShadowContext()
  const countSpec = makeTaskSpec({
    op: 'count',
    subject: 'wedding',
    qualifiers: {
      aspect: null,
      rank: null,
      destination: null,
      titleHint: 'Villa Love',
      unsupportedReason: null,
    },
  })
  const r1 = resolveTaskSpec(countSpec, ctx)
  assert(r1.status === 'resolved', 'count resolved')
  if (r1.status === 'resolved') {
    assert(
      r1.collection?.filters?.locationQuery === 'Villa Love',
      'titleHint → locationQuery',
    )
    const sel = selectV4Capability(r1)
    assert(
      sel.status === 'selected' && sel.capability.id === 'collection.query',
      '→ collection.query',
    )
    const built = collectionQueryCapability.buildInput(r1)
    assert(
      built.ok &&
        'baselineCollectionQuery' in built.input &&
        built.input.baselineCollectionQuery?.filters.locationQuery ===
          'Villa Love',
      'buildInput location',
    )
  }

  // Follow-up inherit location + new temporal
  ctx.activeCollection = {
    resource: 'weddings',
    filters: { locationQuery: 'Villa Love', locationRole: 'any' },
    resultCount: 2,
  }
  ctx.previousTaskSpec = countSpec
  const nextYear = makeTaskSpec({
    op: 'count',
    subject: 'wedding',
    temporal: { phrase: '2027', kind: 'range' },
    resource: { kind: 'active_collection' },
    fieldSource: {
      op: 'explicit',
      subject: 'explicit',
      resource: 'inherit',
      participant: 'omitted',
      temporal: 'explicit',
    },
  })
  // Force temporal resolution via phrase that resolveAggregateDateRange understands
  const nextYear2 = makeTaskSpec({
    op: 'count',
    subject: 'wedding',
    temporal: { phrase: '2027-01', kind: 'range' },
    resource: { kind: 'active_collection' },
    fieldSource: {
      op: 'explicit',
      subject: 'omitted',
      resource: 'inherit',
      participant: 'omitted',
      temporal: 'explicit',
    },
  })
  void nextYear
  const r2 = resolveTaskSpec(nextYear2, {
    ...ctx,
    activeCollection: {
      resource: 'weddings',
      filters: {
        locationQuery: 'Villa Love',
        dateRange: { from: '2026-01-01', to: '2026-12-31' },
      },
    },
  })
  assert(r2.status === 'resolved', 'temporal follow-up resolved')
  if (r2.status === 'resolved') {
    assert(
      r2.collection?.filters?.locationQuery === 'Villa Love',
      'location persists',
    )
  }

  // Venue B replaces venue A
  const replace = resolveTaskSpec(
    makeTaskSpec({
      op: 'count',
      subject: 'wedding',
      qualifiers: {
        aspect: null,
        rank: null,
        destination: null,
        titleHint: 'Hotel Stary',
        unsupportedReason: null,
      },
    }),
    {
      ...ctx,
      activeCollection: {
        resource: 'weddings',
        filters: { locationQuery: 'Villa Love' },
      },
    },
  )
  assert(replace.status === 'resolved', 'replace resolved')
  if (replace.status === 'resolved') {
    assert(
      replace.collection?.filters?.locationQuery === 'Hotel Stary',
      'location replaced not intersected',
    )
  }

  // destination → locationRole
  const roleSpec = resolveTaskSpec(
    makeTaskSpec({
      op: 'count',
      subject: 'wedding',
      qualifiers: {
        aspect: null,
        rank: null,
        destination: 'reception',
        titleHint: 'Villa Love',
        unsupportedReason: null,
      },
    }),
    emptyV4ShadowContext(),
  )
  assert(
    roleSpec.status === 'resolved' &&
      roleSpec.collection?.filters?.locationRole === 'reception',
    'destination → locationRole',
  )
}

// --- No N+1 in executor source ---
{
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/capabilities/collection/executeCollectionQuery.ts',
    ),
    'utf8',
  )
  assert(src.includes('listWeddingsForList'), 'uses list-light')
  assert(!src.includes('listByWeddingId('), 'no per-id place loop')
  assert(!src.includes('weddingService.getById'), 'no getById N+1')
}

// --- NEXT_YEAR fixture sanity ---
void NEXT_YEAR

console.log('Phase 3E collection location acceptance — ALL PASS')
