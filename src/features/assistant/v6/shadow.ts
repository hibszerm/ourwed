/**
 * V6-F1 — Shadow session runner (fire-and-forget from Host).
 * Never mutates V3 WorkingContext or V5 goalClarificationSession.
 */

import { runV6ShadowTurn, destroyV6CollectionSession } from './agent/loop'
import { emitV6Diagnostic } from './diagnostics/emit'

type ShadowSession = {
  open: boolean
  generation: number
  abort: AbortController | null
}

const session: ShadowSession = {
  open: false,
  generation: 0,
  abort: null,
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

export function runV6AssistantShadow(input: {
  turnId: string
  utterance: string
  recentUtterances?: string[]
}): void {
  if (!session.open) return
  const generation = session.generation
  session.abort?.abort()
  const abort = new AbortController()
  session.abort = abort

  void runV6ShadowTurn({
    turnId: input.turnId,
    utterance: input.utterance,
    recentUtterances: input.recentUtterances,
    signal: abort.signal,
  })
    .then((result) => {
      if (generation !== session.generation) return
      emitV6Diagnostic({
        turnId: result.turnId,
        round: result.rounds,
        authority: result.authority.status,
        failureCode: result.errorCode,
        detail: `tools:${result.toolTrace.length}`,
      })
    })
    .catch((e) => {
      emitV6Diagnostic({
        turnId: input.turnId,
        failureCode: 'PROVIDER_ERROR',
        detail: e instanceof Error ? e.message : 'shadow_failed',
      })
    })
}
