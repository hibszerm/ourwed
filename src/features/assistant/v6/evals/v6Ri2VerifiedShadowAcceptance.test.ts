/**
 * V6-RI2 — Thin verified shadow integration acceptance (mocked verifier; no live LLM).
 *
 * KNOWN_VERIFIER_FALSE_POSITIVE_H19: no phrase patch.
 * KNOWN_CORRECTION_COLLECTION_BASE_GAP_H20: not fixed in runtime.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  destroyV6CollectionSession,
  v6CollectionStore,
} from '../collections/store'
import { mayExecuteVerifiedTurnPlan, runV6ShadowTurn } from '../agent/loop'
import { checkTurnPlanCapability } from '../capability/checkTurnPlanCapability'
import { parseSemanticVerifierWire } from '../verification/semanticVerifier'
import type { V6AgentStepResponse } from '../agent/protocol'
import type { V6SemanticVerifyInvokeResult } from '../agent/invokeSemanticVerify'
import type { V6PlanExecutionResult } from '../turnPlan/types'
import { parseTurnPlanWire } from '../turnPlan/parse'

const nullTemporal = {
  kind: 'future_from_now',
  inclusive: true,
  year: null,
  month: null,
  from_kind: null,
  from_date: null,
  from_year: null,
  from_month: null,
  to_kind: null,
  to_date: null,
  to_year: null,
  to_month: null,
}

function searchStep(id: string, search: Record<string, unknown>) {
  return {
    id,
    kind: 'SEARCH_COLLECTION',
    input_from_step: null,
    input_handle: null,
    search: {
      source: 'wedding',
      filters: null,
      exclude_place: null,
      temporal: nullTemporal,
      sort: null,
      slice: null,
      ...search,
    },
    transform_ops: null,
    aggregation: null,
    measure: null,
  }
}

function collectionOut(from: string) {
  return {
    kind: 'COLLECTION',
    from_step: from,
    reason: null,
    slot: null,
    text: null,
  }
}

function nearestWire() {
  return {
    steps: [
      searchStep('s1', {
        temporal: nullTemporal,
        sort: { field: 'wedding.date', direction: 'asc' },
        slice: { limit: 3, offset: null },
      }),
    ],
    output: collectionOut('s1'),
  }
}

function top3Wire() {
  return {
    steps: [
      searchStep('s1', {
        temporal: null,
        sort: { field: 'contract_value', direction: 'desc' },
        slice: { limit: 3, offset: null },
      }),
    ],
    output: collectionOut('s1'),
  }
}

function a09Wire() {
  return {
    steps: [
      {
        id: 't1',
        kind: 'TRANSFORM_COLLECTION',
        input_from_step: null,
        input_handle: 'col_1',
        search: null,
        transform_ops: [
          {
            op: 'Filter',
            place: {
              field: 'place.name',
              op: 'eq',
              value: 'Villa Love',
              role: 'any',
            },
            temporal: null,
            sort: null,
            slice: null,
            exclude_by: null,
            exclude_ordinal: null,
            exclude_place_value: null,
            exclude_place_role: null,
          },
        ],
        aggregation: null,
        measure: null,
      },
    ],
    output: collectionOut('t1'),
  }
}

function h20Wire() {
  return {
    steps: [
      {
        id: 't1',
        kind: 'TRANSFORM_COLLECTION',
        input_from_step: null,
        input_handle: 'col_1',
        search: null,
        transform_ops: [
          {
            op: 'Filter',
            place: {
              field: 'place.name',
              op: 'contains',
              value: 'Barna Brzozowa',
              role: 'any',
            },
            temporal: null,
            sort: null,
            slice: null,
            exclude_by: null,
            exclude_ordinal: null,
            exclude_place_value: null,
            exclude_place_role: null,
          },
        ],
        aggregation: null,
        measure: null,
      },
    ],
    output: collectionOut('t1'),
  }
}

function unsupportedWire() {
  return {
    steps: [],
    output: {
      kind: 'UNSUPPORTED',
      from_step: null,
      reason: 'Ranking miejscowości nie jest obsługiwane.',
      slot: null,
      text: null,
    },
  }
}

function clarifyWire() {
  return {
    steps: [],
    output: {
      kind: 'CLARIFICATION',
      from_step: null,
      reason: 'need_handle',
      slot: 'collection',
      text: null,
    },
  }
}

function planJson(wire: unknown): V6AgentStepResponse {
  return {
    status: 'final',
    text: JSON.stringify(wire),
    diagnostics: { turnPlan: wire, transport: 'turn_plan' },
  }
}

function fakeExecution(): V6PlanExecutionResult {
  const parsed = parseTurnPlanWire(nearestWire())
  if (!parsed.ok) throw new Error(parsed.detail)
  return {
    plan: parsed.plan,
    executed: [
      {
        stepId: 's1',
        kind: 'SEARCH_COLLECTION',
        ok: true,
        outputHandle: 'col_1',
        observation: {
          kind: 'collection_result',
          handle: 'col_1',
          totalCount: 3,
          preview: [],
        },
        toolName: 'query_collection',
        toolArgs: {},
      },
    ],
    stepHandleById: { s1: 'col_1' },
    aggregateByStepId: {},
    completeness: {
      ok: true,
      authorizingObservation: {
        kind: 'collection_result',
        handle: 'col_1',
        totalCount: 3,
        preview: [],
      },
    },
  }
}

function faithfulVerify(): V6SemanticVerifyInvokeResult {
  return {
    ok: true,
    result: {
      verdict: 'FAITHFUL',
      missingRequirements: [],
      contradictedRequirements: [],
      explanation: 'ok',
    },
    latencyMs: 1,
    model: 'gpt-5',
  }
}

beforeEach(() => {
  destroyV6CollectionSession()
})

afterEach(() => {
  destroyV6CollectionSession()
})

describe('V6-RI2 mayExecuteVerifiedTurnPlan', () => {
  it('allows only FAITHFUL + SUPPORTED', () => {
    expect(
      mayExecuteVerifiedTurnPlan({
        semanticVerdict: 'FAITHFUL',
        capabilityVerdict: 'SUPPORTED',
      }),
    ).toBe(true)
    expect(
      mayExecuteVerifiedTurnPlan({
        semanticVerdict: 'NOT_FAITHFUL',
        capabilityVerdict: 'SUPPORTED',
      }),
    ).toBe(false)
    expect(
      mayExecuteVerifiedTurnPlan({
        semanticVerdict: 'FAITHFUL',
        capabilityVerdict: 'UNSUPPORTED',
      }),
    ).toBe(false)
  })
})

describe('V6-RI2 shadow gates', () => {
  it('1. FAITHFUL + SUPPORTED → execute exactly once', async () => {
    const executePlan = vi.fn(async () => fakeExecution())
    const invokeVerifier = vi.fn(async () => faithfulVerify())
    const result = await runV6ShadowTurn({
      turnId: 't1',
      utterance: 'Pokaż 3 najbliższe wesela.',
      deps: {
        invokePlanner: async () => planJson(nearestWire()),
        invokeVerifier,
        executePlan,
      },
    })
    expect(result.errorCode).toBeUndefined()
    expect(executePlan).toHaveBeenCalledTimes(1)
    expect(invokeVerifier).toHaveBeenCalledTimes(1)
    expect(result.semanticVerifierVerdict).toBe('FAITHFUL')
    expect(result.capabilityVerdict).toBe('SUPPORTED')
    expect(result.authority.visibleOwner).toBe('none')
    expect(result.response?.status).toBe('final')
    const verifyArgs = invokeVerifier.mock.calls[0]![0]
    expect(JSON.stringify(verifyArgs)).not.toContain('snapshotMemberIds')
  })

  it('2. NOT_FAITHFUL → execute zero times', async () => {
    const executePlan = vi.fn(async () => fakeExecution())
    const result = await runV6ShadowTurn({
      turnId: 't2',
      utterance: 'Zawęź do Villa Love globalnie zamiast z nich.',
      recentUtterances: ['Pokaż 3 najbliższe wesela.'],
      deps: {
        invokePlanner: async () => planJson(a09Wire()),
        invokeVerifier: async () => ({
          ok: true,
          result: {
            verdict: 'NOT_FAITHFUL',
            missingRequirements: ['global root'],
            contradictedRequirements: [],
            explanation: 'refined prior instead of root',
          },
          latencyMs: 1,
          model: 'gpt-5',
        }),
        executePlan,
      },
    })
    expect(executePlan).toHaveBeenCalledTimes(0)
    expect(result.errorCode).toBe('VERIFICATION_NOT_FAITHFUL')
    expect(v6CollectionStore.getActive()).toBeNull()
  })

  it('3. UNCERTAIN → execute zero times', async () => {
    const executePlan = vi.fn(async () => fakeExecution())
    const result = await runV6ShadowTurn({
      turnId: 't3',
      utterance: 'pokaż coś',
      deps: {
        invokePlanner: async () => planJson(nearestWire()),
        invokeVerifier: async () => ({
          ok: true,
          result: {
            verdict: 'UNCERTAIN',
            missingRequirements: [],
            contradictedRequirements: [],
            explanation: 'ambiguous',
          },
          latencyMs: 1,
          model: 'gpt-5',
        }),
        executePlan,
      },
    })
    expect(executePlan).toHaveBeenCalledTimes(0)
    expect(result.errorCode).toBe('VERIFICATION_UNCERTAIN')
  })

  it('4. FAITHFUL + UNSUPPORTED capability → execute zero times', async () => {
    const executePlan = vi.fn(async () => fakeExecution())
    const result = await runV6ShadowTurn({
      turnId: 't4',
      utterance: 'Pogrupuj',
      deps: {
        invokePlanner: async () => planJson(nearestWire()),
        invokeVerifier: async () => faithfulVerify(),
        executePlan,
        checkCapability: () => ({
          verdict: 'UNSUPPORTED',
          code: 'unsupported_transform_op',
          detail: 'GroupBy not supported',
        }),
      },
    })
    expect(executePlan).toHaveBeenCalledTimes(0)
    expect(result.errorCode).toBe('CAPABILITY_UNSUPPORTED')
    expect(result.capabilityVerdict).toBe('UNSUPPORTED')
  })

  it('5. verifier transport failure → execute zero times', async () => {
    const executePlan = vi.fn(async () => fakeExecution())
    const result = await runV6ShadowTurn({
      turnId: 't5',
      utterance: 'Pokaż 3 najbliższe wesela.',
      deps: {
        invokePlanner: async () => planJson(nearestWire()),
        invokeVerifier: async () => ({
          ok: false,
          code: 'VERIFICATION_TRANSPORT_ERROR',
          message: 'timeout',
          latencyMs: 2,
          model: 'gpt-5',
        }),
        executePlan,
      },
    })
    expect(executePlan).toHaveBeenCalledTimes(0)
    expect(result.errorCode).toBe('VERIFICATION_TRANSPORT_ERROR')
  })

  it('6. verifier schema failure → execute zero times', async () => {
    const executePlan = vi.fn(async () => fakeExecution())
    const result = await runV6ShadowTurn({
      turnId: 't6',
      utterance: 'Pokaż 3 najbliższe wesela.',
      deps: {
        invokePlanner: async () => planJson(nearestWire()),
        invokeVerifier: async () => ({
          ok: false,
          code: 'VERIFICATION_SCHEMA_ERROR',
          message: 'bad_verdict',
          latencyMs: 1,
          model: 'gpt-5',
        }),
        executePlan,
      },
    })
    expect(executePlan).toHaveBeenCalledTimes(0)
    expect(result.errorCode).toBe('VERIFICATION_SCHEMA_ERROR')
  })

  it('7. planner UNSUPPORTED → verifier not called; execute zero', async () => {
    const executePlan = vi.fn(async () => fakeExecution())
    const invokeVerifier = vi.fn(async () => faithfulVerify())
    const result = await runV6ShadowTurn({
      turnId: 't7',
      utterance: 'Ranking miejscowości po liczbie wesel.',
      deps: {
        invokePlanner: async () => planJson(unsupportedWire()),
        invokeVerifier,
        executePlan,
      },
    })
    expect(invokeVerifier).toHaveBeenCalledTimes(0)
    expect(executePlan).toHaveBeenCalledTimes(0)
    expect(result.response?.status).toBe('unsupported')
  })

  it('8. planner CLARIFICATION → verifier not called; execute zero', async () => {
    const executePlan = vi.fn(async () => fakeExecution())
    const invokeVerifier = vi.fn(async () => faithfulVerify())
    const result = await runV6ShadowTurn({
      turnId: 't8',
      utterance: 'pokaż je',
      deps: {
        invokePlanner: async () => planJson(clarifyWire()),
        invokeVerifier,
        executePlan,
      },
    })
    expect(invokeVerifier).toHaveBeenCalledTimes(0)
    expect(executePlan).toHaveBeenCalledTimes(0)
    expect(result.response?.status).toBe('clarify')
  })

  it('9. verifier payload has summaries without snapshotMemberIds', async () => {
    const invokeVerifier = vi.fn(async () => faithfulVerify())
    await runV6ShadowTurn({
      turnId: 't9',
      utterance: 'Pokaż trzy wesela z najwyższą wartością umowy.',
      deps: {
        invokePlanner: async () => planJson(top3Wire()),
        invokeVerifier,
        executePlan: async () => fakeExecution(),
      },
    })
    expect(invokeVerifier).toHaveBeenCalled()
    const arg = invokeVerifier.mock.calls[0]![0]
    expect(arg.collectionSummaries).toBeDefined()
    expect(JSON.stringify(arg)).not.toMatch(/snapshotMemberIds/)
    expect(JSON.stringify(arg)).not.toMatch(/ownerId|service_role/)
  })

  it('10. blocked plan leaves collection store unchanged', async () => {
    expect(v6CollectionStore.listRecent(5)).toHaveLength(0)
    await runV6ShadowTurn({
      turnId: 't10',
      utterance: 'bad',
      deps: {
        invokePlanner: async () => planJson(nearestWire()),
        invokeVerifier: async () => ({
          ok: true,
          result: {
            verdict: 'NOT_FAITHFUL',
            missingRequirements: ['x'],
            contradictedRequirements: [],
            explanation: 'no',
          },
          latencyMs: 1,
          model: 'gpt-5',
        }),
        executePlan: async () => {
          throw new Error('must_not_execute')
        },
      },
    })
    expect(v6CollectionStore.getActive()).toBeNull()
    expect(v6CollectionStore.listRecent(5)).toHaveLength(0)
  })

  it('11–12. approved plan keeps visibleOwner none', async () => {
    const result = await runV6ShadowTurn({
      turnId: 't11',
      utterance: 'ok',
      deps: {
        invokePlanner: async () => planJson(nearestWire()),
        invokeVerifier: async () => faithfulVerify(),
        executePlan: async () => fakeExecution(),
      },
    })
    expect(result.authority.visibleOwner).toBe('none')
  })

  it('h20-style wrong correction plan is blocked when verifier says NOT_FAITHFUL', async () => {
    const executePlan = vi.fn(async () => fakeExecution())
    const result = await runV6ShadowTurn({
      turnId: 't-h20',
      utterance: 'Chodziło o Barnę Brzozową, nie o Pałac Lilii.',
      recentUtterances: ['Pokaż wesela w Pałacu Lilii w 2027.'],
      deps: {
        invokePlanner: async () => planJson(h20Wire()),
        invokeVerifier: async () => ({
          ok: true,
          result: {
            verdict: 'NOT_FAITHFUL',
            missingRequirements: ['replace place not intersect'],
            contradictedRequirements: [],
            explanation: 'Filter on A-snapshot cannot replace A with B',
          },
          latencyMs: 1,
          model: 'gpt-5',
        }),
        executePlan,
      },
    })
    expect(executePlan).toHaveBeenCalledTimes(0)
    expect(result.errorCode).toBe('VERIFICATION_NOT_FAITHFUL')
  })
})

describe('V6-RI2 capability authority', () => {
  it('accepts SORT+SLICE top-N without RANK', () => {
    const parsed = parseTurnPlanWire(top3Wire())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(checkTurnPlanCapability(parsed.plan).verdict).toBe('SUPPORTED')
  })

  it('marks unknown transform op as UNSUPPORTED', () => {
    expect(
      checkTurnPlanCapability({
        steps: [
          {
            id: 't1',
            kind: 'TRANSFORM_COLLECTION',
            inputFromStep: null,
            inputHandle: 'col_1',
            ops: [{ op: 'GroupBy', field: 'place' }],
          },
        ],
        output: { kind: 'COLLECTION', fromStep: 't1' },
      }).verdict,
    ).toBe('UNSUPPORTED')
  })
})

describe('V6-RI2 semantic wire parse', () => {
  it('parses strict verifier JSON', () => {
    const p = parseSemanticVerifierWire({
      verdict: 'FAITHFUL',
      missing_requirements: [],
      contradicted_requirements: [],
      explanation: 'ok',
    })
    expect(p.ok).toBe(true)
  })

  it('rejects bad verdict', () => {
    const p = parseSemanticVerifierWire({
      verdict: 'MAYBE',
      missing_requirements: [],
      contradicted_requirements: [],
      explanation: 'x',
    })
    expect(p.ok).toBe(false)
  })
})
