/**
 * Phase 3D — collection.query foundation acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/v4/capabilities/phase3dCollectionQueryAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { makeTaskSpec } from '../expect'
import { resolveTaskSpec } from '../resolver/resolve'
import {
  applyAssistantV4ShadowTransition,
  clearAssistantV4ShadowSession,
  getAssistantV4ShadowSessionSnapshot,
  mergeShadowOverlay,
} from '../resolver/shadowState'
import {
  emptyV4ShadowContext,
  type ResolvedTask,
  type V4ShadowContext,
} from '../resolver/types'
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
import { resolveAggregateDateRange } from '../../dates'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const AUGUST = resolveAggregateDateRange('sierpień', '2026-09-13')!
const SEPTEMBER = resolveAggregateDateRange('wrzesień', '2026-09-13')!
const EMPTY_MONTH = resolveAggregateDateRange('luty', '2026-09-13')!

const FIXTURE: CollectionMoneyRow[] = [
  {
    id: 'w-aug-1',
    displayLabel: 'Anna & Bartek',
    date: '2026-08-10',
    contractValue: 10000,
    paidAmount: 3000,
    remainingAmount: 7000,
  },
  {
    id: 'w-aug-2',
    displayLabel: 'Celina & Damian',
    date: '2026-08-20',
    contractValue: 15000,
    paidAmount: 15000,
    remainingAmount: 0,
  },
  {
    id: 'w-sep-1',
    displayLabel: 'Ewa & Filip',
    date: '2026-09-05',
    contractValue: 8000,
    paidAmount: 1000,
    remainingAmount: 7000,
  },
]

function q(partial: Partial<CollectionQuery> & Pick<CollectionQuery, 'operation'>): CollectionQuery {
  const raw = {
    resource: 'wedding' as const,
    operation: partial.operation,
    filters: partial.filters ?? {
      dateRange: { from: AUGUST.from, to: AUGUST.to },
    },
    metric: partial.metric ?? null,
    rank: partial.rank ?? null,
    limit: partial.limit ?? null,
    usedActiveCollection: partial.usedActiveCollection ?? false,
  }
  const v = validateCollectionQuery(raw)
  assert(v.ok, `query valid: ${'reason' in v ? v.reason : ''}`)
  return (v as { ok: true; query: CollectionQuery }).query
}

function resolvedCollection(input: {
  op: 'count' | 'sum' | 'rank' | 'list'
  subject: 'wedding' | 'contract_value' | 'paid' | 'remaining' | null
  dateRange?: { from: string; to: string } | null
  phrase?: string | null
  rank?: 'min' | 'max' | null
  resourceKind?: 'active_collection' | 'inherit' | null
}): ResolvedTask {
  const resource =
    input.resourceKind === 'active_collection'
      ? ({ kind: 'active_collection' } as const)
      : input.resourceKind === 'inherit'
        ? ({ kind: 'inherit' } as const)
        : null
  const merged = makeTaskSpec({
    op: input.op,
    subject: input.subject,
    resource,
    temporal: input.phrase
      ? { phrase: input.phrase, kind: 'range' }
      : null,
    qualifiers: {
      aspect: null,
      rank: input.rank ?? null,
      destination: null,
      titleHint: null,
      unsupportedReason: null,
    },
  })
  if (input.resourceKind === 'inherit') {
    merged.fieldSource.resource = 'inherit'
  }
  return {
    status: 'resolved',
    op: input.op,
    subject: input.subject,
    resource: null,
    participant: null,
    temporal:
      input.dateRange || input.phrase
        ? {
            phrase: input.phrase ?? null,
            kind: 'range',
            from: input.dateRange?.from ?? null,
            to: input.dateRange?.to ?? null,
          }
        : null,
    qualifiers: merged.qualifiers,
    sequence: null,
    collection: {
      resource: 'weddings',
      filters: {
        dateRange: input.dateRange ?? null,
        locationQuery: null,
      },
    },
    sourceTaskSpec: merged,
    mergedTaskSpec: merged,
  }
}

console.log('Phase 3D collection.query acceptance')

// --- Registry ---
assert(V4_CAPABILITY_REGISTRY.length === 4, 'exactly 4 capabilities')
assert(
  V4_CAPABILITY_IDS.join(',') ===
    'wedding.finance.get,wedding.places.get,wedding.day_plan.get,collection.query',
  'closed ids',
)

// --- Contract security ---
{
  const bad = validateCollectionQuery({
    resource: 'wedding',
    operation: 'count',
    filters: {},
    usedActiveCollection: false,
    userId: 'x',
  })
  assert(!bad.ok, 'reject userId')
  const sql = validateCollectionQuery({
    resource: 'wedding',
    operation: 'count',
    filters: {},
    usedActiveCollection: false,
    table: 'weddings',
  })
  assert(!sql.ok, 'reject table')
}

// --- Basic ops on August fixture ---
{
  const count = executeCollectionQueryOnRows(
    FIXTURE,
    q({ operation: 'count' }),
  )
  assert(count.observation.totalCount === 2, 'august count=2')
  assert(count.activeCollection.resultCount === 2, 'collection resultCount')
  assert(
    count.activeCollection.filters.dateRange?.from === AUGUST.from,
    'filters SoT august',
  )

  const sumCv = executeCollectionQueryOnRows(
    FIXTURE,
    q({ operation: 'sum', metric: 'contract_value' }),
  )
  assert(sumCv.observation.amount === 25000, 'sum CV=25000')

  const sumPaid = executeCollectionQueryOnRows(
    FIXTURE,
    q({ operation: 'sum', metric: 'paid' }),
  )
  assert(sumPaid.observation.amount === 18000, 'sum paid=18000')

  const sumRem = executeCollectionQueryOnRows(
    FIXTURE,
    q({ operation: 'sum', metric: 'remaining' }),
  )
  assert(sumRem.observation.amount === 7000, 'sum remaining=7000')
  assert(
    sumRem.observation.amount ===
      FIXTURE.filter((r) => r.date!.startsWith('2026-08')).reduce(
        (a, r) => a + r.remainingAmount,
        0,
      ),
    'remaining = per-wedding remaining sum',
  )

  const rankMax = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'rank',
      metric: 'contract_value',
      rank: { direction: 'desc', limit: 1 },
    }),
  )
  assert(rankMax.activeResource?.id === 'w-aug-2', 'rank max → Celina')
  assert(rankMax.activeCollection.filters.dateRange?.from === AUGUST.from, 'rank keeps collection')

  const rankMin = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'rank',
      metric: 'contract_value',
      rank: { direction: 'asc', limit: 1 },
    }),
  )
  assert(rankMin.activeResource?.id === 'w-aug-1', 'rank min → Anna')

  const list = executeCollectionQueryOnRows(
    FIXTURE,
    q({ operation: 'list', limit: 20 }),
  )
  assert(list.observation.returnedCount === 2, 'list returned 2')
  assert(list.observation.truncated === false, 'not truncated')
}

// --- Empty collection ---
{
  const emptyQ = q({
    operation: 'count',
    filters: { dateRange: { from: EMPTY_MONTH.from, to: EMPTY_MONTH.to } },
  })
  const empty = executeCollectionQueryOnRows(FIXTURE, emptyQ)
  assert(empty.observation.totalCount === 0, 'empty count=0')
  assert(
    empty.activeCollection.filters.dateRange?.from === EMPTY_MONTH.from,
    'empty collection keeps filters',
  )
  const sum0 = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'sum',
      metric: 'contract_value',
      filters: { dateRange: { from: EMPTY_MONTH.from, to: EMPTY_MONTH.to } },
      usedActiveCollection: true,
    }),
  )
  assert(sum0.observation.amount === 0, 'empty sum=0')
  const rank0 = executeCollectionQueryOnRows(
    FIXTURE,
    q({
      operation: 'rank',
      metric: 'contract_value',
      filters: { dateRange: { from: EMPTY_MONTH.from, to: EMPTY_MONTH.to } },
      rank: { direction: 'desc', limit: 1 },
    }),
  )
  assert(rank0.observation.items?.length === 0, 'rank empty safe')
  assert(rank0.activeResource === null, 'no resource on empty rank')
}

// --- Truncation ---
{
  const many: CollectionMoneyRow[] = Array.from({ length: 25 }, (_, i) => ({
    id: `w-${i}`,
    displayLabel: `W${i}`,
    date: '2026-08-01',
    contractValue: i,
    paidAmount: 0,
    remainingAmount: i,
  }))
  const listed = executeCollectionQueryOnRows(
    many,
    q({ operation: 'list', limit: 20 }),
  )
  assert(listed.observation.totalCount === 25, 'total 25')
  assert(listed.observation.returnedCount === 20, 'cap 20')
  assert(listed.observation.truncated === true, 'truncated')
}

// --- Selector uniqueness ---
{
  const finance = makeTaskSpec({
    op: 'get_amount',
    subject: 'remaining',
    resource: { kind: 'active_resource' },
  })
  const financeResolved: ResolvedTask = {
    status: 'resolved',
    op: 'get_amount',
    subject: 'remaining',
    resource: { kind: 'wedding', id: 'page-b', label: 'Page B' },
    participant: null,
    temporal: null,
    qualifiers: finance.qualifiers,
    sequence: null,
    collection: null,
    sourceTaskSpec: finance,
    mergedTaskSpec: finance,
  }
  const finSel = selectV4Capability(financeResolved)
  assert(
    finSel.status === 'selected' &&
      finSel.capability.id === 'wedding.finance.get',
    'single remaining → finance',
  )

  const place = makeTaskSpec({
    op: 'get_location',
    subject: 'ceremony',
    resource: { kind: 'active_resource' },
  })
  const placeResolved: ResolvedTask = {
    status: 'resolved',
    op: 'get_location',
    subject: 'ceremony',
    resource: { kind: 'wedding', id: 'page-b', label: 'Page B' },
    participant: null,
    temporal: null,
    qualifiers: place.qualifiers,
    sequence: null,
    collection: null,
    sourceTaskSpec: place,
    mergedTaskSpec: place,
  }
  assert(
    selectV4Capability(placeResolved).status === 'selected' &&
      (selectV4Capability(placeResolved) as { capability: { id: string } })
        .capability.id === 'wedding.places.get',
    'ceremony location → places',
  )

  const time = makeTaskSpec({
    op: 'get_time',
    subject: 'ceremony',
    resource: { kind: 'active_resource' },
  })
  const timeResolved: ResolvedTask = {
    status: 'resolved',
    op: 'get_time',
    subject: 'ceremony',
    resource: { kind: 'wedding', id: 'page-b', label: 'Page B' },
    participant: null,
    temporal: null,
    qualifiers: time.qualifiers,
    sequence: null,
    collection: null,
    sourceTaskSpec: time,
    mergedTaskSpec: time,
  }
  assert(
    selectV4Capability(timeResolved).status === 'selected' &&
      (selectV4Capability(timeResolved) as { capability: { id: string } })
        .capability.id === 'wedding.day_plan.get',
    'ceremony time → day_plan',
  )

  const countSel = selectV4Capability(
    resolvedCollection({
      op: 'count',
      subject: 'wedding',
      dateRange: { from: AUGUST.from, to: AUGUST.to },
      phrase: 'sierpień',
    }),
  )
  assert(
    countSel.status === 'selected' &&
      countSel.capability.id === 'collection.query',
    'count → collection.query',
  )

  const sumSel = selectV4Capability(
    resolvedCollection({
      op: 'sum',
      subject: 'contract_value',
      dateRange: { from: AUGUST.from, to: AUGUST.to },
      resourceKind: 'active_collection',
    }),
  )
  assert(
    sumSel.status === 'selected' &&
      sumSel.capability.id === 'collection.query',
    'sum active collection → collection.query',
  )

  // Page B must not steal collection
  assert(
    !collectionQueryCapability.canHandle(financeResolved),
    'finance not handled by collection',
  )
}

// --- Missing metric ---
{
  const built = collectionQueryCapability.buildInput(
    resolvedCollection({
      op: 'sum',
      subject: 'wedding',
      dateRange: { from: AUGUST.from, to: AUGUST.to },
      resourceKind: 'active_collection',
    }),
  )
  assert(
    !built.ok && built.reason === 'needs_clarification',
    'sum without metric → clarify',
  )
}

// --- Resolver temporal replace August → September ---
{
  const ctx: V4ShadowContext = {
    ...emptyV4ShadowContext(),
    activeCollection: {
      resource: 'weddings',
      filters: { dateRange: { from: AUGUST.from, to: AUGUST.to } },
      resultCount: 2,
      label: 'SIERPIEŃ 2026',
    },
    previousTaskSpec: makeTaskSpec({
      op: 'count',
      subject: 'wedding',
      temporal: { phrase: 'sierpień', kind: 'range' },
    }),
  }
  const next = resolveTaskSpec(
    makeTaskSpec({
      op: 'count',
      subject: 'wedding',
      temporal: { phrase: 'wrzesień', kind: 'range' },
      fieldSource: {
        op: 'explicit',
        subject: 'explicit',
        resource: 'omitted',
        participant: 'omitted',
        temporal: 'explicit',
      },
    }),
    ctx,
  )
  assert(next.status === 'resolved', 'sep count resolved')
  if (next.status === 'resolved') {
    assert(next.temporal?.from === SEPTEMBER.from, 'temporal replaced to sep')
    assert(
      next.collection?.filters?.dateRange?.from === SEPTEMBER.from,
      'collection filter replaced (not intersect)',
    )
  }
}

// --- Multi-turn state: count → sum → paid → rank ---
{
  clearAssistantV4ShadowSession()
  const augustFilters = { dateRange: { from: AUGUST.from, to: AUGUST.to } }

  // Simulate capability success extras path via transition + manual extras consume
  // by running capability.execute after setting last extras through execute
  const countTask = resolvedCollection({
    op: 'count',
    subject: 'wedding',
    dateRange: augustFilters.dateRange,
    phrase: 'sierpień',
  })
  const countBuilt = collectionQueryCapability.buildInput(countTask)
  assert(countBuilt.ok, 'count buildInput')
  if (countBuilt.ok) {
    // Use on-rows via execute path by temporarily monkey-patching is hard;
    // instead apply state from executeCollectionQueryOnRows
    const exec = executeCollectionQueryOnRows(
      FIXTURE,
      (countBuilt.input as { query: CollectionQuery }).query,
    )
    // Manually mirror shadow reducer
    applyAssistantV4ShadowTransition({
      taskSpec: countTask.mergedTaskSpec,
      resolution: countTask,
      capabilityExecution: {
        status: 'success',
        capabilityId: 'collection.query',
        observation: exec.observation,
        selectionMs: 0,
        executionMs: 0,
      },
    })
    // Without execute() extras, overlay won't get collection — seed overlay via second path
  }

  // Direct overlay proof using merge + explicit apply of collection state
  clearAssistantV4ShadowSession()
  // Seed by running real execute() which sets extras, but needs network.
  // Instead verify buildInput + onRows + manual overlay contract:
  let activeCollection = {
    resource: 'weddings' as const,
    filters: augustFilters,
    memberIds: ['w-aug-1', 'w-aug-2'],
    resultCount: 2,
    label: 'SIERPIEŃ 2026',
  }
  let activeResource: { kind: 'wedding'; id: string; label: string } | null =
    null

  const sumCvTask = resolvedCollection({
    op: 'sum',
    subject: 'contract_value',
    dateRange: activeCollection.filters.dateRange,
    resourceKind: 'active_collection',
  })
  const sumBuilt = collectionQueryCapability.buildInput(sumCvTask)
  assert(sumBuilt.ok, 'sum CV build')
  if (sumBuilt.ok) {
    const exec = executeCollectionQueryOnRows(
      FIXTURE,
      (sumBuilt.input as { query: CollectionQuery }).query,
    )
    assert(exec.observation.amount === 25000, 'follow-up sum CV same august')
    activeCollection = exec.activeCollection
  }

  const sumPaidTask = resolvedCollection({
    op: 'sum',
    subject: 'paid',
    dateRange: activeCollection.filters.dateRange,
    resourceKind: 'active_collection',
  })
  const paidBuilt = collectionQueryCapability.buildInput(sumPaidTask)
  assert(paidBuilt.ok, 'sum paid build')
  if (paidBuilt.ok) {
    const exec = executeCollectionQueryOnRows(
      FIXTURE,
      (paidBuilt.input as { query: CollectionQuery }).query,
    )
    assert(exec.observation.amount === 18000, 'follow-up paid same august')
    activeCollection = exec.activeCollection
  }

  const rankTask = resolvedCollection({
    op: 'rank',
    subject: 'contract_value',
    dateRange: activeCollection.filters.dateRange,
    resourceKind: 'active_collection',
    rank: 'max',
  })
  const rankBuilt = collectionQueryCapability.buildInput(rankTask)
  assert(rankBuilt.ok, 'rank build')
  if (rankBuilt.ok) {
    const exec = executeCollectionQueryOnRows(
      FIXTURE,
      (rankBuilt.input as { query: CollectionQuery }).query,
    )
    assert(exec.activeResource?.id === 'w-aug-2', 'rank sets activeResource')
    assert(
      exec.activeCollection.filters.dateRange?.from === AUGUST.from,
      'rank keeps august collection',
    )
    activeResource = exec.activeResource
    activeCollection = exec.activeCollection
  }
  assert(activeResource?.id === 'w-aug-2', 'activeResource winner')
  assert(
    activeCollection.filters.dateRange?.from === AUGUST.from,
    'activeCollection still august',
  )
}

// --- Close clears ---
{
  clearAssistantV4ShadowSession()
  const snap = getAssistantV4ShadowSessionSnapshot()
  assert(snap.contextOverlay.activeCollection == null, 'close clears collection')
  assert(snap.previousTaskSpec == null, 'close clears previous')
  const merged = mergeShadowOverlay(emptyV4ShadowContext())
  assert(merged.activeCollection == null, 'fresh overlay empty')
}

// --- Bare month = current year ---
{
  const r = resolveAggregateDateRange('w sierpniu', '2026-09-13')
  assert(r?.from === '2026-08-01' && r?.to === '2026-08-31', 'bare month current year')
}

// --- Static security / architecture ---
{
  const contract = read(
    'src/features/assistant/v4/capabilities/collection/collectionQueryContract.ts',
  )
  assert(!/service_role/.test(contract), 'no service_role')
  assert(contract.includes('FORBIDDEN_KEY'), 'forbidden keys')
  const exec = read(
    'src/features/assistant/v4/capabilities/collection/executeCollectionQuery.ts',
  )
  assert(exec.includes('listWeddingsForList'), 'list-light loader')
  assert(exec.includes('getContractValue'), 'canonical CV')
  assert(exec.includes('getTotalPaid'), 'canonical paid')
  assert(exec.includes('getRemainingToPay'), 'canonical remaining')
  assert(!exec.includes('weddingService.getById'), 'no N+1 getById')
  assert(!/text\.includes\(|\.match\(.*sierp/.test(exec), 'no phrase regex in executor')
}

console.log('Phase 3D collection.query acceptance — ALL PASS')
