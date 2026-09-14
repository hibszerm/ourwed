/**
 * G1 — CollectionQuery → DomainQuery adapter + shadow agreement.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/domainQuery/g1CollectionToDomainQueryAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveAggregateDateRange } from '../../dates'
import type { CollectionMoneyRow } from '../capabilities/collection/executeCollectionQuery'
import {
  validateCollectionQuery,
  type CollectionQuery,
} from '../capabilities/collection/collectionQueryContract'
import {
  adaptCollectionQueryToDomainQuery,
  collectionFiltersWithOperation,
} from './adaptCollectionQuery'
import { runCollectionDomainQueryDual } from './runCollectionDomainQueryDual'
import { emptyV4ShadowContext } from '../resolver/types'
import { clearAssistantV4ShadowSession } from '../resolver/shadowState'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function cq(
  partial: Partial<CollectionQuery> &
    Pick<CollectionQuery, 'operation'>,
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
  assert(v.ok, `cq valid: ${'reason' in v ? v.reason : ''}`)
  return (v as { ok: true; query: CollectionQuery }).query
}

function dual(rows: CollectionMoneyRow[], query: CollectionQuery) {
  const r = runCollectionDomainQueryDual({ collectionQuery: query, rows })
  assert(r.ok, `dual: ${r.ok === false ? r.reason : ''}`)
  assert(
    r.ok && r.agreement.agree,
    `agree: ${r.ok ? r.agreement.reasons.join(',') : ''}`,
  )
  return r as Extract<typeof r, { ok: true }>
}

const TODAY = '2026-09-13'
const AUGUST = resolveAggregateDateRange('sierpień', TODAY)!
const YEAR_2027 = { from: '2027-01-01', to: '2027-12-31' }
const YEAR_2028 = { from: '2028-01-01', to: '2028-12-31' }

const ROWS: CollectionMoneyRow[] = [
  {
    id: 'vl-2026-a',
    displayLabel: 'VL 2026 A',
    date: '2026-06-10',
    contractValue: 10000,
    paidAmount: 2000,
    remainingAmount: 8000,
    locationHaystack: ['Villa Love'],
    locationByRole: { reception: ['Villa Love'] },
  },
  {
    id: 'vl-2026-b',
    displayLabel: 'VL 2026 B',
    date: '2026-08-20',
    contractValue: 12000,
    paidAmount: 12000,
    remainingAmount: 0,
    locationHaystack: ['Villa Love'],
    locationByRole: { reception: ['Villa Love'] },
  },
  {
    id: 'vl-2028',
    displayLabel: 'VL 2028',
    date: '2028-05-01',
    contractValue: 15000,
    paidAmount: 1000,
    remainingAmount: 14000,
    locationHaystack: ['Villa Love'],
    locationByRole: { reception: ['Villa Love'] },
  },
  {
    id: 'hs-2027-a',
    displayLabel: 'HS 2027 A',
    date: '2027-03-01',
    contractValue: 9000,
    paidAmount: 0,
    remainingAmount: 9000,
    locationHaystack: ['Hotel Stary'],
    locationByRole: { reception: ['Hotel Stary'] },
  },
  {
    id: 'hs-2027-b',
    displayLabel: 'HS 2027 B',
    date: '2027-08-15',
    contractValue: 11000,
    paidAmount: 5000,
    remainingAmount: 6000,
    locationHaystack: ['Hotel Stary'],
    locationByRole: { reception: ['Hotel Stary'] },
  },
  {
    id: 'other-2027',
    displayLabel: 'Other 2027',
    date: '2027-07-01',
    contractValue: 7000,
    paidAmount: 7000,
    remainingAmount: 0,
    locationHaystack: ['Sala Inna'],
    locationByRole: { reception: ['Sala Inna'] },
  },
]

console.log('G1 CollectionQuery → DomainQuery adapter acceptance')

// --- Canonical adapter is structural ---
{
  const adapted = adaptCollectionQueryToDomainQuery(
    cq({
      operation: 'sum',
      metric: 'remaining',
      filters: {
        locationQuery: 'Villa Love',
        locationRole: 'reception',
        dateRange: YEAR_2027,
      },
    }),
  )
  assert(adapted.ok, 'adapt sum')
  if (adapted.ok) {
    assert(adapted.query.source === 'wedding', 'source wedding')
    assert(adapted.query.aggregate === 'sum', 'aggregate sum')
    assert(adapted.query.measure === 'wedding.remaining_amount', 'measure')
    assert(
      adapted.query.dateBinding?.range.from === '2027-01-01',
      'dateBinding',
    )
    assert(
      adapted.query.relations.some(
        (r) => r.field === 'place.name' && r.value === 'Villa Love',
      ),
      'place.name',
    )
    assert(
      adapted.query.relations.some(
        (r) => r.field === 'place.role' && r.value === 'reception',
      ),
      'place.role',
    )
  }

  const rank = adaptCollectionQueryToDomainQuery(
    cq({
      operation: 'rank',
      metric: 'contract_value',
      rank: { direction: 'desc', limit: 1 },
      filters: {},
    }),
  )
  assert(!rank.ok && rank.reason === 'unsupported_operation', 'rank unsupported')
}

// --- A–H dual-run agreement ---
{
  // A. count all
  const a = dual(ROWS, cq({ operation: 'count', filters: {} }))
  assert(a.collectionExec.observation.totalCount === 6, 'A=6')
  assert(a.agreement.queryEquivalent, 'A queryEq')
  assert(a.agreement.membershipEquivalent, 'A memEq')

  // B. count August
  const b = dual(
    ROWS,
    cq({
      operation: 'count',
      filters: { dateRange: { from: AUGUST.from, to: AUGUST.to } },
    }),
  )
  assert(b.collectionExec.observation.totalCount === 1, 'B august=1 (vl-2026-b)')

  // C. count Villa Love
  const c = dual(
    ROWS,
    cq({
      operation: 'count',
      filters: { locationQuery: 'Villa Love' },
    }),
  )
  assert(c.collectionExec.observation.totalCount === 3, 'C VL=3')

  // D. Villa Love + 2027
  const dFilters = {
    locationQuery: 'Villa Love',
    dateRange: YEAR_2027,
  }
  const d = dual(ROWS, cq({ operation: 'count', filters: dFilters }))
  assert(d.collectionExec.observation.totalCount === 0, 'D=0')
  assert(
    d.agreement.domainQuery?.relations.some((r) => r.value === 'Villa Love'),
    'D keeps venue in DomainQuery',
  )
  assert(
    d.agreement.domainQuery?.dateBinding?.range.to === '2027-12-31',
    'D keeps year',
  )

  // E. list same D
  const e = dual(
    ROWS,
    collectionFiltersWithOperation({
      filters: dFilters,
      operation: 'list',
      limit: 20,
    }),
  )
  assert(e.collectionExec.observation.totalCount === 0, 'E list 0')
  assert((e.domainObservation.items ?? []).length === 0, 'E []')

  // F. sum CV of D
  const f = dual(
    ROWS,
    collectionFiltersWithOperation({
      filters: dFilters,
      operation: 'sum',
      metric: 'contract_value',
    }),
  )
  assert(f.collectionExec.observation.amount === 0, 'F CV=0')
  assert(f.agreement.amountEquivalent, 'F amountEq')

  // G. sum paid of D
  const g = dual(
    ROWS,
    collectionFiltersWithOperation({
      filters: dFilters,
      operation: 'sum',
      metric: 'paid',
    }),
  )
  assert(g.collectionExec.observation.amount === 0, 'G paid=0')

  // H. sum remaining of D
  const h = dual(
    ROWS,
    collectionFiltersWithOperation({
      filters: dFilters,
      operation: 'sum',
      metric: 'remaining',
    }),
  )
  assert(h.collectionExec.observation.amount === 0, 'H remaining=0')
}

// --- I / J zero-result ---
{
  const filters = { locationQuery: 'Villa Love', dateRange: YEAR_2027 }
  const i = dual(
    ROWS,
    collectionFiltersWithOperation({ filters, operation: 'list', limit: 20 }),
  )
  assert((i.domainObservation.items ?? []).length === 0, 'I []')

  const j = dual(
    ROWS,
    collectionFiltersWithOperation({
      filters,
      operation: 'sum',
      metric: 'remaining',
    }),
  )
  assert(j.collectionExec.observation.amount === 0, 'J remaining 0')
  assert(
    j.agreement.domainQuery?.relations[0]?.value === 'Villa Love',
    'J query identity preserved',
  )
}

// --- K replace year, preserve venue ---
{
  const base = {
    locationQuery: 'Villa Love',
    dateRange: YEAR_2027,
  }
  const k = dual(
    ROWS,
    cq({
      operation: 'count',
      filters: { ...base, dateRange: YEAR_2028 },
    }),
  )
  assert(k.collectionExec.observation.totalCount === 1, 'K VL 2028=1')
  assert(
    k.agreement.domainQuery?.relations.some((r) => r.value === 'Villa Love'),
    'K venue preserved',
  )
  assert(
    k.agreement.domainQuery?.dateBinding?.range.from === '2028-01-01',
    'K year replaced',
  )
}

// --- L replace venue, preserve year ---
{
  const l = dual(
    ROWS,
    cq({
      operation: 'count',
      filters: {
        locationQuery: 'Hotel Stary',
        dateRange: YEAR_2027,
      },
    }),
  )
  assert(l.collectionExec.observation.totalCount === 2, 'L HS 2027=2')
  assert(
    l.agreement.domainQuery?.dateBinding?.range.from === '2027-01-01',
    'L year kept',
  )
  assert(
    l.agreement.domainQuery?.relations.some((r) => r.value === 'Hotel Stary'),
    'L venue replaced',
  )
}

// --- M close/reset: no G1 persistent diagnostic state ---
{
  clearAssistantV4ShadowSession()
  const ctx = emptyV4ShadowContext()
  assert(ctx.activeCollection == null, 'M shadow collection cleared')
  // G1 dual-run is pure function — no module-level session to leak
  const dualSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/domainQuery/runCollectionDomainQueryDual.ts',
    ),
    'utf8',
  )
  assert(!/let last|globalThis|sessionMap/.test(dualSrc), 'M no G1 session store')
}

// --- Generalization gate: no NL in adapter ---
{
  const dir = resolve(process.cwd(), 'src/features/assistant/v4/domainQuery')
  for (const f of [
    'adaptCollectionQuery.ts',
    'runCollectionDomainQueryDual.ts',
  ]) {
    const src = readFileSync(resolve(dir, f), 'utf8')
    assert(!/Villa Love/i.test(src), `${f}: no venue hardcode`)
    assert(!/przyszł|sierpień/i.test(src), `${f}: no Polish phrase`)
    assert(!/\.test\(\s*utterance|includes\(['"]a w/.test(src), `${f}: no utterance match`)
    assert(!/tryDeterministic|refineSemantic/.test(src), `${f}: no rewrite`)
    assert(!/new RegExp|match\(\//.test(src), `${f}: no regex parsing`)
  }
}

console.log('G1 CollectionQuery → DomainQuery adapter acceptance — ALL PASS')
