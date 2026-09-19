/**
 * CRA2 — Deterministic cross-domain composition acceptance (no live CRM).
 */

import assert from 'node:assert/strict'
import type { CollectionMoneyRow } from '../../v4/capabilities/collection/executeCollectionQuery'
import { contractService } from '@/lib/api/contractService'
import { paymentService } from '@/lib/api/paymentService'
import { taskService, type StudioTask } from '@/lib/api/taskService'
import type { Payment, Wedding, WeddingContract } from '@/types/wedding'
import {
  destroyV6CollectionSession,
  v6CollectionStore,
} from '../collections/store'
import { inspectResourceConcepts } from '../adapters/inspectResource'
import { listRelated } from '../adapters/listRelated'
import type { ConceptKey } from '../registry'
import { executeTurnPlan } from '../turnPlan/execute'
import type { V6TurnPlan } from '../turnPlan/types'

const row = (
  id: string,
  date: string,
  remainingAmount: number,
): CollectionMoneyRow => ({
  id,
  displayLabel: `Wedding ${id}`,
  date,
  contractValue: remainingAmount + 1_000,
  paidAmount: 1_000,
  remainingAmount,
  locationHaystack: [],
})

const universe = [
  row('w1', '2027-05-10', 9_000),
  row('w2', '2027-07-12', 4_000),
  row('past', '2025-01-01', 2_000),
]

const wedding = {
  id: 'w1',
  couple: {
    partner1: 'Anna',
    partner2: 'Jan',
    partner1Phone: '+48 500 100 200',
    email: '',
    phone: '',
    venue: '',
    city: 'Kraków',
  },
  date: '2027-05-10',
  ceremonyTime: '15:30',
  status: 'active',
  workflowStage: 'preparation',
  packageName: 'Reportaż',
  price: 10_000,
  depositAmount: 2_000,
  currency: 'PLN',
  packageItems: [],
  travelFeeStatus: 'charged',
  travelFeeAmount: 450,
  checklist: [],
  schedule: [],
  payments: [],
  finances: [],
  questionnaires: {
    contractData: { status: 'completed' },
    weddingQuestionnaire: { status: 'sent' },
  },
  contract: { status: 'generated' },
  notes: [],
  deliverables: [],
  timeline: [],
  accentColor: '#000000',
  createdAt: '2026-01-01T00:00:00.000Z',
} satisfies Wedding

const operationalDay = {
  status: 'ok' as const,
  weddingId: wedding.id,
  displayName: 'Anna i Jan',
  slots: [
    {
      role: 'ceremony' as const,
      label: 'Ceremonia',
      name: 'Kościół św. Anny',
      address: 'Kwiatowa 3, Kraków',
      time: '15:30',
      participantKey: null,
    },
    {
      role: 'reception' as const,
      label: 'Wesele',
      name: 'Dwór',
      address: 'Leśna 4, Kraków',
      time: '17:00',
      participantKey: null,
    },
    {
      role: 'bride_preparation' as const,
      label: 'Przygotowania panny młodej',
      name: 'Dom panny młodej',
      address: 'Kwiatowa 1, Kraków',
      time: '11:00',
      participantKey: 'partner1',
    },
    {
      role: 'groom_preparation' as const,
      label: 'Przygotowania pana młodego',
      name: 'Hotel',
      address: 'Leśna 2, Kraków',
      time: '12:00',
      participantKey: 'partner2',
    },
  ],
}

function seedCollection(ids: string[] = ['w1']) {
  destroyV6CollectionSession()
  return v6CollectionStore.create({
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
    totalCount: ids.length,
    parentHandle: null,
    createdAtTurn: 'cra2-composition',
    fetchedAt: new Date(0).toISOString(),
    snapshotMemberIds: ids,
    preview: ids.map((id, index) => ({
      displayName: `Wedding ${id}`,
      date: universe.find((item) => item.id === id)?.date ?? null,
      ordinal: index + 1,
    })),
  })
}

