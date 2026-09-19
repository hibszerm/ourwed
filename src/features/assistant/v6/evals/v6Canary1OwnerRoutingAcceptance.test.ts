/**
 * V6-CANARY-1 — Owner-only visibility routing acceptance (deterministic).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  V6_OWNER_CANARY_USER_ID,
  decideV6CanaryRouting,
  isV6OwnerCanaryVisible,
  setV6OwnerCanaryFlagForTests,
} from '../canary/ownerCanaryGate'
import { renderV6TurnResult } from '../render/renderV6TurnResult'
import {
  enqueueAndAwaitV6ShadowTurn,
  flushV6ShadowQueueForTests,
  getV6ShadowOrchestrationSnapshotForTests,
  resetV6ShadowOrchestrationForTests,
  runV6AssistantShadow,
  setV6ShadowSessionOpen,
  setV6ShadowTurnRunnerForTests,
} from '../shadow'
import type { V6ShadowTurnResult } from '../agent/loop'
import { decideV6Authority } from '../authority/decide'
import { destroyV6CollectionSession } from '../collections/store'

const OWNER = V6_OWNER_CANARY_USER_ID
const OTHER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function baseResult(
  turnId: string,
  patch?: Partial<V6ShadowTurnResult>,
): V6ShadowTurnResult {
  return {
    turnId,
    rounds: 1,
    response: { status: 'final', text: 'ok' },
    toolTrace: [],
    authority: decideV6Authority({ toolOk: true }),
    ...patch,
  }
}

describe('V6-CANARY-1 owner routing', () => {
  beforeEach(() => {
    setV6OwnerCanaryFlagForTests(null)
    resetV6ShadowOrchestrationForTests()
  })

  afterEach(() => {
    setV6OwnerCanaryFlagForTests(null)
    resetV6ShadowOrchestrationForTests()
    destroyV6CollectionSession()
  })

  it('C1 — canary owner + flag ON → V6 visible', () => {
    setV6OwnerCanaryFlagForTests(true)
    expect(isV6OwnerCanaryVisible(OWNER)).toBe(true)
    const r = decideV6CanaryRouting({ authenticatedUserId: OWNER })
    expect(r.v6Visible).toBe(true)
    expect(r.runShadowDiagnostics).toBe(false)
  })

  it('C2 — canary owner + flag OFF → V6 not visible', () => {
    setV6OwnerCanaryFlagForTests(false)
    expect(isV6OwnerCanaryVisible(OWNER)).toBe(false)
    const r = decideV6CanaryRouting({ authenticatedUserId: OWNER })
    expect(r.v6Visible).toBe(false)
    expect(r.runShadowDiagnostics).toBe(true)
  })

  it('C3 — different authenticated user + emergency ON → V6 visible (global rollback)', () => {
    setV6OwnerCanaryFlagForTests(true)
    expect(isV6OwnerCanaryVisible(OTHER)).toBe(true)
    const r = decideV6CanaryRouting({ authenticatedUserId: OTHER })
    expect(r.v6Visible).toBe(true)
    expect(r.runShadowDiagnostics).toBe(false)
  })

  it('C4 — unauthenticated → V6 not visible', () => {
    setV6OwnerCanaryFlagForTests(true)
    expect(isV6OwnerCanaryVisible(null)).toBe(false)
    expect(isV6OwnerCanaryVisible(undefined)).toBe(false)
    expect(isV6OwnerCanaryVisible('')).toBe(false)
    const r = decideV6CanaryRouting({ authenticatedUserId: null })
    expect(r.v6Visible).toBe(false)
  })

  it('C5 — canary owner supported read: exactly one V6 execution (no shadow duplicate)', async () => {
    setV6OwnerCanaryFlagForTests(true)
    setV6ShadowSessionOpen(true)
    let runs = 0
    setV6ShadowTurnRunnerForTests(async (input) => {
      runs += 1
      return baseResult(input.turnId, {
        execution: {
          plan: {
            version: 1,
            steps: [],
            output: { kind: 'COUNT', stepId: 's1' },
          } as never,
          executed: [],
          stepHandleById: {},
          aggregateByStepId: {},
          completeness: {
            ok: true,
            authorizingObservation: {
              kind: 'count_result',
              handle: 'col_1',
              value: 3,
              provenance: 'collection_count',
            },
          },
        },
      })
    })

    const routing = decideV6CanaryRouting({ authenticatedUserId: OWNER })
    expect(routing.v6Visible).toBe(true)
    expect(routing.runShadowDiagnostics).toBe(false)

    // Owner path: await once. Must NOT also fire runV6AssistantShadow.
    const result = await enqueueAndAwaitV6ShadowTurn({
      turnId: 'c5',
      utterance: 'ile ślubów?',
    })
    if (routing.runShadowDiagnostics) {
      runV6AssistantShadow({ turnId: 'c5-shadow', utterance: 'ile ślubów?' })
    }
    await flushV6ShadowQueueForTests()

    expect(runs).toBe(1)
    const visible = renderV6TurnResult(result)
    expect(visible.kind).toBe('scalar')
    if (visible.kind === 'scalar') expect(visible.value).toBe(3)
  })

  it('C6 — unsupported/write-like: safe terminal, no write execution', async () => {
    setV6OwnerCanaryFlagForTests(true)
    setV6ShadowSessionOpen(true)
    let writeLikeExecuted = false
    setV6ShadowTurnRunnerForTests(async (input) => {
      // Simulate capability/unsupported terminal — executor never runs writes.
      return baseResult(input.turnId, {
        response: {
          status: 'unsupported',
          reason: 'Tej akcji nie można jeszcze wykonać przez Zapytaj OurWed.',
        },
        errorCode: 'CAPABILITY_UNSUPPORTED',
        authority: decideV6Authority({
          action: {
            type: 'PrepareAction',
            disabled: true,
            reason: 'writes_not_enabled_in_f1',
          },
        }),
      })
    })

    const result = await enqueueAndAwaitV6ShadowTurn({
      turnId: 'c6',
      utterance: 'stwórz ślub 20.09 Anna i Piotr',
    })
    // Host must not invoke any mutation path when rendering unsupported.
    if (result.response?.status !== 'unsupported') {
      writeLikeExecuted = true
    }
    const visible = renderV6TurnResult(result)
    expect(writeLikeExecuted).toBe(false)
    expect(visible.kind).toBe('unsupported')
    expect(result.errorCode === 'CAPABILITY_UNSUPPORTED' || visible.kind === 'unsupported').toBe(
      true,
    )
  })

  it('C7 — session close destroys / inactivates V6 session state', async () => {
    setV6ShadowSessionOpen(true)
    let started = false
    let resolveRun!: () => void
    const gate = new Promise<void>((r) => {
      resolveRun = r
    })
    setV6ShadowTurnRunnerForTests(async (input) => {
      started = true
      await gate
      return baseResult(input.turnId)
    })

    const pending = enqueueAndAwaitV6ShadowTurn({
      turnId: 'c7-a',
      utterance: 'a',
    })
    enqueueAndAwaitV6ShadowTurn({ turnId: 'c7-b', utterance: 'b' })
    for (let i = 0; i < 50 && !started; i++) {
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(started).toBe(true)

    setV6ShadowSessionOpen(false)
    resolveRun()
    const closed = await pending
    expect(closed.errorCode).toBe('aborted')
    const snap = getV6ShadowOrchestrationSnapshotForTests()
    expect(snap.open).toBe(false)
    expect(snap.queueLength).toBe(0)
  })

  it('C8 — rapid multi-turn: TR1 serialization intact for visible owner', async () => {
    setV6OwnerCanaryFlagForTests(true)
    setV6ShadowSessionOpen(true)
    const order: string[] = []
    setV6ShadowTurnRunnerForTests(async (input) => {
      order.push(`start:${input.turnId}`)
      await new Promise((r) => setTimeout(r, 20))
      order.push(`end:${input.turnId}`)
      return baseResult(input.turnId)
    })

    const a = enqueueAndAwaitV6ShadowTurn({ turnId: 'A', utterance: 'a' })
    const b = enqueueAndAwaitV6ShadowTurn({ turnId: 'B', utterance: 'b' })
    const c = enqueueAndAwaitV6ShadowTurn({ turnId: 'C', utterance: 'c' })
    const results = await Promise.all([a, b, c])

    expect(order).toEqual([
      'start:A',
      'end:A',
      'start:B',
      'end:B',
      'start:C',
      'end:C',
    ])
    expect(results.map((r) => r.turnId)).toEqual(['A', 'B', 'C'])
    expect(results.every((r) => r.errorCode !== 'aborted')).toBe(true)
  })
})
