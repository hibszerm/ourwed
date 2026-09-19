/**
 * V6-F1 / V6-TR1 / V6-CANARY-1 — Shadow session runner.
 * Never mutates V3 WorkingContext or V5 goalClarificationSession.
 *
 * TR1: serialize V6 turns in conversational order.
 * A new NL turn enqueues; it does NOT abort a prior in-flight turn.
 * Session close / wipe still aborts the current turn and drops the queue.
 *
 * CANARY-1: enqueueAndAwaitV6ShadowTurn for owner-visible path (one execution).
 */

import {
  runV6ShadowTurn,
  destroyV6CollectionSession,
  type V6ShadowTurnResult,
} from './agent/loop'
import { decideV6Authority } from './authority/decide'
import { emitV6Diagnostic } from './diagnostics/emit'

type ShadowTurnRunner = (input: {
  turnId: string
  utterance: string
  recentUtterances?: string[]
  signal?: AbortSignal
}) => Promise<V6ShadowTurnResult>

type QueuedShadowTurn = {
  turnId: string
  utterance: string
  recentUtterances?: string[]
  generation: number
  resolve: (result: V6ShadowTurnResult) => void
  reject: (error: unknown) => void
}

type ShadowSession = {
  open: boolean
  generation: number
  abort: AbortController | null
  queue: QueuedShadowTurn[]
  running: boolean
  runner: ShadowTurnRunner
}

const session: ShadowSession = {
  open: false,
  generation: 0,
  abort: null,
  queue: [],
  running: false,
  runner: runV6ShadowTurn,
}

function sessionInvalidatedResult(turnId: string): V6ShadowTurnResult {
  return {
    turnId,
    rounds: 0,
    response: {
      status: 'error',
      code: 'aborted',
      message: 'session_invalidated',
    },
    toolTrace: [],
    authority: decideV6Authority({ toolOk: false }),
    errorCode: 'aborted',
  }
}

export function setV6ShadowSessionOpen(open: boolean): void {
  session.open = open
  if (!open) {
    invalidateV6ShadowTurn({ wipeAll: true, reason: 'assistant_close' })
  }
}

export function invalidateV6ShadowTurn(input?: {
  wipeAll?: boolean
  reason?: string
}): void {
  session.generation += 1
  const dropped = session.queue.splice(0, session.queue.length)
  for (const job of dropped) {
    job.resolve(sessionInvalidatedResult(job.turnId))
  }
  session.abort?.abort()
  session.abort = null
  if (input?.wipeAll) {
    destroyV6CollectionSession()
  }
  emitV6Diagnostic({
    turnId: 'session',
    detail: input?.reason ?? 'invalidate',
  })
}

/**
 * Enqueue a V6 turn and await terminal completion (TR1 FIFO preserved).
 * Owner-visible canary uses this once — no shadow duplicate.
 */
export function enqueueAndAwaitV6ShadowTurn(input: {
  turnId: string
  utterance: string
  recentUtterances?: string[]
}): Promise<V6ShadowTurnResult> {
  if (!session.open) {
    return Promise.resolve(sessionInvalidatedResult(input.turnId))
  }
  return new Promise<V6ShadowTurnResult>((resolve, reject) => {
    session.queue.push({
      turnId: input.turnId,
      utterance: input.utterance,
      recentUtterances: input.recentUtterances,
      generation: session.generation,
      resolve,
      reject,
    })
    emitV6Diagnostic({
      turnId: input.turnId,
      detail: 'QUEUED',
    })
    void pumpV6ShadowQueue()
  })
}

/**
 * Enqueue a V6 shadow turn. Does not block the visible V3/V5 path.
 * Prior in-flight turns continue; this job runs after them (FIFO).
 */
export function runV6AssistantShadow(input: {
  turnId: string
  utterance: string
  recentUtterances?: string[]
}): void {
  void enqueueAndAwaitV6ShadowTurn(input).catch((e) => {
    emitV6Diagnostic({
      turnId: input.turnId,
      failureCode: 'PROVIDER_ERROR',
      detail: e instanceof Error ? e.message : 'shadow_failed',
    })
  })
}

async function pumpV6ShadowQueue(): Promise<void> {
  if (session.running) return
  session.running = true
  try {
    while (session.open && session.queue.length > 0) {
      const job = session.queue.shift()
      if (!job) break
      if (job.generation !== session.generation) {
        emitV6Diagnostic({
          turnId: job.turnId,
          detail: 'SESSION_INVALIDATED',
        })
        job.resolve(sessionInvalidatedResult(job.turnId))
        continue
      }

      const abort = new AbortController()
      session.abort = abort
      emitV6Diagnostic({
        turnId: job.turnId,
        detail: 'STARTED',
      })

      try {
        const result = await session.runner({
          turnId: job.turnId,
          utterance: job.utterance,
          recentUtterances: job.recentUtterances,
          signal: abort.signal,
        })

        if (job.generation !== session.generation) {
          // Late commits after session close must not survive.
          destroyV6CollectionSession()
          emitV6Diagnostic({
            turnId: job.turnId,
            detail: 'SESSION_INVALIDATED',
            failureCode: result.errorCode,
          })
          job.resolve(sessionInvalidatedResult(job.turnId))
          continue
        }

        emitV6Diagnostic({
          turnId: result.turnId,
          round: result.rounds,
          authority: result.authority.status,
          failureCode: result.errorCode,
          detail: `COMPLETED:tools:${result.toolTrace.length}`,
        })
        job.resolve(result)
      } catch (e) {
        if (job.generation !== session.generation) {
          destroyV6CollectionSession()
          emitV6Diagnostic({
            turnId: job.turnId,
            detail: 'SESSION_INVALIDATED',
          })
          job.resolve(sessionInvalidatedResult(job.turnId))
        } else {
          emitV6Diagnostic({
            turnId: job.turnId,
            failureCode: 'PROVIDER_ERROR',
            detail: e instanceof Error ? e.message : 'shadow_failed',
          })
          job.reject(e)
        }
      } finally {
        if (session.abort === abort) {
          session.abort = null
        }
      }
    }
  } finally {
    session.running = false
    if (session.open && session.queue.length > 0) {
      void pumpV6ShadowQueue()
    }
  }
}

/** Test-only: replace the shadow turn runner (deterministic mocks). */
export function setV6ShadowTurnRunnerForTests(
  runner: ShadowTurnRunner | null,
): void {
  session.runner = runner ?? runV6ShadowTurn
}

/** Test-only: reset module session without emitting close diagnostics twice. */
export function resetV6ShadowOrchestrationForTests(): void {
  session.open = false
  session.generation = 0
  const dropped = session.queue.splice(0, session.queue.length)
  for (const job of dropped) {
    job.resolve(sessionInvalidatedResult(job.turnId))
  }
  session.running = false
  session.abort?.abort()
  session.abort = null
  session.runner = runV6ShadowTurn
  destroyV6CollectionSession()
}

/** Test-only introspection. */
export function getV6ShadowOrchestrationSnapshotForTests(): {
  open: boolean
  generation: number
  queueLength: number
  running: boolean
  hasAbort: boolean
} {
  return {
    open: session.open,
    generation: session.generation,
    queueLength: session.queue.length,
    running: session.running,
    hasAbort: session.abort != null,
  }
}

/** Test-only: wait until queue drains and runner is idle. */
export async function flushV6ShadowQueueForTests(): Promise<void> {
  for (let i = 0; i < 500; i++) {
    const snap = getV6ShadowOrchestrationSnapshotForTests()
    if (!snap.running && snap.queueLength === 0) return
    await new Promise((r) => setTimeout(r, 10))
  }
}