function transformPlan(
  handle: string,
  concept: 'FIN.DEPOSIT_PAID' | 'TASK.HAS_OPEN',
  value: boolean,
): V6TurnPlan {
  return {
    steps: [
      {
        id: 'transform',
        kind: 'TRANSFORM_COLLECTION',
        inputFromStep: null,
        inputHandle: handle,
        ops: [
          {
            op: 'ConceptFilter',
            predicate: { concept, cmp: 'eq', value },
          },
        ],
      },
    ],
    output: { kind: 'COLLECTION', fromStep: 'transform' },
  }
}

type DetailObservation = {
  kind: 'resource_detail'
  values: Array<{ concept: string; value: unknown }>
}
type RelatedObservation = {
  kind: 'related_list'
  relation: string
  items: Array<{ title: string }>
  totalCount: number
}

function detailValues(result: Awaited<ReturnType<typeof executeTurnPlan>>) {
  const observation = result.executed.at(-1)?.observation as
    | DetailObservation
    | undefined
  assert.equal(observation?.kind, 'resource_detail')
  return new Map(observation.values.map((item) => [item.concept, item.value]))
}

const contextOptions = {
  seeded: {
    wedding,
    operationalDay,
    payments: [
      {
        id: 'payment',
        label: 'Zadatek',
        amount: 2_000,
        type: 'deposit' as const,
        paid: true,
        paidAt: '2026-01-10',
      },
    ],
    tasks: [
      {
        id: 'task',
        title: 'Oddać galerię',
        weddingId: 'w1',
        dueDate: '2027-08-01',
        status: 'todo' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        completedAt: null,
        completed: false,
      },
    ],
    sessions: [
      {
        id: 'session',
        customName: 'Sesja narzeczeńska',
        primaryPerson: { firstName: 'Anna' },
        sessionType: 'engagement' as const,
        date: '2027-04-01',
        totalPrice: 1_000,
        depositAmount: 200,
        payments: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    extras: [
      {
        id: 'extra',
        weddingId: 'w1',
        extraServiceId: 'album',
        priceSnapshot: 800,
        quantity: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        nameSnapshot: 'Album',
      },
    ],
    prewedding: {
      id: 'questionnaire',
      weddingId: 'w1',
      ownerId: 'owner',
      title: 'Ankieta przedślubna',
      introduction: '',
      schema: { sections: [] },
      prefill: {},
      status: 'submitted' as const,
      hasPublicToken: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  },
}

let passed = 0
async function acceptance(name: string, test: () => Promise<void> | void) {
  await test()
  passed += 1
  console.log(`  OK ${name}`)
}

try {
  await acceptance('future search + CONTRACT.SIGNED=false transform', async () => {
    destroyV6CollectionSession()
    const original = contractService.listByWeddingIds
    contractService.listByWeddingIds = async (ids: string[]) =>
      new Map<string, WeddingContract | null>(
        ids.map((id) => [
          id,
          id === 'w2' ? { status: 'signed' } : { status: 'generated' },
        ]),
      )
    try {
      const result = await executeTurnPlan({
        plan: {
          steps: [
            {
              id: 'search',
              kind: 'SEARCH_COLLECTION',
              search: {
                type: 'Search',
                source: 'wedding',
                relativeTemporal: {
                  kind: 'future_from_now',
                  inclusive: true,
                },
              },
            },
            {
              id: 'transform',
              kind: 'TRANSFORM_COLLECTION',
              inputFromStep: 'search',
              inputHandle: null,
              ops: [
                {
                  op: 'ConceptFilter',
                  predicate: {
                    concept: 'CONTRACT.SIGNED',
                    cmp: 'eq',
                    value: false,
                  },
                },
              ],
            },
          ],
          output: { kind: 'COLLECTION', fromStep: 'transform' },
        },
        turnId: 'contract-filter',
        todayKey: '2026-09-15',
        universeRows: universe,
      })
      assert.equal(result.completeness.ok, true)
      assert.deepEqual(
        v6CollectionStore.get(result.stepHandleById.transform!)?.snapshotMemberIds,
        ['w1'],
      )
    } finally {
      contractService.listByWeddingIds = original
    }
  })

  await acceptance('FIN.DEPOSIT_PAID=false collection filter', async () => {
    const collection = seedCollection(['w1', 'w2'])
    const original = paymentService.listByWeddingIds
    paymentService.listByWeddingIds = async (ids: string[]) =>
      new Map<string, Payment[]>(
        ids.map((id) => [
          id,
          id === 'w1'
            ? [
                {
                  id: 'p1',
                  label: 'Zadatek',
                  amount: 2_000,
                  type: 'deposit',
                  paid: true,
                },
              ]
            : [],
        ]),
      )
    try {
      const result = await executeTurnPlan({
        plan: transformPlan(collection.handle, 'FIN.DEPOSIT_PAID', false),
        turnId: 'deposit-filter',
        universeRows: universe,
      })
      assert.deepEqual(
        v6CollectionStore.get(result.stepHandleById.transform!)?.snapshotMemberIds,
        ['w2'],
      )
    } finally {
      paymentService.listByWeddingIds = original
    }
  })

  await acceptance('TASK.HAS_OPEN=true collection filter', async () => {
    const collection = seedCollection(['w1', 'w2'])
    const original = taskService.listForStudio
    taskService.listForStudio = async (): Promise<StudioTask[]> => [
      {
        id: 'task',
        title: 'Oddać galerię',
        weddingId: 'w2',
        dueDate: '2027-08-01',
        status: 'todo',
        createdAt: '2026-01-01T00:00:00.000Z',
        completedAt: null,
        completed: false,
      },
    ]
    try {
      const result = await executeTurnPlan({
        plan: transformPlan(collection.handle, 'TASK.HAS_OPEN', true),
        turnId: 'task-filter',
        universeRows: universe,
      })
      assert.deepEqual(
        v6CollectionStore.get(result.stepHandleById.transform!)?.snapshotMemberIds,
        ['w2'],
      )
    } finally {
      taskService.listForStudio = original
    }
  })

  await acceptance('remaining aggregate concept and legacy alias', async () => {
    for (const measure of ['FIN.REMAINING_TO_PAY', 'remaining_amount']) {
      const collection = seedCollection(['w1', 'w2'])
      const result = await executeTurnPlan({
        plan: {
          steps: [
            {
              id: 'aggregate',
              kind: 'AGGREGATE_COLLECTION',
              inputFromStep: null,
              inputHandle: collection.handle,
              aggregation: 'sum',
              measure,
            },
          ],
          output: { kind: 'AGGREGATE', fromStep: 'aggregate' },
        },
        turnId: `aggregate-${measure}`,
        weddings: [
          { id: 'w1', price: 10_000, payments: [{ id: '1', label: '', amount: 1_000, type: 'other', paid: true }] },
          { id: 'w2', price: 5_000, payments: [{ id: '2', label: '', amount: 1_000, type: 'other', paid: true }] },
        ],
      })
      assert.equal(
        (result.aggregateByStepId.aggregate as { value: number }).value,
        13_000,
      )
    }
  })

  async function inspect(concepts: ConceptKey[]) {
    const collection = seedCollection()
    return executeTurnPlan({
      plan: {
        steps: [
          {
            id: 'inspect',
            kind: 'INSPECT_RESOURCE',
            inputFromStep: null,
            inputHandle: collection.handle,
            concepts,
          },
        ],
        output: { kind: 'DETAIL', fromStep: 'inspect' },
      },
      turnId: 'inspect',
      inspectResource: (input) =>
        inspectResourceConcepts({ ...input, contextOptions }),
    })
  }

  await acceptance('CONTACT.BRIDE_PHONE inspect', async () => {
    const values = detailValues(await inspect(['CONTACT.BRIDE_PHONE']))
    assert.equal(values.get('CONTACT.BRIDE_PHONE'), '+48 500 100 200')
  })

  await acceptance('PLACE.GROOM_PREP_PLACE inspect', async () => {
    const values = detailValues(await inspect(['PLACE.GROOM_PREP_PLACE']))
    assert.equal(values.get('PLACE.GROOM_PREP_PLACE'), 'Hotel')
  })

  await acceptance('multi-concept place address + ceremony time inspect', async () => {
    const values = detailValues(
      await inspect(['PLACE.CEREMONY_ADDRESS', 'OPS.CEREMONY_TIME']),
    )
    assert.equal(values.get('PLACE.CEREMONY_ADDRESS'), 'Kwiatowa 3, Kraków')
    assert.equal(values.get('OPS.CEREMONY_TIME'), '15:30')
  })

  await acceptance('FIN.REMAINING_TO_PAY desc sort + slice one', async () => {
    const collection = seedCollection(['w2', 'w1'])
    const result = await executeTurnPlan({
      plan: {
        steps: [
          {
            id: 'transform',
            kind: 'TRANSFORM_COLLECTION',
            inputFromStep: null,
            inputHandle: collection.handle,
            ops: [
              {
                op: 'Sort',
                sort: { field: 'FIN.REMAINING_TO_PAY', direction: 'desc' },
              },
              { op: 'Slice', slice: { limit: 1 } },
            ],
          },
        ],
        output: { kind: 'COLLECTION', fromStep: 'transform' },
      },
      turnId: 'sort-slice',
      universeRows: universe,
    })
    assert.deepEqual(
      v6CollectionStore.get(result.stepHandleById.transform!)?.snapshotMemberIds,
      ['w1'],
    )
  })

  async function related(relation: 'TASKS_OPEN' | 'PAYMENTS' | 'SESSIONS' | 'EXTRAS') {
    const collection = seedCollection()
    const result = await executeTurnPlan({
      plan: {
        steps: [
          {
            id: 'related',
            kind: 'LIST_RELATED',
            inputFromStep: null,
            inputHandle: collection.handle,
            relation,
            limit: 10,
          },
        ],
        output: { kind: 'DETAIL', fromStep: 'related' },
      },
      turnId: `related-${relation}`,
      listRelatedResources: (input) =>
        listRelated({
          collectionHandle: input.collectionHandle,
          relationKey: input.relationKey,
          limit: input.limit,
          contextOptions,
        }),
    })
    const observation = result.executed[0]?.observation as
      | RelatedObservation
      | undefined
    assert.equal(observation?.kind, 'related_list')
    assert.equal(observation.relation, relation)
    assert.equal(observation.totalCount, 1)
    return observation
  }

  await acceptance('LIST_RELATED TASKS_OPEN', async () => {
    assert.equal((await related('TASKS_OPEN')).items[0]?.title, 'Oddać galerię')
  })
  await acceptance('LIST_RELATED PAYMENTS', async () => {
    assert.equal((await related('PAYMENTS')).items[0]?.title, 'Zadatek')
  })
  await acceptance('LIST_RELATED SESSIONS', async () => {
    assert.equal(
      (await related('SESSIONS')).items[0]?.title,
      'Sesja narzeczeńska',
    )
  })
  await acceptance('LIST_RELATED EXTRAS', async () => {
    assert.equal((await related('EXTRAS')).items[0]?.title, 'Album')
  })

  await acceptance('Q.PREWEDDING_STATUS inspect', async () => {
    const values = detailValues(await inspect(['Q.PREWEDDING_STATUS']))
    assert.equal(values.get('Q.PREWEDDING_STATUS'), 'submitted')
  })

  await acceptance('TRAVEL.EFFECTIVE_FEE inspect', async () => {
    const values = detailValues(await inspect(['TRAVEL.EFFECTIVE_FEE']))
    assert.equal(values.get('TRAVEL.EFFECTIVE_FEE'), 450)
  })

  await acceptance('unsupported notes/raw body executes no CRM inspect', async () => {
    let inspectCalled = false
    const result = await executeTurnPlan({
      plan: {
        steps: [],
        output: {
          kind: 'UNSUPPORTED',
          reason: 'notes_raw_body_not_supported',
        },
      },
      turnId: 'unsupported',
      inspectResource: async () => {
        inspectCalled = true
        throw new Error('must not execute')
      },
    })
    assert.equal(result.executed.length, 0)
    assert.equal(inspectCalled, false)
    assert.equal(result.completeness.ok, true)
  })
} finally {
  destroyV6CollectionSession()
}

assert.equal(passed, 15)
console.log(`v6Cra2CompositionAcceptance PASS (${passed}/15 cases)`)
