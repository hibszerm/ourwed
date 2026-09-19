/**
 * V6-TR1 — Serialized shadow orchestration (mocked turns; no live LLM).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  destroyV6CollectionSession,
  v6CollectionStore,
} from '../collections/store'
import {
  flushV6ShadowQueueForTests,
  getV6ShadowOrchestrationSnapshotForTests,
  invalidateV6ShadowTurn,
  resetV6ShadowOrchestrationForTests,
  runV6AssistantShadow,
  setV6ShadowSessionOpen,
  setV6ShadowTurnRunnerForTests,
} from '../shadow'
import type { V6ShadowTurnResult } from '../agent/loop'
import { decideV6Authority } from '../authority/decide'

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

describe('V6-TR1 shadow orchestration', () => {
  beforeEach(() => {
    resetV6ShadowOrchestrationForTests()
    setV6ShadowSessionOpen(true)
  })

  afterEach(() => {
    resetV6ShadowOrchestrationForTests()
  })

  it('T1 — single turn completes normally', async () => {
    const order: string[] = []
    setV6ShadowTurnRunnerForTests(async (input) => {
      order.push(`run:${input.turnId}`)
      expect(input.signal?.aborted).toBe(false)
      return baseResult(input.turnId, {
        toolTrace: [
          {
            round: 1,
            name: 'query_collection',
            ok: true,
            outputHandle: 'col_1',
          },
        ],
      })
    })

    runV6AssistantShadow({ turnId: 'A', utterance: 'pokaż wesela' })
    await flushV6ShadowQueueForTests()
    expect(order).toEqual(['run:A'])
    expect(getV6ShadowOrchestrationSnapshotForTests().queueLength).toBe(0)
  })

  it('T2 — rapid second turn does not abort prior', async () => {
    let releaseA!: () => void
    const aGate = new Promise<void>((r) => {
      releaseA = r
    })
    const events: string[] = []
    let aSignal: AbortSignal | undefined

    setV6ShadowTurnRunnerForTests(async (input) => {
      events.push(`start:${input.turnId}`)
      if (input.turnId === 'A') {
        aSignal = input.signal
        await aGate
      }
      events.push(`end:${input.turnId}`)
      return baseResult(input.turnId)
    })

    runV6AssistantShadow({ turnId: 'A', utterance: 'turn a' })
    await vi.waitFor(() => {
      expect(events).toContain('start:A')
    })
    runV6AssistantShadow({ turnId: 'B', utterance: 'turn b' })
    await new Promise((r) => setTimeout(r, 20))
    expect(aSignal?.aborted).toBe(false)
    expect(events).not.toContain('start:B')
    releaseA()
    await flushV6ShadowQueueForTests()
    expect(events).toEqual(['start:A', 'end:A', 'start:B', 'end:B'])
  })

  it('T3 — B sees collection committed by A', async () => {
    const seen: Array<string | null> = []
    setV6ShadowTurnRunnerForTests(async (input) => {
      seen.push(v6CollectionStore.getActive()?.handle ?? null)
      if (input.turnId === 'A') {
        v6CollectionStore.create({
          source: 'wedding',
          semanticDefinition: {
            source: 'wedding',
            filters: [],
            excludePlaces: [],
            relativeTemporal: null,
            sort: null,
            slice: { limit: 3 },
            transformOps: [],
          },
          ordering: { field: 'wedding.date', direction: 'asc' },
          totalCount: 3,
          parentHandle: null,
          createdAtTurn: 'A',
          fetchedAt: new Date().toISOString(),
          snapshotMemberIds: ['w1', 'w2', 'w3'],
          preview: [],
        })
      }
      return baseResult(input.turnId)
    })

    runV6AssistantShadow({ turnId: 'A', utterance: 'trzy najbliższe' })
    runV6AssistantShadow({
      turnId: 'B',
      utterance: 'ile od nich zostało',
      recentUtterances: ['trzy najbliższe'],
    })
    await flushV6ShadowQueueForTests()
    expect(seen[0]).toBe(null)
    expect(seen[1]).toBe('col_1')
    expect(v6CollectionStore.getActive()?.handle).toBe('col_1')
  })

  it('T4 — blocked A creates no collection; B still runs after', async () => {
    setV6ShadowTurnRunnerForTests(async (input) => {
      if (input.turnId === 'A') {
        return baseResult(input.turnId, {
          response: {
            status: 'error',
            code: 'VERIFICATION_NOT_FAITHFUL',
            message: 'blocked',
          },
          errorCode: 'VERIFICATION_NOT_FAITHFUL',
          semanticVerifierVerdict: 'NOT_FAITHFUL',
        })
      }
      return baseResult(input.turnId)
    })

    runV6AssistantShadow({ turnId: 'A', utterance: 'bad plan' })
    runV6AssistantShadow({ turnId: 'B', utterance: 'next' })
    await flushV6ShadowQueueForTests()
    expect(v6CollectionStore.getActive()).toBe(null)
  })

  it('T5 — slow verifier signal not aborted by next turn', async () => {
    let releaseA!: () => void
    const aGate = new Promise<void>((r) => {
      releaseA = r
    })
    let aAbortedDuringOverlap = false

    setV6ShadowTurnRunnerForTests(async (input) => {
      if (input.turnId === 'A') {
        // Simulate post-planner / mid-verifier wait.
        const timer = setInterval(() => {
          if (input.signal?.aborted) aAbortedDuringOverlap = true
        }, 5)
        await aGate
        clearInterval(timer)
      }
      return baseResult(input.turnId)
    })

    runV6AssistantShadow({ turnId: 'A', utterance: 'slow a' })
    await new Promise((r) => setTimeout(r, 15))
    runV6AssistantShadow({ turnId: 'B', utterance: 'b' })
    await new Promise((r) => setTimeout(r, 30))
    expect(aAbortedDuringOverlap).toBe(false)
    releaseA()
    await flushV6ShadowQueueForTests()
  })

  it('T6 — session close invalidates in-flight and queued work', async () => {
    let releaseA!: () => void
    const aGate = new Promise<void>((r) => {
      releaseA = r
    })
    let aSignal: AbortSignal | undefined
    const completed: string[] = []

    setV6ShadowTurnRunnerForTests(async (input) => {
      if (input.turnId === 'A') {
        aSignal = input.signal
        await aGate
        // Late commit attempt after close.
        v6CollectionStore.create({
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
          totalCount: 1,
          parentHandle: null,
          createdAtTurn: 'A',
          fetchedAt: new Date().toISOString(),
          snapshotMemberIds: ['x'],
          preview: [],
        })
      }
      completed.push(input.turnId)
      return baseResult(input.turnId)
    })

    runV6AssistantShadow({ turnId: 'A', utterance: 'a' })
    await new Promise((r) => setTimeout(r, 10))
    runV6AssistantShadow({ turnId: 'B', utterance: 'b' })
    setV6ShadowSessionOpen(false)
    expect(aSignal?.aborted).toBe(true)
    expect(getV6ShadowOrchestrationSnapshotForTests().queueLength).toBe(0)
    releaseA()
    await flushV6ShadowQueueForTests()
    expect(completed).toContain('A')
    expect(completed).not.toContain('B')
    expect(v6CollectionStore.getActive()).toBe(null)
  })

  it('T7 — A,B,C complete in conversational order without overwrite', async () => {
    const order: string[] = []
    setV6ShadowTurnRunnerForTests(async (input) => {
      order.push(input.turnId)
      v6CollectionStore.create({
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
        totalCount: 1,
        parentHandle: null,
        createdAtTurn: input.turnId,
        fetchedAt: new Date().toISOString(),
        snapshotMemberIds: [input.turnId],
        preview: [],
      })
      await new Promise((r) => setTimeout(r, 5))
      return baseResult(input.turnId)
    })

    runV6AssistantShadow({ turnId: 'A', utterance: 'a' })
    runV6AssistantShadow({ turnId: 'B', utterance: 'b' })
    runV6AssistantShadow({ turnId: 'C', utterance: 'c' })
    await flushV6ShadowQueueForTests()
    expect(order).toEqual(['A', 'B', 'C'])
    expect(v6CollectionStore.getActive()?.createdAtTurn).toBe('C')
    expect(v6CollectionStore.listRecent(5).map((c) => c.createdAtTurn)).toEqual(
      ['C', 'B', 'A'],
    )
  })

  it('T8 — visible path independence (enqueue returns immediately)', async () => {
    let releaseA!: () => void
    const aGate = new Promise<void>((r) => {
      releaseA = r
    })
    setV6ShadowTurnRunnerForTests(async (input) => {
      if (input.turnId === 'A') await aGate
      return baseResult(input.turnId)
    })

    const t0 = Date.now()
    runV6AssistantShadow({ turnId: 'A', utterance: 'slow' })
    const enqueueMs = Date.now() - t0
    expect(enqueueMs).toBeLessThan(50)
    // Visible path would continue here without awaiting V6.
    expect(getV6ShadowOrchestrationSnapshotForTests().running).toBe(true)
    releaseA()
    await flushV6ShadowQueueForTests()
  })

  it('invalidate still aborts current without requiring queue redesign', async () => {
    let releaseA!: () => void
    const aGate = new Promise<void>((r) => {
      releaseA = r
    })
    let aSignal: AbortSignal | undefined
    setV6ShadowTurnRunnerForTests(async (input) => {
      aSignal = input.signal
      await aGate
      return baseResult(input.turnId)
    })
    runV6AssistantShadow({ turnId: 'A', utterance: 'a' })
    await new Promise((r) => setTimeout(r, 10))
    invalidateV6ShadowTurn({ wipeAll: true, reason: 'assistant_close' })
    expect(aSignal?.aborted).toBe(true)
    releaseA()
    await flushV6ShadowQueueForTests()
    destroyV6CollectionSession()
  })
})
