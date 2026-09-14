/**
 * U4 — V5 GoalSpec shadow runner (DEV only).
 * Parallel to V3 authority. Never mutates production WorkingContext.
 *
 * NL → interpretGoalSpec → bindGoalSpecWithClarification
 * → NeedsClarification → GoalClarificationRequest (U3)
 * OR BoundGoal → shadow active collection only
 */

import type { DomainQuery } from '../domainQuery/domainQuery'
import { isAssistantV5GoalShadowEnabled } from '../flag'
import {
  bindGoalSpecWithClarification,
} from './resumeGoalClarification'
import {
  getGoalClarificationActiveCollection,
  setPendingGoalClarification,
} from './goalClarificationSession'
import type { GoalClarificationRequest } from './goalClarificationTypes'
import type { GoalSpec } from './goalSpec'
import {
  interpretGoalSpec,
  type GoalInterpretResult,
  type GoalInterpretSemanticContext,
} from './interpretGoalSpec'
import type { BoundGoal } from './boundGoal'
import { normalizeDomainQuerySemantics } from './compareGoalSpecSemantics'
import { validateGoalSpecConsistency } from './validateGoalSpec'

export type V5GoalShadowDiagnostic = {
  turnId: string
  outcome:
    | 'bound'
    | 'needs_clarification'
    | 'unsupported'
    | 'interpret_error'
    | 'discarded'
    | 'skipped_flag_off'
  clarificationSlot?: string
  clarificationId?: string
  reason?: string
  /** Typed outcome without prose / PII (PC1). */
  outcomeCode?:
    | 'unsupported'
    | 'interpreter_schema_error'
    | 'interpreter_provider_error'
    | 'interpreter_invoke_error'
    | 'interpreter_empty'
    | 'stale_or_closed'
    | 'skipped_flag_off'
  requestKind?: string | null
  model?: string
  latencyMs?: number
}

export type V5GoalShadowResult =
  | {
      status: 'bound'
      turnId: string
      generation: number
      goalSpec: GoalSpec
      bound: BoundGoal
      query: DomainQuery
      diagnostic: V5GoalShadowDiagnostic
    }
  | {
      status: 'needs_clarification'
      turnId: string
      generation: number
      goalSpec: GoalSpec
      request: GoalClarificationRequest
      diagnostic: V5GoalShadowDiagnostic
    }
  | {
      status: 'unsupported' | 'interpret_error' | 'discarded' | 'skipped'
      turnId: string
      generation: number
      diagnostic: V5GoalShadowDiagnostic
    }

type ShadowSession = {
  generation: number
  activeTurnId: string | null
  abort: AbortController | null
  open: boolean
  lastBoundQuery: DomainQuery | null
  lastBoundGoalSpec: GoalSpec | null
  interpretCallCount: number
}

const session: ShadowSession = {
  generation: 0,
  activeTurnId: null,
  abort: null,
  open: true,
  lastBoundQuery: null,
  lastBoundGoalSpec: null,
  interpretCallCount: 0,
}

const listeners = new Set<(d: V5GoalShadowDiagnostic) => void>()

export function subscribeV5GoalShadowDiagnostics(
  fn: (d: V5GoalShadowDiagnostic) => void,
): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emitDiag(d: V5GoalShadowDiagnostic): void {
  for (const fn of listeners) {
    try {
      fn(d)
    } catch {
      /* ignore */
    }
  }
  if (import.meta.env?.DEV) {
    console.debug('[assistant-v5-goal-shadow]', d)
  }
}

export function getV5GoalShadowInterpretCallCount(): number {
  return session.interpretCallCount
}

export function resetV5GoalShadowInterpretCallCount(): void {
  session.interpretCallCount = 0
}

export function setV5GoalShadowSessionOpen(open: boolean): void {
  session.open = open
}

export function getV5GoalShadowActiveTurnId(): string | null {
  return session.activeTurnId
}

export function getV5GoalShadowGeneration(): number {
  return session.generation
}

export function getV5GoalShadowLastBoundQuery(): DomainQuery | null {
  return session.lastBoundQuery
}

