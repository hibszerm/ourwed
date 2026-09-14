/**
 * Phase 3D.1 — collection remaining / finance metric follow-up.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/api/phase3d1CollectionRemainingAcceptance.test.ts
 */

import {
  inferFinanceAspectFromUtterance,
  parseAssistantSemanticRequest,
  refineSemanticRequestFromUtterance,
} from './intentParse'
import { emptyWorkingContext } from './workingContext'
import {
  tryDeterministicCollectionFinanceFollowUp,
  weddingFinancesToCollectionSumPlan,
} from '../orchestration/clarificationState'
import { makeTaskSpec } from '../v4/expect'
import { resolveTaskSpec } from '../v4/resolver/resolve'
import { emptyV4ShadowContext } from '../v4/resolver/types'
import { selectV4Capability } from '../v4/capabilities/selector'
import { collectionQueryCapability } from '../v4/capabilities/collection/collectionQueryCapability'
import { resolveAggregateDateRange } from '../dates'
import { V4_CAPABILITY_REGISTRY } from '../v4/capabilities/registry'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

const AUGUST = resolveAggregateDateRange('sierpień', '2026-09-13')!
const SEPTEMBER = resolveAggregateDateRange('wrzesień', '2026-09-13')!

function ctxWithAugust() {
  const ctx = emptyWorkingContext()
  ctx.activeCollection = {
    resource: 'weddings',
    filters: { dateRange: { from: AUGUST.from, to: AUGUST.to } },
    memberIds: ['w1', 'w2'],
    resultCount: 2,
    label: 'SIERPIEŃ 2026',
  }
  ctx.lastResolvedRequest = {
    goalType: 'list',
    placeScope: null,
  }
  return ctx
}

console.log('Phase 3D.1 collection remaining follow-up acceptance')

// --- Metric inference (general cues, not one sentence) ---
assert(
  inferFinanceAspectFromUtterance('a ile jeszcze zostało?') === 'remaining',
  'remaining cue',
)
assert(
  inferFinanceAspectFromUtterance('a ile już wpłacili?') === 'paid',
  'paid cue',
)
assert(
  inferFinanceAspectFromUtterance('jaka jest ich łączna wartość?') ===
    'contract_value',
  'cv cue',
)

// --- Local parse + refine unrecognized ---
assert(
  parseAssistantSemanticRequest('a ile jeszcze zostało?').kind ===
    'wedding_finances',
  'parse finances',
)
{
  const refined = refineSemanticRequestFromUtterance(
    { kind: 'unrecognized' },
    'a ile jeszcze zostało?',
  )
  assert(
    refined.kind === 'wedding_finances' &&
      refined.financeAspect === 'remaining',
    'refine unrecognized → remaining finances',
  )
}

// --- Deterministic collection sum plans ---
{
  const plan = tryDeterministicCollectionFinanceFollowUp({
    utterance: 'a ile jeszcze zostało?',
    workingContext: ctxWithAugust(),
  })
  assert(plan?.operation === 'sum', 'remaining → sum')
  assert(plan?.field === 'remainingAmount', 'field remaining')
  assert(plan?.target === 'active_collection', 'target collection')
  assert(plan?.filters?.useActiveCollection === true, 'use active')
  assert(plan?.resource === 'weddings', 'resource weddings')
}

{
  const plan = tryDeterministicCollectionFinanceFollowUp({
    utterance: 'a ile już wpłacili?',
    workingContext: ctxWithAugust(),
  })
  assert(plan?.field === 'paidAmount', 'paid follow-up')
}

{
  const plan = tryDeterministicCollectionFinanceFollowUp({
    utterance: 'jaka jest ich łączna wartość?',
    workingContext: ctxWithAugust(),
  })
  assert(plan?.field === 'contractValue', 'cv follow-up')
}

// Order independence: count → remaining (no CV/paid required)
{
  const ctx = ctxWithAugust()
  ctx.lastResolvedRequest = { goalType: 'count' }
  const plan = tryDeterministicCollectionFinanceFollowUp({
    utterance: 'a ile jeszcze zostało?',
    workingContext: ctx,
  })
  assert(plan?.field === 'remainingAmount', 'count → remaining')
}

// List → remaining
{
  const ctx = ctxWithAugust()
  ctx.lastResolvedRequest = { goalType: 'list' }
  const plan = tryDeterministicCollectionFinanceFollowUp({
    utterance: 'a ile jeszcze zostało?',
    workingContext: ctx,
  })
  assert(plan?.field === 'remainingAmount', 'list → remaining')
}

// August → September filters then remaining keeps September
{
  const ctx = ctxWithAugust()
  ctx.activeCollection = {
    resource: 'weddings',
    filters: { dateRange: { from: SEPTEMBER.from, to: SEPTEMBER.to } },
    resultCount: 4,
    label: 'WRZESIEŃ 2026',
  }
  const plan = tryDeterministicCollectionFinanceFollowUp({
    utterance: 'a ile jeszcze zostało?',
    workingContext: ctx,
  })
  assert(plan?.target === 'active_collection', 'sep remaining target')
  // Plan inherits filters via useActiveCollection — executor reads September
  assert(plan?.filters?.useActiveCollection === true, 'sep use active')
}

