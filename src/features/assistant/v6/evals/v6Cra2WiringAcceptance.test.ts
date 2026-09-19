import assert from 'node:assert/strict'
import type { CollectionMoneyRow } from '../../v4/capabilities/collection/executeCollectionQuery'
import {
  mapConceptFilter,
  mapNativeAggregateArgs,
  mapNativeQueryArgs,
} from '../agent/mapNativeToolArgs'
import { checkTurnPlanCapability } from '../capability/checkTurnPlanCapability'
import {
  destroyV6CollectionSession,
  v6CollectionStore,
} from '../collections/store'
import { applySearchPlanAsync } from '../execution/applyOps'
import { executeTurnPlan } from '../turnPlan/execute'
import { parseTurnPlanWire } from '../turnPlan/parse'
import type { V6TurnPlan } from '../turnPlan/types'

const paidBag = {
  concept: 'FIN.DEPOSIT_PAID',
  cmp: 'eq',
  bool_value: true,
  number_value: null,
  string_value: null,
}

const mappedPredicate = mapConceptFilter(paidBag)
assert.ok(!('ok' in mappedPredicate))
assert.deepEqual(mappedPredicate, {
  concept: 'FIN.DEPOSIT_PAID',
  cmp: 'eq',
  value: true,
})
assert.equal(
  'ok' in
    mapConceptFilter({
      ...paidBag,
      number_value: 1,
    }),
  true,
)

const query = mapNativeQueryArgs({
  source: 'wedding',
  filters: null,
  concept_filters: [paidBag],
  exclude_place: null,
  temporal: null,
  sort: { field: 'FIN.AGREED_DEPOSIT', direction: 'desc' },
  slice: null,
})
assert.equal(query.ok, true)
if (query.ok) assert.equal(query.value.conceptFilters?.[0]?.value, true)

assert.equal(
  mapNativeAggregateArgs({
    collection: 'col_1',
    aggregation: 'sum',
    measure: 'FIN.AGREED_DEPOSIT',
  }).ok,
  true,
)

const inspectWire = {
  steps: [
    {
      id: 'detail',
      kind: 'INSPECT_RESOURCE',
      input_from_step: null,
      input_handle: 'col_1',
      search: null,
      transform_ops: null,
      aggregation: null,
      measure: null,
      detail_selector: null,
      inspect_concepts: ['FIN.AGREED_DEPOSIT'],
      relation: null,
      relation_limit: null,
    },
  ],
  output: {
    kind: 'DETAIL',
    from_step: 'detail',
    reason: null,
    slot: null,
    text: null,
  },
}
const parsedInspect = parseTurnPlanWire(inspectWire)
assert.equal(parsedInspect.ok, true)
if (parsedInspect.ok) {
  assert.equal(checkTurnPlanCapability(parsedInspect.plan).verdict, 'SUPPORTED')
}

const relatedWire = {
  steps: [
    {
      id: 'related',
      kind: 'LIST_RELATED',
      input_from_step: null,
      input_handle: 'col_1',
      search: null,
      transform_ops: null,
      aggregation: null,
      measure: null,
      detail_selector: null,
      inspect_concepts: null,
      relation: 'PAYMENTS',
      relation_limit: 10,
    },
  ],
  output: {
    kind: 'DETAIL',
    from_step: 'related',
    reason: null,
    slot: null,
    text: null,
  },
}
const parsedRelated = parseTurnPlanWire(relatedWire)
assert.equal(parsedRelated.ok, true)
if (parsedRelated.ok) {
  assert.equal(parsedRelated.plan.steps[0]?.kind, 'LIST_RELATED')
  assert.equal(checkTurnPlanCapability(parsedRelated.plan).verdict, 'SUPPORTED')
}

const rows = Array.from(
  { length: 201 },
  (_, index): CollectionMoneyRow => ({
    id: String(index),
    displayLabel: String(index),
    date: null,
    contractValue: 0,
    paidAmount: 0,
    remainingAmount: 0,
    locationHaystack: [],
  }),
)
const capped = await applySearchPlanAsync(rows, {
  conceptFilters: [
    { concept: 'FIN.DEPOSIT_PAID', cmp: 'eq', value: true },
  ],
})
assert.equal(capped.ok, false)
if (!capped.ok) assert.match(capped.detail, /CANDIDATE_CAP_EXCEEDED/)

destroyV6CollectionSession()
const collection = v6CollectionStore.create({
  source: 'wedding',
  semanticDefinition: {
    source: 'wedding',
    filters: [],
    conceptFilters: [],
    excludePlaces: [],
    relativeTemporal: null,
    sort: null,
    slice: null,
    transformOps: [],
  },
  ordering: null,
  totalCount: 1,
  parentHandle: null,
  createdAtTurn: 'cra2',
  fetchedAt: new Date(0).toISOString(),
  snapshotMemberIds: ['w1'],
  preview: [{ displayName: 'Anna i Jan', date: null, ordinal: 1 }],
})

const plan: V6TurnPlan = {
  steps: [
    {
      id: 'related',
      kind: 'LIST_RELATED',
      inputFromStep: null,
      inputHandle: collection.handle,
      relation: 'TASKS_OPEN',
      limit: null,
    },
  ],
  output: { kind: 'DETAIL', fromStep: 'related' },
}
const execution = await executeTurnPlan({
  plan,
  turnId: 'cra2',
  listRelatedResources: async () => ({
    ok: true,
    weddingDisplayName: 'Anna i Jan',
    result: {
      relationKey: 'TASKS_OPEN',
      items: [{ title: 'Oddać galerię' }],
      totalCount: 1,
      truncated: false,
    },
  }),
})
assert.equal(execution.completeness.ok, true)
assert.equal(
  execution.completeness.ok
    ? execution.completeness.authorizingObservation?.kind
    : null,
  'related_list',
)

destroyV6CollectionSession()
console.log('v6Cra2WiringAcceptance PASS')
