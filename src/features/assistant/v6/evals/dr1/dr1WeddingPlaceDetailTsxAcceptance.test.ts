/**
 * V6-DR1 — tsx acceptance (no vitest). Preserves place-detail regressions for CRA2.
 */
import assert from 'node:assert/strict'
import type { OperationalWeddingDayLoad } from '../../../v4/capabilities/loadOperationalWeddingDay'
import { ASSISTANT_PLAN_BLOCKED } from '../../../copy'
import { decideV6Authority } from '../../authority/decide'
import type { V6ShadowTurnResult } from '../../agent/loop'
import { checkTurnPlanCapability } from '../../capability/checkTurnPlanCapability'
import {
  destroyV6CollectionSession,
  v6CollectionStore,
} from '../../collections/store'
import { inspectWeddingPlaceDetail } from '../../detail/inspectWeddingPlace'
import {
  isV6WeddingPlaceDetailSelector,
  V6_WEDDING_PLACE_DETAIL_SELECTORS,
  type V6WeddingPlaceDetailSelector,
} from '../../detail/weddingPlaceDetail'
import { polishWeddingCountNoun, polishWeddingCountNounShort } from '../../render/polishWeddingCountNoun'
import { renderV6TurnResult } from '../../render/renderV6TurnResult'
import { executeTurnPlan } from '../../turnPlan/execute'
import { parseTurnPlanWire } from '../../turnPlan/parse'
import { DR1_SELECTOR_TO_CONCEPT } from '../../registry'

const WEDDING_ID = 'w-dr1-single'

function seedCollection(input: {
  handleHint?: string
  memberIds: string[]
  totalCount?: number
}) {
  return v6CollectionStore.create({
    source: 'wedding',
    semanticDefinition: {
      source: 'wedding',
      filters: [],
      excludePlaces: [],
      relativeTemporal: null,
      sort: null,
      slice: null,
      transformOps: [],
      conceptFilters: [],
    },
    snapshotMemberIds: input.memberIds,
    totalCount: input.totalCount ?? input.memberIds.length,
    ordering: 'stable_input',
    preview: input.memberIds.slice(0, 3).map((id, i) => ({
      ordinal: i + 1,
      displayName: id,
      date: null,
    })),
    createdAtTurn: 'dr1-tsx',
    parentHandle: null,
    handleHint: input.handleHint,
  })
}

function mockDay(overrides?: {
  ceremonyAddress?: string | null
}): OperationalWeddingDayLoad {
  return {
    status: 'ok',
    weddingId: WEDDING_ID,
    displayName: 'Martyna & Tomasz',
    slots: [
      {
        role: 'ceremony',
        label: 'Ceremonia',
        name: 'Kościół Mariacki',
        address:
          overrides && 'ceremonyAddress' in overrides
            ? overrides.ceremonyAddress ?? null
            : 'pl. Mariacki 5, Kraków',
        time: '14:00',
        participantKey: null,
      },
      {
        role: 'reception',
        label: 'Przyjęcie',
        name: 'Dwór Nadziei',
        address: 'ul. Weselna 2, Kraków',
        time: '17:00',
        participantKey: null,
      },
      {
        role: 'groom_preparation',
        label: 'Przygotowania pana młodego',
        name: 'Apartament Groom',
        address: 'ul. Pana 4, Kraków',
        time: '11:00',
        participantKey: 'p2',
      },
      {
        role: 'bride_preparation',
        label: 'Przygotowania panny młodej',
        name: 'Salon Bella',
        address: 'ul. Panny 3, Kraków',
        time: '10:00',
        participantKey: 'p1',
      },
    ],
  }
}

function inspectPlan(selector: string, handle: string) {
  return {
    steps: [
      {
        id: 's1',
        kind: 'INSPECT_WEDDING',
        input_from_step: null,
        input_handle: handle,
        search: null,
        transform_ops: null,
        aggregation: null,
        measure: null,
        detail_selector: selector,
        inspect_concepts: null,
        relation: null,
        relation_limit: null,
      },
    ],
    output: {
      kind: 'DETAIL',
      from_step: 's1',
      reason: null,
      slot: null,
      text: null,
    },
  }
}

const SELECTOR_EXPECT: Array<{
  selector: V6WeddingPlaceDetailSelector
  value: string
}> = [
  { selector: 'ceremony_place', value: 'Kościół Mariacki' },
  { selector: 'ceremony_address', value: 'pl. Mariacki 5, Kraków' },
  { selector: 'reception_place', value: 'Dwór Nadziei' },
  { selector: 'reception_address', value: 'ul. Weselna 2, Kraków' },
  { selector: 'groom_preparation_place', value: 'Apartament Groom' },
  { selector: 'groom_preparation_address', value: 'ul. Pana 4, Kraków' },
  { selector: 'bride_preparation_place', value: 'Salon Bella' },
  { selector: 'bride_preparation_address', value: 'ul. Panny 3, Kraków' },
]

destroyV6CollectionSession()

