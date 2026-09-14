/**
 * G3 — ResolvedTask → DomainQuery direct compiler acceptance.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/domainQuery/g3DirectDomainQueryCompilerAcceptance.test.ts
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
import { clearAssistantV4ShadowSession } from '../resolver/shadowState'
import type { CollectionMoneyRow } from '../capabilities/collection/executeCollectionQuery'
import { buildCollectionQueryFromResolved } from '../capabilities/collection/collectionQueryCapability'
import { compileResolvedSemanticsToDomainQuery } from './compileResolvedSemantics'
import { compareThreeWayDomainQuery } from './compareThreeWayDomainQuery'
import { executeDomainQueryOnRows } from './executeDomainQuery'

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
  {
    id: 'hs-2026-aug',
    displayLabel: 'HS Aug',
    date: '2026-08-20',
    contractValue: 7000,
    paidAmount: 0,
    remainingAmount: 7000,
    locationHaystack: ['Hotel Stary'],
    locationByRole: { reception: ['Hotel Stary'] },
  },
]

function mustResolved(
  result: ReturnType<typeof resolveTaskSpec>,
): ResolvedTask {
  assert(result.status === 'resolved', `resolved got ${result.status}`)
  return result as ResolvedTask
}

function baselineCollectionQuery(resolved: ResolvedTask) {
  const built = buildCollectionQueryFromResolved(resolved)
  assert(built.ok, `baseline CQ: ${built.ok === false ? built.safeCode : ''}`)
  return (built as { ok: true; query: import('../capabilities/collection/collectionQueryContract').CollectionQuery }).query
}

function threeWay(resolved: ResolvedTask) {
  const cq = baselineCollectionQuery(resolved)
  const cmp = compareThreeWayDomainQuery({
    resolved,
    collectionQuery: cq,
    rows: ROWS,
  })
  assert(cmp.agreeAll, `3-way: ${cmp.reasons.join(',')}`)
  return cmp
}

function ctxWithCollection(
  filters: NonNullable<V4ShadowContext['activeCollection']>['filters'],
): V4ShadowContext {
  return {
    ...emptyV4ShadowContext(),
    activeCollection: {
      resource: 'weddings',
      filters,
      resultCount: 0,
    },
  }
}

console.log('G3 direct DomainQuery compiler acceptance')

// --- Compiler never imports / takes CollectionQuery ---
{
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/domainQuery/compileResolvedSemantics.ts',
    ),
    'utf8',
  )
  assert(!src.includes('adaptCollectionQuery'), 'no G1 adapter')
  assert(!/from ['"].*collectionQueryContract/.test(src), 'no CQ import')
  assert(!/przyszłymi? roku|includes\(['"]a w/.test(src), 'no phrase match')
  assert(!/new RegExp|\.match\(\//.test(src), 'no regex parsing')
}

// --- Rank → unsupported (honest) ---
{
  const r = mustResolved(
    resolveTaskSpec(
      makeTaskSpec({
        op: 'rank',
        subject: 'contract_value',
        qualifiers: {
          aspect: null,
          rank: 'max',
          destination: null,
          titleHint: null,
          unsupportedReason: null,
        },
      }),
      emptyV4ShadowContext(),
    ),
  )
  const c = compileResolvedSemanticsToDomainQuery(r)
  assert(c.status === 'unsupported', 'rank unsupported')
}

// --- Sum without measure → needs_semantic_slot ---
{
  const r = mustResolved(
    resolveTaskSpec(
      makeTaskSpec({
        op: 'sum',
        subject: 'wedding',
      }),
      emptyV4ShadowContext(),
    ),
  )
  const c = compileResolvedSemanticsToDomainQuery(r)
  assert(c.status === 'needs_semantic_slot', 'sum needs measure')
  if (c.status === 'needs_semantic_slot') {
    assert(c.slot === 'measure', 'slot measure')
  }
}

// ========== CHAIN 1 — temporal ==========
{
  // count August
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
  assert(r1.temporal?.from === AUGUST.from, 'aug resolved by Context Resolver')
  const c1 = threeWay(r1)
  const exec1 = executeDomainQueryOnRows(ROWS, c1.directQuery!)
  assert(exec1.ok && exec1.observation.totalCount === 2, 'C1 count aug=2')

  // list them (inherit collection filters)
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
      ctxWithCollection({
        dateRange: { from: AUGUST.from, to: AUGUST.to },
      }),
    ),
  )
  const c2 = threeWay(r2)
  assert(c2.directQuery?.dateBinding?.range.from === AUGUST.from, 'C1 list keeps aug')
  const exec2 = executeDomainQueryOnRows(ROWS, c2.directQuery!)
  assert(exec2.ok && exec2.observation.aggregate === 'list', 'C1 list')
  assert(exec2.ok && exec2.observation.totalCount === 2, 'C1 list count')

  // sum remaining
  const r3 = mustResolved(
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
      ctxWithCollection({
        dateRange: { from: AUGUST.from, to: AUGUST.to },
      }),
    ),
  )
  const c3 = threeWay(r3)
  const exec3 = executeDomainQueryOnRows(ROWS, c3.directQuery!)
  assert(exec3.ok && exec3.observation.amount === 16000, 'C1 remaining 9k+7k')

  // switch to September
  const r4 = mustResolved(
    resolveTaskSpec(
      makeTaskSpec({
        op: 'list',
        subject: 'wedding',
        temporal: { phrase: 'wrzesień', kind: 'range' },
        resource: { kind: 'active_collection' },
        fieldSource: {
          op: 'explicit',
          subject: 'omitted',
          resource: 'inherit',
          participant: 'omitted',
          temporal: 'explicit',
        },
      }),
      ctxWithCollection({
        dateRange: { from: AUGUST.from, to: AUGUST.to },
      }),
    ),
  )
  assert(r4.collection?.filters?.dateRange?.from === SEPTEMBER.from, 'sep replaces aug')
  const c4 = threeWay(r4)
  const exec4 = executeDomainQueryOnRows(ROWS, c4.directQuery!)
  assert(exec4.ok && exec4.observation.totalCount === 1, 'C1 sep list=1')
}

// ========== CHAIN 2 — location / zero / 2028 ==========
{
  const r1 = mustResolved(
    resolveTaskSpec(
      makeTaskSpec({
        op: 'count',
        subject: 'wedding',
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
  )
  assert(r1.collection?.filters?.locationQuery === 'Villa Love', 'VL in filters')
  const c1 = threeWay(r1)
  const e1 = executeDomainQueryOnRows(ROWS, c1.directQuery!)
  assert(e1.ok && e1.observation.totalCount === 3, 'C2 VL=3')

  // next year 2027 via explicit temporal phrase — resolver resolves ISO
  const r2 = mustResolved(
    resolveTaskSpec(
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
      ctxWithCollection({
        locationQuery: 'Villa Love',
        locationRole: 'any',
      }),
    ),
  )
  // Live clock: next year from machine; force structural year via seeded dateRange replacement test
  // Prefer asserting: location preserved + dateBinding present from resolver
  assert(
    r2.collection?.filters?.locationQuery === 'Villa Love',
    'C2 venue preserved',
  )
  const liveNext = resolveAggregateDateRange('w przyszłym roku')
  if (liveNext) {
    assert(
      r2.collection?.filters?.dateRange?.from === liveNext.from,
      'C2 next year from resolver',
    )
  }
  const c2 = threeWay(r2)
  const e2 = executeDomainQueryOnRows(ROWS, c2.directQuery!)
  // Fixture has no VL in 2027 (today 2026 → next=2027) or if clock differs, still structural
  if (liveNext?.from.startsWith('2027')) {
    assert(e2.ok && e2.observation.totalCount === 0, 'C2 VL∩2027=0')
  }

  // list same zero collection
  const r3 = mustResolved(
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
      ctxWithCollection({
        locationQuery: 'Villa Love',
        dateRange: YEAR_2027,
      }),
    ),
  )
  const c3 = threeWay(r3)
  const e3 = executeDomainQueryOnRows(ROWS, c3.directQuery!)
  assert(e3.ok && (e3.observation.items ?? []).length === 0, 'C2 list empty')
  assert(
    c3.directQuery?.relations.some((x) => x.value === 'Villa Love'),
    'C2 zero keeps place',
  )

  // 2028 replace date
  const r4 = mustResolved(
    resolveTaskSpec(
      makeTaskSpec({
        op: 'count',
        subject: 'wedding',
        temporal: { phrase: '2028', kind: 'range' },
        resource: { kind: 'active_collection' },
        fieldSource: {
          op: 'explicit',
          subject: 'omitted',
          resource: 'inherit',
          participant: 'omitted',
          temporal: 'explicit',
        },
      }),
      ctxWithCollection({
        locationQuery: 'Villa Love',
        dateRange: YEAR_2027,
      }),
    ),
  )
  assert(r4.collection?.filters?.dateRange?.from === YEAR_2028.from, 'C2→2028')
  assert(r4.collection?.filters?.locationQuery === 'Villa Love', 'C2 VL kept')
  const c4 = threeWay(r4)
  const e4 = executeDomainQueryOnRows(ROWS, c4.directQuery!)
  assert(e4.ok && e4.observation.totalCount === 1, 'C2 VL 2028=1')
}

// ========== CHAIN 3 — composed venue+date + money ==========
{
  const filters = {
    locationQuery: 'Villa Love',
    dateRange: { from: AUGUST.from, to: AUGUST.to },
  }
  const baseCtx = ctxWithCollection(filters)

  const count = threeWay(
    mustResolved(
      resolveTaskSpec(
        makeTaskSpec({
          op: 'count',
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
        baseCtx,
      ),
    ),
  )
  const ec = executeDomainQueryOnRows(ROWS, count.directQuery!)
  assert(ec.ok && ec.observation.totalCount === 1, 'C3 count=1')

  for (const [metric, expected] of [
    ['contract_value', 10000],
    ['paid', 1000],
    ['remaining', 9000],
  ] as const) {
    const r = threeWay(
      mustResolved(
        resolveTaskSpec(
          makeTaskSpec({
            op: 'sum',
            subject: metric,
            resource: { kind: 'active_collection' },
            fieldSource: {
              op: 'explicit',
              subject: 'explicit',
              resource: 'inherit',
              participant: 'omitted',
              temporal: 'omitted',
            },
          }),
          baseCtx,
        ),
      ),
    )
    const ex = executeDomainQueryOnRows(ROWS, r.directQuery!)
    assert(ex.ok && ex.observation.amount === expected, `C3 ${metric}=${expected}`)
  }
}

// ========== CHAIN 4 — replacement ==========
{
  // venue A + year → venue B, year kept
  const r1 = mustResolved(
    resolveTaskSpec(
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
      ctxWithCollection({
        locationQuery: 'Villa Love',
        dateRange: YEAR_2027,
      }),
    ),
  )
  assert(r1.collection?.filters?.locationQuery === 'Hotel Stary', 'C4 venue replace')
  assert(r1.collection?.filters?.dateRange?.from === YEAR_2027.from, 'C4 year kept')
  threeWay(r1)

  // venue B + year X → year Y, venue kept
  const r2 = mustResolved(
    resolveTaskSpec(
      makeTaskSpec({
        op: 'count',
        subject: 'wedding',
        temporal: { phrase: '2028', kind: 'range' },
        resource: { kind: 'active_collection' },
        fieldSource: {
          op: 'explicit',
          subject: 'omitted',
          resource: 'inherit',
          participant: 'omitted',
          temporal: 'explicit',
        },
      }),
      ctxWithCollection({
        locationQuery: 'Hotel Stary',
        dateRange: YEAR_2027,
      }),
    ),
  )
  assert(r2.collection?.filters?.locationQuery === 'Hotel Stary', 'C4 venue kept')
  assert(r2.collection?.filters?.dateRange?.from === YEAR_2028.from, 'C4 year replace')
  threeWay(r2)
}

// ========== CHAIN 5 — reset ==========
{
  clearAssistantV4ShadowSession()
  const fresh = emptyV4ShadowContext()
  assert(fresh.activeCollection == null, 'C5 fresh no collection')
  const r = mustResolved(
    resolveTaskSpec(
      makeTaskSpec({ op: 'count', subject: 'wedding' }),
      fresh,
    ),
  )
  assert(
    !r.collection?.filters?.locationQuery && !r.collection?.filters?.dateRange,
    'C5 no inherited filters',
  )
  threeWay(r)
}

console.log('G3 direct DomainQuery compiler acceptance — ALL PASS')