/** Compact semantic context for next interpret — no CRM rows. */
export function buildV5GoalShadowSemanticContext(input?: {
  pageResourceKind?: 'wedding' | 'session' | null
}): GoalInterpretSemanticContext {
  const q =
    getGoalClarificationActiveCollection() ?? session.lastBoundQuery
  const n = q ? normalizeDomainQuerySemantics(q) : null
  const prev = session.lastBoundGoalSpec
  return {
    previousGoalSummary: prev
      ? {
          requestKind: prev.requestKind,
          source: prev.source,
          aggregation: prev.aggregation,
          measure: prev.measure,
            placeName:
              typeof n?.placeName === 'string' ? n.placeName : null,
          temporalExpression: prev.temporal?.expression ?? null,
        }
      : n
        ? {
            requestKind: 'domain_query',
            source: 'wedding',
            aggregation:
              n.aggregate === 'sum'
                ? 'sum'
                : n.aggregate === 'count'
                  ? 'count'
                  : n.aggregate === null
                    ? 'list'
                    : null,
            measure: n.measure,
            placeName: typeof n.placeName === 'string' ? n.placeName : null,
            temporalExpression: null,
          }
        : null,
    hasActiveCollection: Boolean(q),
    pageResourceKind: input?.pageResourceKind ?? null,
  }
}

/**
 * Invalidate in-flight + pending ownership for a new turn or close.
 * Does not clear clarified active DomainQuery (follow-up SoT) unless wipeAll.
 */
export function invalidateV5GoalShadowTurn(input?: {
  wipeAll?: boolean
  reason?: string
}): void {
  session.generation += 1
  const prevTurn = session.activeTurnId
  session.activeTurnId = null
  session.abort?.abort()
  session.abort = null
  if (prevTurn) {
    emitDiag({
      turnId: prevTurn,
      outcome: 'discarded',
      reason: input?.reason ?? 'invalidated',
    })
  }
  if (input?.wipeAll) {
    session.lastBoundQuery = null
    session.lastBoundGoalSpec = null
    session.open = false
  }
}

export type RunV5GoalSpecShadowInput = {
  turnId: string
  userText: string
  pageResourceKind?: 'wedding' | 'session' | null
  /** Test-only: bypass feature flag. */
  force?: boolean
  /** Inject for tests — default interpretGoalSpec (Edge / fixture). */
  interpret?: (input: {
    userText: string
    semanticContext?: GoalInterpretSemanticContext | null
    signal?: AbortSignal
  }) => Promise<GoalInterpretResult>
  onResult: (result: V5GoalShadowResult) => void
}

/**
 * Awaitable V5 GoalSpec pipeline for IC1 ownership (decide before V3 render).
 * Same semantics as fire-and-forget runner.
 */
export function runV5GoalSpecShadowAsync(
  input: Omit<RunV5GoalSpecShadowInput, 'onResult'>,
): Promise<V5GoalShadowResult> {
  return new Promise((resolve) => {
    runV5GoalSpecShadow({
      ...input,
      onResult: resolve,
    })
  })
}

/**
 * Fire-and-forget V5 GoalSpec shadow for one NL turn.
 * Caller must invalidate previous turn before starting a new one.
 */