for (const case_ of SELECTOR_EXPECT) {
  const col = seedCollection({ memberIds: [WEDDING_ID] })
  const result = await inspectWeddingPlaceDetail({
    collectionHandle: col.handle,
    selector: case_.selector,
    loadDay: async () => mockDay(),
  })
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error('expected ok')
  assert.equal(result.observation.kind, 'wedding_place_detail')
  if (result.observation.kind !== 'wedding_place_detail') throw new Error('kind')
  assert.equal(result.observation.selector, case_.selector)
  assert.equal(result.observation.value, case_.value)
  assert.equal(DR1_SELECTOR_TO_CONCEPT[case_.selector].startsWith('PLACE.'), true)
  destroyV6CollectionSession()
}

{
  const col = seedCollection({ memberIds: ['w1', 'w2'], totalCount: 2 })
  const result = await inspectWeddingPlaceDetail({
    collectionHandle: col.handle,
    selector: 'ceremony_address',
    loadDay: async () => mockDay(),
  })
  assert.equal(result.ok, false)
  if (result.ok) throw new Error('expected fail')
  assert.equal(result.code, 'COLLECTION_AMBIGUOUS')
  const parsed = parseTurnPlanWire(inspectPlan('ceremony_address', col.handle))
  assert.equal(parsed.ok, true)
  if (!parsed.ok) throw new Error('parse')
  const exec = await executeTurnPlan({
    plan: parsed.plan,
    turnId: 'dr1-d9',
    inspectWeddingPlace: async (input) =>
      inspectWeddingPlaceDetail({
        ...input,
        loadDay: async () => mockDay(),
      }),
  })
  const obs = exec.completeness.ok
    ? exec.completeness.authorizingObservation
    : null
  assert.equal(obs?.kind, 'clarification')
  destroyV6CollectionSession()
}

{
  const col = seedCollection({ memberIds: [], totalCount: 0 })
  const result = await inspectWeddingPlaceDetail({
    collectionHandle: col.handle,
    selector: 'ceremony_place',
    loadDay: async () => mockDay(),
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'COLLECTION_EMPTY')
  destroyV6CollectionSession()
}

assert.equal(isV6WeddingPlaceDetailSelector('package_price'), false)
assert.equal(V6_WEDDING_PLACE_DETAIL_SELECTORS.length, 8)
{
  const wire = inspectPlan('ceremony_place', 'col_x')
  ;(wire.steps[0] as { detail_selector: string }).detail_selector =
    'package_price'
  assert.equal(parseTurnPlanWire(wire).ok, false)
  const cap = checkTurnPlanCapability({
    steps: [
      {
        id: 's1',
        kind: 'INSPECT_WEDDING',
        inputFromStep: null,
        inputHandle: 'col_x',
        detailSelector: 'whatever_field',
      },
    ],
    output: { kind: 'DETAIL', fromStep: 's1' },
  })
  assert.equal(cap.verdict, 'UNSUPPORTED')
}

{
  const col = seedCollection({ memberIds: [WEDDING_ID] })
  const result = await inspectWeddingPlaceDetail({
    collectionHandle: col.handle,
    selector: 'ceremony_address',
    loadDay: async () => mockDay({ ceremonyAddress: null }),
  })
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error('ok')
  assert.equal(result.observation.kind, 'wedding_place_detail')
  if (result.observation.kind !== 'wedding_place_detail') throw new Error('kind')
  assert.equal(result.observation.filled, false)
  const rendered = renderV6TurnResult({
    turnId: 'd12',
    rounds: 1,
    response: { status: 'final', text: 'ok' },
    toolTrace: [],
    authority: decideV6Authority({ toolOk: true }),
    execution: {
      plan: {
        steps: [],
        output: { kind: 'DETAIL', fromStep: 's1' },
      },
      executed: [],
      stepHandleById: {},
      aggregateByStepId: {},
      completeness: {
        ok: true,
        authorizingObservation: result.observation,
      },
    },
  } as V6ShadowTurnResult)
  assert.equal(rendered.kind, 'text')
  if (rendered.kind === 'text') {
    assert.match(rendered.message, /brak uzupełnionego wpisu/)
  }
  destroyV6CollectionSession()
}

assert.equal(polishWeddingCountNoun(1), 'wesele')
assert.equal(polishWeddingCountNoun(2), 'wesela')
assert.equal(polishWeddingCountNoun(5), 'wesel')
assert.equal(polishWeddingCountNounShort(1), 'ślub')
assert.equal(polishWeddingCountNounShort(2), 'śluby')
assert.equal(polishWeddingCountNounShort(5), 'ślubów')

{
  const blocked = renderV6TurnResult({
    turnId: 'leak',
    rounds: 1,
    response: {
      status: 'error',
      code: 'VERIFICATION_NOT_FAITHFUL',
      message: 'raw verifier reasoning should not leak',
    },
    toolTrace: [],
    authority: decideV6Authority({ toolOk: false }),
  } as V6ShadowTurnResult)
  assert.equal(blocked.kind, 'unsupported')
  if (blocked.kind === 'unsupported') {
    assert.equal(blocked.message, ASSISTANT_PLAN_BLOCKED)
    assert.equal(/verifier|faithful/i.test(blocked.message), false)
  }
}

console.log('dr1WeddingPlaceDetailTsxAcceptance PASS')
