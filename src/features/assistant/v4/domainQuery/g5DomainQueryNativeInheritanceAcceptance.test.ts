/**
 * G5 — DomainQuery-native Context Resolver inheritance.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/domainQuery/g5DomainQueryNativeInheritanceAcceptance.test.ts
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
import type { CollectionMoneyRow } from '../capabilities/collection/executeCollectionQuery'
import { stashCollectionQueryExecutionExtrasForTests } from '../capabilities/collection/collectionQueryCapability'
import { executeDomainQueryOnRows } from './executeDomainQuery'
import { executeCollectionDomainQueryPrimary } from './executeCollectionDomainQueryPrimary'
import { compileResolvedSemanticsToDomainQuery } from './compileResolvedSemantics'
import { emptyDomainQuery, type DomainQuery } from './domainQuery'
import { extractInheritedSemanticsFromDomainQuery } from './extractInheritedSemantics'
import { domainQueryToLegacyFilters } from './domainQueryToLegacyFilters'

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

function mustResolved(result: ReturnType<typeof resolveTaskSpec>): ResolvedTask {
  assert(result.status === 'resolved', `resolved got ${result.status}`)
  return result as ResolvedTask
}

function dq(partial: Partial<DomainQuery>): DomainQuery {
  return emptyDomainQuery(partial)
}

function placeVillaLove2027(measure: DomainQuery['measure'] = null): DomainQuery {
  return dq({
    aggregate: measure ? 'sum' : 'count',
    measure,
    dateBinding: { dimension: 'wedding.date', range: YEAR_2027 },
    relations: [
      { relation: 'place', field: 'place.name', op: 'contains', value: 'Villa Love' },
    ],
  })
}

function ctxWithQuery(
  query: DomainQuery,
  extras?: {
    filters?: V4ShadowContext['activeCollection'] extends infer A
      ? A extends { filters?: infer F }
        ? F
        : never
      : never
    memberIds?: string[]
    resultCount?: number
  },
): V4ShadowContext {
  return {
    ...emptyV4ShadowContext(),
    activeCollection: {
      resource: 'weddings',
      query,
      // Intentionally omit filters unless test injects stale ones.
      filters: extras?.filters,
      memberIds: extras?.memberIds,
      resultCount: extras?.resultCount ?? 0,
    },
  }
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

function inheritSpec(op: 'count' | 'list' | 'sum', subject: string | null) {
  return makeTaskSpec({
    op,
    subject: subject as never,
    resource: { kind: 'active_collection' },
    fieldSource: {
      op: 'explicit',
      subject: subject ? 'explicit' : 'omitted',
      resource: 'inherit',
      participant: 'omitted',
      temporal: 'omitted',
    },
  })
}

console.log('G5 DomainQuery-native inheritance acceptance')

// --- Gate: no NL in inheritance / extract ---
{
  const extractSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/domainQuery/extractInheritedSemantics.ts',
    ),
    'utf8',
  )
  const resolveSrc = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/v4/resolver/resolve.ts'),
    'utf8',
  )
  assert(
    resolveSrc.includes('extractInheritedSemanticsFromDomainQuery'),
    'resolver uses extract',
  )
  assert(!/new RegExp|\.match\(\//.test(extractSrc), 'no regex in extract')
  assert(!/Villa Love|przyszł/.test(extractSrc), 'no venue/phrase in extract')
  const compileSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/domainQuery/compileResolvedSemantics.ts',
    ),
    'utf8',
  )
  assert(!/\bctx\.activeCollection\b/.test(compileSrc), 'G no ctx.activeCollection')
  assert(!compileSrc.includes('shadowState'), 'G no shadowState')
  assert(!compileSrc.includes('extractInheritedSemantics'), 'G no extract in compiler')
}

// ========== AUTHORITY A — filters absent ==========
{
  const r = mustResolved(
    resolveTaskSpec(inheritSpec('list', 'wedding'), ctxWithQuery(placeVillaLove2027())),
  )
  assert(r.collection?.filters?.locationQuery === 'Villa Love', 'A location from DQ')
  assert(r.collection?.filters?.dateRange?.from === YEAR_2027.from, 'A date from DQ')
  assert(r.temporal?.from === YEAR_2027.from, 'A temporal from DQ')
  const c = compileResolvedSemanticsToDomainQuery(r)
  assert(c.status === 'success', 'A compile ok')
  if (c.status === 'success') {
    assert(
      c.query.relations.some((x) => x.value === 'Villa Love'),
      'A compiled place',
    )
    assert(c.query.dateBinding?.range.from === YEAR_2027.from, 'A compiled date')
  }
}

// ========== AUTHORITY B — inheritance from DomainQuery ==========
{
  const slots = extractInheritedSemanticsFromDomainQuery(placeVillaLove2027())
  assert(slots?.locationQuery === 'Villa Love', 'B extract place')
  assert(slots?.dateRange?.from === YEAR_2027.from, 'B extract date')
  const r = mustResolved(
    resolveTaskSpec(inheritSpec('count', 'wedding'), ctxWithQuery(placeVillaLove2027())),
  )
  assert(r.collection?.filters?.locationQuery === slots?.locationQuery, 'B matches extract')
}

// ========== AUTHORITY C — stale filters cannot override DomainQuery ==========
{
  const r = mustResolved(
    resolveTaskSpec(
      inheritSpec('list', 'wedding'),
      ctxWithQuery(placeVillaLove2027(), {
        filters: {
          locationQuery: 'STALE_VENUE',
          dateRange: YEAR_2028,
          locationRole: 'ceremony',
        },
      }),
    ),
  )
  assert(r.collection?.filters?.locationQuery === 'Villa Love', 'C DQ wins venue')
  assert(r.collection?.filters?.dateRange?.from === YEAR_2027.from, 'C DQ wins date')
  assert(r.collection?.filters?.locationRole === 'any', 'C DQ role not stale ceremony')
}

// ========== AUTHORITY D — memberIds do not affect inheritance ==========
{
  const r = mustResolved(
    resolveTaskSpec(
      inheritSpec('list', 'wedding'),
      ctxWithQuery(placeVillaLove2027(), {
        memberIds: ['wrong-a', 'wrong-b'],
        resultCount: 99,
      }),
    ),
  )
  assert(r.collection?.filters?.locationQuery === 'Villa Love', 'D venue from DQ')
  assert(r.collection?.memberIds?.length === 2, 'D memberIds carried as cache only')
  const c = compileResolvedSemanticsToDomainQuery(r)
  assert(c.status === 'success', 'D compile ignores memberIds')
  if (c.status === 'success') {
    const exec = executeDomainQueryOnRows(ROWS, c.query)
    assert(exec.ok && exec.observation.totalCount === 0, 'D exec from DQ filters=0')
  }
}

// ========== AUTHORITY E — zero-result query inherits ==========
{
  const zeroQ = placeVillaLove2027()
  const r = mustResolved(
    resolveTaskSpec(
      inheritSpec('list', 'wedding'),
      ctxWithQuery(zeroQ, { memberIds: [], resultCount: 0 }),
    ),
  )
  assert(r.collection?.resultCount === 0, 'E zero kept on collection')
  assert(r.collection?.filters?.locationQuery === 'Villa Love', 'E venue alive')
  assert(r.collection?.filters?.dateRange?.from === YEAR_2027.from, 'E date alive')
}

// ========== AUTHORITY F — explicit overrides inherited ==========
{
  const rDate = mustResolved(
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
      ctxWithQuery(placeVillaLove2027()),
    ),
  )
  assert(rDate.collection?.filters?.dateRange?.from === YEAR_2028.from, 'F date→2028')
  assert(rDate.collection?.filters?.locationQuery === 'Villa Love', 'F venue kept')

  const rVenue = mustResolved(
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
        resource: { kind: 'active_collection' },
        fieldSource: {
          op: 'explicit',
          subject: 'omitted',
          resource: 'inherit',
          participant: 'omitted',
          temporal: 'omitted',
        },
      }),
      ctxWithQuery(placeVillaLove2027()),
    ),
  )
  assert(rVenue.collection?.filters?.locationQuery === 'Hotel Stary', 'F venue→HS')
  assert(rVenue.collection?.filters?.dateRange?.from === YEAR_2027.from, 'F year kept')
}

// ========== AUTHORITY G — compiler does not read collection state ==========
{
  // Proven by source gate above + ResolvedTask-only compile with no ctx.
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
  const c = compileResolvedSemanticsToDomainQuery(r)
  assert(c.status === 'success', 'G compile from ResolvedTask alone')
}

console.log('  authority A–G ok')

// ========== CHAIN 1 — MONTH ==========
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
  assert(p1.ok && p1.result.observation.totalCount === 2, 'C1 count')
  if (p1.ok) applyPrimaryToShadow(r1, p1.result)
  assert(shadowCtx().activeCollection?.query != null, 'C1 query SoT')

  const r2 = mustResolved(resolveTaskSpec(inheritSpec('list', 'wedding'), shadowCtx()))
  assert(r2.collection?.filters?.dateRange?.from === AUGUST.from, 'C1 list inherit date')
  const p2 = await primary(r2)
  assert(p2.ok && p2.result.observation.totalCount === 2, 'C1 list')
  if (p2.ok) applyPrimaryToShadow(r2, p2.result)

  const r3 = mustResolved(
    resolveTaskSpec(inheritSpec('sum', 'remaining'), shadowCtx()),
  )
  const p3 = await primary(r3)
  assert(p3.ok && p3.result.observation.amount === 9000, 'C1 remaining')
  if (p3.ok) applyPrimaryToShadow(r3, p3.result)

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
      shadowCtx(),
    ),
  )
  assert(r4.collection?.filters?.dateRange?.from === SEPTEMBER.from, 'C1 sep')
  const p4 = await primary(r4)
  assert(p4.ok && p4.result.observation.totalCount === 1, 'C1 sep list')
  console.log('  chain 1 ok')
}

// ========== CHAIN 2 — ZERO RESULT ==========
{
  clearAssistantV4ShadowSession()
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
  const p1 = await primary(r1)
  assert(p1.ok, 'C2 VL')
  if (p1.ok) applyPrimaryToShadow(r1, p1.result)

  const r2 = mustResolved(
    resolveTaskSpec(
      makeTaskSpec({
        op: 'count',
        subject: 'wedding',
        temporal: { phrase: '2027', kind: 'range' },
        resource: { kind: 'active_collection' },
        fieldSource: {
          op: 'explicit',
          subject: 'omitted',
          resource: 'inherit',
          participant: 'omitted',
          temporal: 'explicit',
        },
      }),
      shadowCtx(),
    ),
  )
  const p2 = await primary(r2)
  assert(p2.ok && p2.result.observation.totalCount === 0, 'C2 count 0')
  if (p2.ok) {
    assert(p2.result.activeCollection.query != null, 'C2 query kept at 0')
    applyPrimaryToShadow(r2, p2.result)
  }
  assert(shadowCtx().activeCollection?.resultCount === 0, 'C2 shadow 0')
  assert(shadowCtx().activeCollection?.query != null, 'C2 query SoT at 0')
  // Stale wrong filters on session must not matter — query is SoT
  const overlay = shadowCtx()
  if (overlay.activeCollection) {
    overlay.activeCollection.filters = {
      locationQuery: 'WRONG',
      dateRange: YEAR_2028,
    }
  }

  const r3 = mustResolved(resolveTaskSpec(inheritSpec('list', 'wedding'), overlay))
  assert(r3.collection?.filters?.locationQuery === 'Villa Love', 'C2 list venue from DQ')
  assert(r3.collection?.filters?.dateRange?.from === YEAR_2027.from, 'C2 list 2027 from DQ')
  const p3 = await primary(r3)
  assert(p3.ok && p3.result.observation.totalCount === 0, 'C2 list []')
  if (p3.ok) applyPrimaryToShadow(r3, p3.result)

  const r4 = mustResolved(
    resolveTaskSpec(inheritSpec('sum', 'remaining'), shadowCtx()),
  )
  const p4 = await primary(r4)
  assert(p4.ok && p4.result.observation.amount === 0, 'C2 sum 0')
  if (p4.ok) applyPrimaryToShadow(r4, p4.result)

  const r5 = mustResolved(
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
      shadowCtx(),
    ),
  )
  assert(r5.collection?.filters?.locationQuery === 'Villa Love', 'C2 2028 keeps venue')
  const p5 = await primary(r5)
  assert(p5.ok && p5.result.observation.totalCount === 1, 'C2 2028=1')
  assert(
    p5.ok && p5.result.activeCollection.memberIds.includes('vl-2028'),
    'C2 vl-2028',
  )
  console.log('  chain 2 ok')
}

// ========== CHAIN 3 — FILTER REPLACEMENT ==========
{
  clearAssistantV4ShadowSession()
  const seed = mustResolved(
    resolveTaskSpec(
      makeTaskSpec({
        op: 'count',
        subject: 'wedding',
        temporal: { phrase: '2027', kind: 'range' },
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
  const ps = await primary(seed)
  assert(ps.ok, 'C3 seed')
  if (ps.ok) applyPrimaryToShadow(seed, ps.result)

  const r2 = mustResolved(
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
  assert(r2.collection?.filters?.dateRange?.from === YEAR_2027.from, 'C3 year kept')
  assert(r2.collection?.filters?.locationQuery === 'Hotel Stary', 'C3 venue B')
  const p2 = await primary(r2)
  assert(p2.ok && p2.result.observation.totalCount === 1, 'C3 HS 2027')
  if (p2.ok) applyPrimaryToShadow(r2, p2.result)

  const r3 = mustResolved(
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
      shadowCtx(),
    ),
  )
  assert(r3.collection?.filters?.locationQuery === 'Hotel Stary', 'C3 venue B kept')
  assert(r3.collection?.filters?.dateRange?.from === YEAR_2028.from, 'C3 year Y')
  console.log('  chain 3 ok')
}

// ========== CHAIN 4 — MEASURE ON SAME FILTER IDENTITY ==========
{
  clearAssistantV4ShadowSession()
  const seed = mustResolved(
    resolveTaskSpec(
      makeTaskSpec({
        op: 'count',
        subject: 'wedding',
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
  )
  const ps = await primary(seed)
  assert(ps.ok && ps.result.observation.totalCount === 1, 'C4 seed')
  if (ps.ok) applyPrimaryToShadow(seed, ps.result)

  for (const [subject, expected] of [
    ['contract_value', 10000],
    ['paid', 1000],
    ['remaining', 9000],
  ] as const) {
    const r = mustResolved(
      resolveTaskSpec(inheritSpec('sum', subject), shadowCtx()),
    )
    assert(r.collection?.filters?.locationQuery === 'Villa Love', `C4 ${subject} venue`)
    assert(r.collection?.filters?.dateRange?.from === AUGUST.from, `C4 ${subject} date`)
    const p = await primary(r)
    assert(p.ok && p.result.observation.amount === expected, `C4 sum ${subject}`)
    if (p.ok) applyPrimaryToShadow(r, p.result)
  }
  console.log('  chain 4 ok')
}

// ========== CHAIN 5 — RESET ==========
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
  assert(p.ok, 'C5 seed')
  if (p.ok) applyPrimaryToShadow(r, p.result)
  assert(shadowCtx().activeCollection?.query != null, 'C5 has DQ')
  clearAssistantV4ShadowSession()
  assert(shadowCtx().activeCollection == null, 'C5 cleared')
  console.log('  chain 5 ok')
}

// Legacy filters derive FROM DomainQuery (compat only)
{
  const filters = domainQueryToLegacyFilters(placeVillaLove2027())
  assert(filters.locationQuery === 'Villa Love', 'compat derive place')
  assert(filters.dateRange?.from === YEAR_2027.from, 'compat derive date')
}

console.log('G5 DomainQuery-native inheritance acceptance: PASS')