export function runV5GoalSpecShadow(input: RunV5GoalSpecShadowInput): void {
    if (!input.force && !isAssistantV5GoalShadowEnabled()) {
    const diagnostic: V5GoalShadowDiagnostic = {
      turnId: input.turnId,
      outcome: 'skipped_flag_off',
      outcomeCode: 'skipped_flag_off',
      requestKind: null,
    }
    emitDiag(diagnostic)
    input.onResult({
      status: 'skipped',
      turnId: input.turnId,
      generation: session.generation,
      diagnostic,
    })
    return
  }

  const generation = session.generation
  session.activeTurnId = input.turnId
  session.abort?.abort()
  const abort = new AbortController()
  session.abort = abort

  const interpret = input.interpret ?? interpretGoalSpec

  void (async () => {
    const semanticContext = buildV5GoalShadowSemanticContext({
      pageResourceKind: input.pageResourceKind,
    })

    session.interpretCallCount += 1
    let interpreted: GoalInterpretResult
    try {
      interpreted = await interpret({
        userText: input.userText,
        semanticContext,
        signal: abort.signal,
      })
    } catch {
      interpreted = {
        ok: false,
        error: 'invoke_error',
        code: 'invoke_error',
        latencyMs: 0,
      }
    }

    if (
      !session.open ||
      abort.signal.aborted ||
      session.generation !== generation ||
      session.activeTurnId !== input.turnId
    ) {
      const diagnostic: V5GoalShadowDiagnostic = {
        turnId: input.turnId,
        outcome: 'discarded',
        reason: 'stale_or_closed',
        latencyMs: interpreted.latencyMs,
      }
      emitDiag(diagnostic)
      input.onResult({
        status: 'discarded',
        turnId: input.turnId,
        generation,
        diagnostic,
      })
      return
    }

    if (!interpreted.ok) {
      const code = interpreted.code
      const outcomeCode =
        code === 'schema_error' || code === 'empty_response'
          ? 'interpreter_schema_error'
          : code === 'provider_error'
            ? 'interpreter_provider_error'
            : code === 'empty_utterance'
              ? 'interpreter_empty'
              : 'interpreter_invoke_error'
      const diagnostic: V5GoalShadowDiagnostic = {
        turnId: input.turnId,
        outcome: 'interpret_error',
        reason: interpreted.code ?? interpreted.error,
        outcomeCode,
        requestKind: null,
        latencyMs: interpreted.latencyMs,
        model: undefined,
      }
      emitDiag(diagnostic)
      input.onResult({
        status: 'interpret_error',
        turnId: input.turnId,
        generation,
        diagnostic,
      })
      return
    }

    const validated = validateGoalSpecConsistency(interpreted.goalSpec)
    const goalForBind = validated.goal

    const bound = bindGoalSpecWithClarification({
      goal: goalForBind,
      activeCollectionQuery:
        getGoalClarificationActiveCollection() ?? session.lastBoundQuery,
      storePending: true,
    })

    if (
      !session.open ||
      session.generation !== generation ||
      session.activeTurnId !== input.turnId
    ) {
      const diagnostic: V5GoalShadowDiagnostic = {
        turnId: input.turnId,
        outcome: 'discarded',
        reason: 'stale_after_bind',
        model: interpreted.model,
        latencyMs: interpreted.latencyMs,
      }
      emitDiag(diagnostic)
      input.onResult({
        status: 'discarded',
        turnId: input.turnId,
        generation,
        diagnostic,
      })
      return
    }

    if (bound.status === 'needs_clarification') {
      setPendingGoalClarification(bound.request)
      const diagnostic: V5GoalShadowDiagnostic = {
        turnId: input.turnId,
        outcome: 'needs_clarification',
        clarificationSlot: bound.request.slot,
        clarificationId: bound.request.id,
        model: interpreted.model,
        latencyMs: interpreted.latencyMs,
      }
      emitDiag(diagnostic)
      input.onResult({
        status: 'needs_clarification',
        turnId: input.turnId,
        generation,
        goalSpec: bound.goalSpec,
        request: bound.request,
        diagnostic,
      })
      return
    }

    if (bound.status === 'bound') {
      session.lastBoundQuery = bound.query
      session.lastBoundGoalSpec = bound.goalSpec
      const diagnostic: V5GoalShadowDiagnostic = {
        turnId: input.turnId,
        outcome: 'bound',
        model: interpreted.model,
        latencyMs: interpreted.latencyMs,
      }
      emitDiag(diagnostic)
      input.onResult({
        status: 'bound',
        turnId: input.turnId,
        generation,
        goalSpec: bound.goalSpec,
        bound: bound.goal,
        query: bound.query,
        diagnostic,
      })
      return
    }

    const diagnostic: V5GoalShadowDiagnostic = {
      turnId: input.turnId,
      outcome: 'unsupported',
      reason: bound.reason,
      outcomeCode: 'unsupported',
      requestKind: goalForBind.requestKind ?? null,
      model: interpreted.model,
      latencyMs: interpreted.latencyMs,
    }
    emitDiag(diagnostic)
    input.onResult({
      status: 'unsupported',
      turnId: input.turnId,
      generation,
      diagnostic,
    })
  })()
}

/** Test helper: wipe shadow session counters and ownership. */
export function resetV5GoalShadowSessionForTests(): void {
  session.abort?.abort()
  session.generation = 0
  session.activeTurnId = null
  session.abort = null
  session.open = true
  session.lastBoundQuery = null
  session.lastBoundGoalSpec = null
  session.interpretCallCount = 0
}
