/**
 * G4 — DomainQuery as PRIMARY V4 shadow collection executor.
 * CollectionQuery = comparison baseline only.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/domainQuery/g4DomainQueryPrimaryShadowAcceptance.test.ts
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
import {
  buildCollectionQueryFromResolved,
  setG4DisableBaselineForTests,
  stashCollectionQueryExecutionExtrasForTests,
} from '../capabilities/collection/collectionQueryCapability'
import { executeDomainQueryOnRows } from './executeDomainQuery'
import { executeCollectionDomainQueryPrimary } from './executeCollectionDomainQueryPrimary'
import { compileResolvedSemanticsToDomainQuery } from './compileResolvedSemantics'
import type { DomainQuery } from './domainQuery'
import type { CollectionQuery } from '../capabilities/collection/collectionQueryContract'

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

function execDomain(query: DomainQuery) {
  return Promise.resolve(executeDomainQueryOnRows(ROWS, query))
}

async function primary(
  resolved: ResolvedTask,
  opts?: {
    disableBaseline?: boolean
    baseline?: CollectionQuery | null
    mutateBaseline?: boolean
  },
) {
  let baseline: CollectionQuery | null | undefined = opts?.baseline
  if (baseline === undefined && !opts?.disableBaseline) {
    const built = buildCollectionQueryFromResolved(resolved)
    baseline = built.ok ? built.query : null
  }
  if (opts?.mutateBaseline && baseline) {
    baseline = {
      ...baseline,
      filters: {
        ...baseline.filters,
        locationQuery: '__MISMATCH_VENUE__',
      },
    }
  }
  return executeCollectionDomainQueryPrimary({
    resolved,
    baselineCollectionQuery: baseline ?? null,
    disableBaseline: opts?.disableBaseline,
    loadBaselineRows: async () => ROWS,
    executeDomain: async (q) => {
      const r = await execDomain(q)
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
    g4Baseline: {
      classification: result.baseline.classification,
      reasons: result.baseline.reasons,
    },
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

console.log('G4 DomainQuery primary V4 shadow acceptance')

// --- Gate: no NL / no CQ→DQ in primary modules ---
{
  const primarySrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/domainQuery/executeCollectionDomainQueryPrimary.ts',
    ),
    'utf8',
  )
  const capSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/assistant/v4/capabilities/collection/collectionQueryCapability.ts',
    ),
    'utf8',
  )
  assert(!primarySrc.includes('adaptCollectionQueryToDomainQuery'), 'E primary no adapter')
  assert(
    !/from ['"].*adaptCollectionQuery/.test(primarySrc),
    'E primary no adapt import',
  )
  assert(
    capSrc.includes('executeCollectionDomainQueryPrimary'),
    'capability uses G4 primary',
  )
  assert(
    !/adaptCollectionQueryToDomainQuery/.test(capSrc),
    'E capability no adapter call',
  )
  assert(!/new RegExp|\.match\(\//.test(primarySrc), 'no regex in primary')
  assert(!/przyszłymi? roku|Villa Love/.test(primarySrc), 'no venue/phrase heuristics')
}

// ========== AUTHORITY A — baseline disabled ==========
{
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
  setG4DisableBaselineForTests(true)
  const out = await primary(r, { disableBaseline: true })
  setG4DisableBaselineForTests(false)
  assert(out.ok, 'A primary ok without baseline')
  if (out.ok) {
    assert(out.result.observation.kind === 'domain_query', 'A domain_query obs')
    assert(out.result.observation.totalCount === 2, 'A count=2')
    assert(
      out.result.baseline.classification === 'baseline_skipped',
      'A baseline skipped',
    )
  }
}

// ========== AUTHORITY B — DomainQuery before baseline compare ==========
{
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
  let domainDone = false
  const built = buildCollectionQueryFromResolved(r)
  assert(built.ok, 'B baseline build')
  const out = await executeCollectionDomainQueryPrimary({
    resolved: r,
    baselineCollectionQuery: built.ok ? built.query : null,
    loadBaselineRows: async () => ROWS,
    executeDomain: async (q) => {
      const res = executeDomainQueryOnRows(ROWS, q)
      domainDone = true
      if (!res.ok) throw new Error(res.failure.detail)
      return res
    },
  })
  assert(domainDone && out.ok, 'B domain executed first')
  assert(out.ok && out.result.observation.kind === 'domain_query', 'B primary obs')
  assert(
    out.ok && out.result.baseline.classification === 'agree',
    'B baseline after domain',
  )
}

// ========== AUTHORITY D — baseline exception does not break primary ==========
{
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
  const built = buildCollectionQueryFromResolved(r)
  assert(built.ok, 'D baseline')
  const broken = await executeCollectionDomainQueryPrimary({
    resolved: r,
    baselineCollectionQuery: built.ok ? built.query : null,
    loadBaselineRows: async () => {
      throw new Error('baseline_boom')
    },
    executeDomain: async (q) => {
      const res = executeDomainQueryOnRows(ROWS, q)
      if (!res.ok) throw new Error(res.failure.detail)
      return res
    },
  })
  assert(broken.ok, 'D primary still ok')
  if (broken.ok) {
    assert(
      broken.result.baseline.classification === 'baseline_error',
      'D baseline_error',
    )
    assert(broken.result.observation.totalCount === 2, 'D primary count intact')
  }
}

// ========== AUTHORITY C — mismatch does not mutate primary ==========
{
  const r = mustResolved(
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
  const out = await primary(r, { mutateBaseline: true })
  assert(out.ok, 'C primary ok despite mismatch')
  if (out.ok) {
    assert(out.result.baseline.classification === 'mismatch', 'C mismatch class')
    assert(out.result.observation.totalCount === 1, 'C primary still VL aug=1')
    assert(
      out.result.domainQuery.relations.some(
        (rel) => rel.field === 'place.name' && rel.value === 'Villa Love',
      ),
      'C primary query still Villa Love',
    )
  }
}

// ========== AUTHORITY E — already covered by source gate ==========
console.log('  authority A–E ok')

// ========== CHAIN A — MONTH ==========
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
  assert(p1.ok && p1.result.observation.totalCount === 2, 'A count aug=2')
  if (p1.ok) applyPrimaryToShadow(r1, p1.result)

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
  assert(r2.collection?.filters?.dateRange?.from === AUGUST.from, 'A list inherits aug')
  const p2 = await primary(r2)
  assert(p2.ok && p2.result.observation.aggregate === 'list', 'A list')
  assert(p2.ok && p2.result.observation.totalCount === 2, 'A list count')
  if (p2.ok) applyPrimaryToShadow(r2, p2.result)

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
      shadowCtx(),
    ),
  )
  const p3 = await primary(r3)
  assert(p3.ok && p3.result.observation.amount === 9000, 'A remaining 9k')
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
  assert(r4.collection?.filters?.dateRange?.from === SEPTEMBER.from, 'A sep replaces')
  const p4 = await primary(r4)
  assert(p4.ok && p4.result.observation.totalCount === 1, 'A sep list=1')
  console.log('  chain A ok')
}

// ========== CHAIN B — ZERO RESULT ==========
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
  assert(p1.ok && p1.result.observation.totalCount === 3, 'B VL all')
  if (p1.ok) applyPrimaryToShadow(r1, p1.result)

  // Force 2027 (zero VL) via explicit temporal on active collection
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
  assert(r2.collection?.filters?.locationQuery === 'Villa Love', 'B venue retained')
  assert(r2.collection?.filters?.dateRange?.from === YEAR_2027.from, 'B 2027')
  const p2 = await primary(r2)
  assert(p2.ok && p2.result.observation.totalCount === 0, 'B count 0')
  if (p2.ok) {
    assert(p2.result.activeCollection.query.dateBinding?.range.from === YEAR_2027.from, 'B query date')
    assert(
      p2.result.activeCollection.query.relations.some(
        (x) => x.field === 'place.name' && x.value === 'Villa Love',
      ),
      'B query place',
    )
    applyPrimaryToShadow(r2, p2.result)
  }

  const zeroCtx = shadowCtx()
  assert(zeroCtx.activeCollection?.resultCount === 0, 'B shadow resultCount 0')
  assert(zeroCtx.activeCollection?.query != null, 'B DomainQuery identity kept')

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
      zeroCtx,
    ),
  )
  const p3 = await primary(r3)
  assert(p3.ok && p3.result.observation.totalCount === 0, 'B list []')
  if (p3.ok) applyPrimaryToShadow(r3, p3.result)

  const r4 = mustResolved(
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
      shadowCtx(),
    ),
  )
  const p4 = await primary(r4)
  assert(p4.ok && p4.result.observation.amount === 0, 'B sum rem 0')
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
  assert(r5.collection?.filters?.locationQuery === 'Villa Love', 'B 2028 keeps venue')
  const p5 = await primary(r5)
  assert(p5.ok && p5.result.observation.totalCount === 1, 'B 2028 VL=1')
  assert(
    p5.ok &&
      (p5.result.observation.items?.[0]?.resource.id === 'vl-2028' ||
        p5.result.activeCollection.memberIds.includes('vl-2028')),
    'B vl-2028 member',
  )
  console.log('  chain B ok')
}

// ========== CHAIN C — MONEY ==========
{
  clearAssistantV4ShadowSession()
  const r0 = mustResolved(
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
  const p0 = await primary(r0)
  assert(p0.ok && p0.result.observation.totalCount === 1, 'C seed')
  if (p0.ok) applyPrimaryToShadow(r0, p0.result)

  for (const [subject, expected] of [
    ['contract_value', 10000],
    ['paid', 1000],
    ['remaining', 9000],
  ] as const) {
    const r = mustResolved(
      resolveTaskSpec(
        makeTaskSpec({
          op: 'sum',
          subject,
          resource: { kind: 'active_collection' },
          fieldSource: {
            op: 'explicit',
            subject: 'explicit',
            resource: 'inherit',
            participant: 'omitted',
            temporal: 'omitted',
          },
        }),
        shadowCtx(),
      ),
    )
    const p = await primary(r)
    assert(p.ok && p.result.observation.amount === expected, `C sum ${subject}`)
    if (p.ok) applyPrimaryToShadow(r, p.result)
  }
  console.log('  chain C ok')
}

// ========== CHAIN D — FILTER REPLACEMENT ==========
{
  clearAssistantV4ShadowSession()
  const r1 = mustResolved(
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
  const p1 = await primary(r1)
  assert(p1.ok && p1.result.observation.totalCount === 0, 'D VL+2027=0')
  if (p1.ok) applyPrimaryToShadow(r1, p1.result)

  // replace venue → Hotel Stary, keep 2027
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
  assert(r2.collection?.filters?.dateRange?.from === YEAR_2027.from, 'D year retained')
  assert(r2.collection?.filters?.locationQuery === 'Hotel Stary', 'D venue B')
  const p2 = await primary(r2)
  assert(p2.ok && p2.result.observation.totalCount === 1, 'D HS 2027=1')
  if (p2.ok) applyPrimaryToShadow(r2, p2.result)

  // replace year → 2028, keep Hotel Stary (no HS in 2028 → 0)
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
  assert(r3.collection?.filters?.locationQuery === 'Hotel Stary', 'D venue B retained')
  assert(r3.collection?.filters?.dateRange?.from === YEAR_2028.from, 'D year Y')
  const p3 = await primary(r3)
  assert(p3.ok && p3.result.observation.totalCount === 0, 'D HS 2028=0')
  console.log('  chain D ok')
}

// ========== CHAIN E — RESET ==========
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
  assert(p.ok, 'E seed')
  if (p.ok) applyPrimaryToShadow(r, p.result)
  assert(shadowCtx().activeCollection != null, 'E has collection')
  clearAssistantV4ShadowSession()
  assert(shadowCtx().activeCollection == null, 'E fresh no collection')
  console.log('  chain E ok')
}

// ========== unsupported_direct honest ==========
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
  assert(c.status === 'unsupported', 'rank unsupported_direct')
  const out = await primary(r, { disableBaseline: true })
  assert(!out.ok && out.classification === 'unsupported_direct', 'rank not silent CQ')
}

console.log('G4 DomainQuery primary V4 shadow acceptance: PASS')
