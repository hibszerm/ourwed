/**
 * V6-DR1 — Wedding place detail inspection + leak/pluralization acceptance.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { destroyV6CollectionSession, v6CollectionStore } from '../../collections/store'
import { inspectWeddingPlaceDetail } from '../../detail/inspectWeddingPlace'
import {
  isV6WeddingPlaceDetailSelector,
  V6_WEDDING_PLACE_DETAIL_SELECTORS,
  type V6WeddingPlaceDetailSelector,
} from '../../detail/weddingPlaceDetail'
import { checkTurnPlanCapability } from '../../capability/checkTurnPlanCapability'
import { executeTurnPlan } from '../../turnPlan/execute'
import { parseTurnPlanWire } from '../../turnPlan/parse'
import { validateTurnPlan } from '../../turnPlan/validate'
import { polishWeddingCountNoun } from '../../render/polishWeddingCountNoun'
import { renderV6TurnResult } from '../../render/renderV6TurnResult'
import { decideV6Authority } from '../../authority/decide'
import type { V6ShadowTurnResult } from '../../agent/loop'
import type { OperationalWeddingDayLoad } from '../../../v4/capabilities/loadOperationalWeddingDay'
import { ASSISTANT_PLAN_BLOCKED } from '../../../copy'

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
    },
    ordering: null,
    totalCount: input.totalCount ?? input.memberIds.length,
    parentHandle: null,
    createdAtTurn: 'dr1',
    fetchedAt: new Date().toISOString(),
    snapshotMemberIds: input.memberIds,
    preview: input.memberIds.map((_, i) => ({
      displayName: `Couple ${i + 1}`,
      date: '2026-09-17',
      ordinal: i + 1,
    })),
  })
}

function mockDay(overrides?: {
  ceremonyName?: string | null
  ceremonyAddress?: string | null
  receptionName?: string | null
  receptionAddress?: string | null
  brideName?: string | null
  brideAddress?: string | null
  groomName?: string | null
  groomAddress?: string | null
}): OperationalWeddingDayLoad {
  const pick = <T,>(key: keyof NonNullable<typeof overrides>, fallback: T): T =>
    overrides && key in overrides ? (overrides[key] as T) : fallback
  return {
    status: 'ok',
    weddingId: WEDDING_ID,
    displayName: 'Martyna & Tomasz',
    slots: [
      {
        role: 'ceremony',
        label: 'Ceremonia',
        name: pick('ceremonyName', 'Kościół św. Anny'),
        address: pick('ceremonyAddress', 'ul. Ceremonialna 1, Kraków'),
        time: null,
        participantKey: null,
      },
      {
        role: 'reception',
        label: 'Wesele',
        name: pick('receptionName', 'Dwór Nadziei'),
        address: pick('receptionAddress', 'ul. Weselna 2, Kraków'),
        time: null,
        participantKey: null,
      },
      {
        role: 'bride_preparation',
        label: 'Przygotowania panny młodej',
        name: pick('brideName', 'Salon Bella'),
        address: pick('brideAddress', 'ul. Panny 3, Kraków'),
        time: null,
        participantKey: 'p1',
      },
      {
        role: 'groom_preparation',
        label: 'Przygotowania pana młodego',
        name: pick('groomName', 'Apartament Groom'),
        address: pick('groomAddress', 'ul. Pana 4, Kraków'),
        time: null,
        participantKey: 'p2',
      },
    ],
  }
}

function inspectPlan(selector: V6WeddingPlaceDetailSelector, handle: string) {
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
  { selector: 'ceremony_place', value: 'Kościół św. Anny' },
  { selector: 'ceremony_address', value: 'ul. Ceremonialna 1, Kraków' },
  { selector: 'reception_place', value: 'Dwór Nadziei' },
  { selector: 'reception_address', value: 'ul. Weselna 2, Kraków' },
  { selector: 'groom_preparation_place', value: 'Apartament Groom' },
  { selector: 'groom_preparation_address', value: 'ul. Pana 4, Kraków' },
  { selector: 'bride_preparation_place', value: 'Salon Bella' },
  { selector: 'bride_preparation_address', value: 'ul. Panny 3, Kraków' },
]

describe('V6-DR1 wedding place detail', () => {
  beforeEach(() => {
    destroyV6CollectionSession()
  })
  afterEach(() => {
    destroyV6CollectionSession()
  })

  for (const [i, case_] of SELECTOR_EXPECT.entries()) {
    it(`D${i + 1} — single wedding → ${case_.selector}`, async () => {
      const col = seedCollection({ memberIds: [WEDDING_ID] })
      const result = await inspectWeddingPlaceDetail({
        collectionHandle: col.handle,
        selector: case_.selector,
        loadDay: async () => mockDay(),
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.observation.kind).toBe('wedding_place_detail')
      if (result.observation.kind !== 'wedding_place_detail') return
      expect(result.observation.selector).toBe(case_.selector)
      expect(result.observation.filled).toBe(true)
      expect(result.observation.value).toBe(case_.value)
      expect(result.observation.weddingDisplayName).toBe('Martyna & Tomasz')
    })
  }

  it('D9 — multi-member collection → no arbitrary wedding selection', async () => {
    const col = seedCollection({ memberIds: ['w1', 'w2'], totalCount: 2 })
    const result = await inspectWeddingPlaceDetail({
      collectionHandle: col.handle,
      selector: 'ceremony_address',
      loadDay: async () => mockDay(),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('COLLECTION_AMBIGUOUS')

    const parsed = parseTurnPlanWire(inspectPlan('ceremony_address', col.handle))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
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
    expect(obs?.kind).toBe('clarification')
  })

  it('D10 — zero-member collection → no fabricated inspection', async () => {
    const col = seedCollection({ memberIds: [], totalCount: 0 })
    const result = await inspectWeddingPlaceDetail({
      collectionHandle: col.handle,
      selector: 'ceremony_place',
      loadDay: async () => mockDay(),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('COLLECTION_EMPTY')
  })

  it('D11 — unknown selector → deterministic capability block', () => {
    expect(isV6WeddingPlaceDetailSelector('package_price')).toBe(false)
    const wire = inspectPlan('ceremony_place', 'col_x')
    ;(wire.steps[0] as { detail_selector: string }).detail_selector =
      'package_price'
    const parsed = parseTurnPlanWire(wire)
    expect(parsed.ok).toBe(false)

    const badPlan = {
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
    }
    const cap = checkTurnPlanCapability(badPlan)
    expect(cap.verdict).toBe('UNSUPPORTED')
    expect(cap.code).toBe('unsupported_detail_selector')
  })

  it('D12 — canonical field missing → product-safe not-filled', async () => {
    const col = seedCollection({ memberIds: [WEDDING_ID] })
    const result = await inspectWeddingPlaceDetail({
      collectionHandle: col.handle,
      selector: 'ceremony_address',
      loadDay: async () => mockDay({ ceremonyAddress: null }),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.observation.kind).toBe('wedding_place_detail')
    if (result.observation.kind !== 'wedding_place_detail') return
    expect(result.observation.filled).toBe(false)
    expect(result.observation.value).toBeNull()
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
    expect(rendered.kind).toBe('text')
    if (rendered.kind !== 'text') return
    expect(rendered.message).toMatch(/brak uzupełnionego wpisu/i)
    expect(rendered.message).not.toMatch(/ul\. Ceremonialna/)
  })

  it('D13 — verifier NOT_FAITHFUL explanation never user-visible', () => {
    const result: V6ShadowTurnResult = {
      turnId: 'd13',
      rounds: 1,
      response: {
        status: 'error',
        code: 'VERIFICATION_NOT_FAITHFUL',
        message: 'plan_blocked',
      },
      toolTrace: [],
      authority: decideV6Authority({}),
      errorCode: 'VERIFICATION_NOT_FAITHFUL',
      semanticVerifierVerdict: 'NOT_FAITHFUL',
      verificationBlockReason: 'VERIFICATION_NOT_FAITHFUL',
    }
    const leakAttempt: V6ShadowTurnResult = {
      ...result,
      response: {
        status: 'error',
        code: 'VERIFICATION_NOT_FAITHFUL',
        message:
          'NOT_FAITHFUL: The plan restores the collection but omits groom_preparation_place Inspect required by user meaning.',
      },
    }
    const safe = renderV6TurnResult(result)
    const sanitized = renderV6TurnResult(leakAttempt)
    expect(safe.kind).toBe('unsupported')
    expect(sanitized.kind).toBe('unsupported')
    if (safe.kind !== 'unsupported' || sanitized.kind !== 'unsupported') return
    expect(safe.message).toBe(ASSISTANT_PLAN_BLOCKED)
    expect(sanitized.message).toBe(ASSISTANT_PLAN_BLOCKED)
    expect(sanitized.message).not.toMatch(/NOT_FAITHFUL|groom_preparation|Inspect/i)
  })

  it('D14 — count 1 → wesele', () => {
    expect(polishWeddingCountNoun(1)).toBe('wesele')
  })

  it('D15 — count 2/3/4 → wesela', () => {
    expect(polishWeddingCountNoun(2)).toBe('wesela')
    expect(polishWeddingCountNoun(3)).toBe('wesela')
    expect(polishWeddingCountNoun(4)).toBe('wesela')
  })

  it('D16 — plural edges → wesel', () => {
    expect(polishWeddingCountNoun(5)).toBe('wesel')
    expect(polishWeddingCountNoun(12)).toBe('wesel')
    expect(polishWeddingCountNoun(22)).toBe('wesela')
    expect(polishWeddingCountNoun(0)).toBe('wesel')
  })

  it('parse+validate+capability accepts INSPECT DETAIL plan', () => {
    const col = seedCollection({ memberIds: [WEDDING_ID] })
    const parsed = parseTurnPlanWire(inspectPlan('ceremony_place', col.handle))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(validateTurnPlan(parsed.plan).ok).toBe(true)
    expect(checkTurnPlanCapability(parsed.plan).verdict).toBe('SUPPORTED')
    expect(V6_WEDDING_PLACE_DETAIL_SELECTORS).toHaveLength(8)
  })
})