// Empty collection still valid target
{
  const ctx = ctxWithAugust()
  ctx.activeCollection = {
    resource: 'weddings',
    filters: { dateRange: { from: '2026-02-01', to: '2026-02-28' } },
    memberIds: [],
    resultCount: 0,
    label: 'LUTY 2026',
  }
  const plan = tryDeterministicCollectionFinanceFollowUp({
    utterance: 'a ile jeszcze zostało?',
    workingContext: ctx,
  })
  assert(plan?.operation === 'sum', 'empty collection still sum')
}

// No activeCollection → null (single-wedding path must remain)
{
  const ctx = emptyWorkingContext()
  ctx.activeResource = {
    kind: 'wedding',
    id: 'page-b',
    displayLabel: 'Page B',
  }
  const plan = tryDeterministicCollectionFinanceFollowUp({
    utterance: 'a ile jeszcze zostało?',
    workingContext: ctx,
  })
  assert(plan === null, 'no collection → no aggregate hijack')
}

// Named person → null (single-resource)
{
  const plan = tryDeterministicCollectionFinanceFollowUp({
    utterance: 'ile Julia ma do zapłaty?',
    workingContext: ctxWithAugust(),
  })
  assert(plan === null, 'named person stays single-wedding')
}

// weddingFinancesToCollectionSumPlan rewrite
{
  const semantic = {
    kind: 'wedding_finances' as const,
    resolver: { personQuery: null, dateHint: null, weddingId: null },
    financeAspect: 'remaining' as const,
  }
  const plan = weddingFinancesToCollectionSumPlan({
    semantic,
    workingContext: ctxWithAugust(),
    utterance: 'a ile jeszcze zostało?',
  })
  assert(plan?.field === 'remainingAmount', 'rewrite remaining')
}

// Page wedding alone: semantic stays finances (not rewritten without collection)
{
  const ctx = emptyWorkingContext()
  ctx.activeResource = {
    kind: 'wedding',
    id: 'page-b',
    displayLabel: 'Page B',
  }
  const semantic = {
    kind: 'wedding_finances' as const,
    resolver: { personQuery: null, dateHint: null, weddingId: null },
    financeAspect: 'remaining' as const,
  }
  assert(
    weddingFinancesToCollectionSumPlan({
      semantic,
      workingContext: ctx,
    }) === null,
    'single wedding not rewritten to collection',
  )
}

// --- V4: inherit after list + remaining → sum ---
{
  const ctx = emptyV4ShadowContext()
  ctx.activeCollection = {
    resource: 'weddings',
    filters: { dateRange: { from: AUGUST.from, to: AUGUST.to } },
    resultCount: 2,
  }
  ctx.previousTaskSpec = makeTaskSpec({
    op: 'list',
    subject: 'wedding',
    resource: { kind: 'active_collection' },
  })
  const inherit = makeTaskSpec({
    op: 'inherit',
    subject: 'remaining',
    resource: { kind: 'active_collection' },
    fieldSource: {
      op: 'inherit',
      subject: 'explicit',
      resource: 'inherit',
      participant: 'omitted',
      temporal: 'inherit',
    },
  })
  const resolved = resolveTaskSpec(inherit, ctx)
  assert(resolved.status === 'resolved', 'v4 inherit remaining resolved')
  if (resolved.status === 'resolved') {
    assert(resolved.op === 'sum', 'v4 inherit → sum not list')
    assert(resolved.subject === 'remaining', 'subject remaining')
    assert(
      resolved.collection?.filters?.dateRange?.from === AUGUST.from,
      'filters unchanged',
    )
    const sel = selectV4Capability(resolved)
    assert(
      sel.status === 'selected' && sel.capability.id === 'collection.query',
      '→ collection.query',
    )
    const built = collectionQueryCapability.buildInput(resolved)
    assert(
      built.ok &&
        built.input &&
        'query' in built.input &&
        built.input.query.operation === 'sum' &&
        built.input.query.metric === 'remaining',
      'CollectionQuery sum remaining',
    )
  }
}

// V4 get_amount + active_collection → sum
{
  const ctx = emptyV4ShadowContext()
  ctx.activeCollection = {
    resource: 'weddings',
    filters: { dateRange: { from: AUGUST.from, to: AUGUST.to } },
  }
  const spec = makeTaskSpec({
    op: 'get_amount',
    subject: 'remaining',
    resource: { kind: 'active_collection' },
  })
  const resolved = resolveTaskSpec(spec, ctx)
  assert(
    resolved.status === 'resolved' && resolved.op === 'sum',
    'get_amount+collection → sum',
  )
}

// V4 single wedding remaining still finance
{
  const ctx = emptyV4ShadowContext()
  ctx.activeResource = { kind: 'wedding', id: 'page-b', label: 'Page B' }
  const spec = makeTaskSpec({
    op: 'get_amount',
    subject: 'remaining',
    resource: { kind: 'active_resource' },
  })
  const resolved = resolveTaskSpec(spec, ctx)
  assert(resolved.status === 'resolved', 'single remaining resolved')
  if (resolved.status === 'resolved') {
    assert(resolved.op === 'get_amount', 'stays get_amount')
    const sel = selectV4Capability(resolved)
    assert(
      sel.status === 'selected' &&
        sel.capability.id === 'wedding.finance.get',
      '→ wedding.finance.get',
    )
  }
}

// Registry still 4
assert(V4_CAPABILITY_REGISTRY.length === 4, 'exactly 4 capabilities')

console.log('Phase 3D.1 collection remaining follow-up — ALL PASS')
