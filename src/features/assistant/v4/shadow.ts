/**
 * DEV/test shadow interpreter + resolver (+ Phase 3C registry shadow execution).
 * Never blocks V3 visible path. Never mutates V3 state / clarification / writes.
 */

import type { AssistantWorkingContext } from '../api/workingContext'
import { emptyWorkingContext } from '../api/workingContext'
import type { AssistantDomainRequest, AssistantResponse } from '../types'
import { compareCoarse, taskSpecToCoarse, v3DomainToCoarse } from './compare'
import { capabilityResultToFinanceExecution } from './capabilities/adaptFinanceResult'
import { runV4CapabilityExecution } from './capabilities/runtime'
import {
  peekLastExecutedCollectionQuery,
  peekCollectionQueryExecutionExtras,
} from './capabilities/collection/collectionQueryCapability'
import { scheduleDomainQueryAgreementShadow } from './domainQuery/domainQueryAgreementShadow'
import { domainQueryObservationToCollectionObservation } from './domainQuery/executeCollectionDomainQueryPrimary'
import type { CapabilityExecutionResult } from './capabilities/types'
import { compareV4FinanceWithV3Response } from './execution/compareFinanceShadow'
import { compareV4PlaceWithV3Response } from './execution/comparePlaceShadow'
import { compareV4TimeWithV3Response } from './execution/compareTimeShadow'
import type {
  V4FinanceExecutionResult,
  V4FinanceShadowComparison,
} from './execution/financeTypes'
import type { V4PlaceShadowComparison } from './execution/comparePlaceShadow'
import type { V4TimeShadowComparison } from './execution/compareTimeShadow'
import {
  isAnyV4CapabilityExecutionEnabled,
  isAssistantV4FinanceExecutionEnabled,
  isAssistantV4ShadowEnabled,
} from './flag'
import { interpretTaskSpec } from './interpreter'
import { adaptWorkingContextToV4ShadowContext } from './resolver/adaptV3'
import { applyPageContextToV4ShadowContext } from './resolver/pageContext'
import { resolveTaskSpec } from './resolver/resolve'
import {
  applyAssistantV4ShadowTransition,
  clearAssistantV4ShadowSession,
  getAssistantV4LastCapabilityExecution,
  getAssistantV4LastFinanceExecution,
  mergeShadowOverlay,
  previousTaskSummaryForInterpreter,
} from './resolver/shadowState'
import { clearGoalClarificationSession } from './goalSpec/goalClarificationSession'
import {
  invalidateV5GoalShadowTurn,
  setV5GoalShadowSessionOpen,
} from './goalSpec/v5GoalSpecShadow'
import type { ResolvedTaskResult } from './resolver/types'
import type { AssistantTaskSpec, TaskSpecSemanticContext } from './taskSpec'
import type { PageContextHint } from '../types'

export type V4ShadowDomainComparison =
  | { domain: 'finance'; comparison: V4FinanceShadowComparison }
  | { domain: 'place'; comparison: V4PlaceShadowComparison }
  | { domain: 'time'; comparison: V4TimeShadowComparison }

export type ShadowTrace = {
  turnId: string
  utterancePreview: string
  latencyMs: number
  validationOk: boolean
  taskSpec: AssistantTaskSpec | null
  resolution: ResolvedTaskResult | null
  resolverMs: number
  capabilityExecution: CapabilityExecutionResult | null
  capabilityExecuteMs: number
  /** Finance-shaped view when last execution was finance (compat). */
  financeExecution: V4FinanceExecutionResult | null
  financeExecuteMs: number
  financeComparison: V4FinanceShadowComparison | null
  domainComparison: V4ShadowDomainComparison | null
  error: string | null
  v3Coarse: ReturnType<typeof v3DomainToCoarse>
  agreement: ReturnType<typeof compareCoarse> | null
  classification:
    | 'agree'
    | 'disagree'
    | 'v4_error'
    | 'v3_missing'
    | 'dropped'
}

type ShadowListener = (trace: ShadowTrace) => void

const listeners = new Set<ShadowListener>()
const inFlightTurns = new Set<string>()
/** Per-turn capability result awaiting V3 comparison. */
const pendingCapabilityByTurn = new Map<
  string,
  CapabilityExecutionResult | null
>()

export function clearAssistantV4ShadowSessionAndPending(): void {
  clearAssistantV4ShadowSession()
  pendingCapabilityByTurn.clear()
  inFlightTurns.clear()
  // U2: destroy ephemeral GoalSpec clarification with the Assistant session.
  clearGoalClarificationSession()
  // U4: invalidate in-flight V5 GoalSpec shadow ownership.
  invalidateV5GoalShadowTurn({ wipeAll: true, reason: 'assistant_close' })
  setV5GoalShadowSessionOpen(false)
}

export {
  clearAssistantV4ShadowSession,
  getAssistantV4LastFinanceExecution,
  getAssistantV4LastCapabilityExecution,
}

export function subscribeAssistantV4Shadow(listener: ShadowListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function financeViewFromCapability(
  result: CapabilityExecutionResult | null,
): V4FinanceExecutionResult | null {
  if (!result) return null
  if (result.status === 'success') {
    if (result.observation.kind !== 'money') return null
    return capabilityResultToFinanceExecution(result)
  }
  if (result.status === 'disabled') return null
  if (result.status === 'not_found' || result.status === 'error') {
    if (result.capabilityId && result.capabilityId !== 'wedding.finance.get') {
      return null
    }
    return capabilityResultToFinanceExecution(result)
  }
  if (
    result.status === 'needs_clarification' ||
    result.status === 'unsupported' ||
    result.status === 'conflict'
  ) {
    return capabilityResultToFinanceExecution(result)
  }
  return null
}

function emit(trace: ShadowTrace): void {
  for (const listener of listeners) {
    try {
      listener(trace)
    } catch {
      /* ignore */
    }
  }
  if (import.meta.env?.DEV) {
    const cap = trace.capabilityExecution
    console.debug('[assistant-v4-shadow]', {
      turnId: trace.turnId,
      utterancePreview: trace.utterancePreview,
      latencyMs: trace.latencyMs,
      resolverMs: trace.resolverMs,
      capabilityExecuteMs: trace.capabilityExecuteMs,
      validationOk: trace.validationOk,
      op: trace.taskSpec?.op ?? null,
      subject: trace.taskSpec?.subject ?? null,
      resolution: trace.resolution?.status ?? null,
      capabilityId:
        cap && 'capabilityId' in cap ? cap.capabilityId : null,
      capabilityStatus: cap?.status ?? null,
      observationKind:
        cap?.status === 'success' ? cap.observation.kind : null,
      financeStatus: trace.financeExecution?.status ?? null,
      financeMetric:
        trace.financeExecution?.status === 'success'
          ? trace.financeExecution.metric
          : null,
      financeAmount:
        trace.financeExecution?.status === 'success'
          ? trace.financeExecution.amount
          : null,
      financeWeddingId:
        trace.financeExecution?.status === 'success'
          ? trace.financeExecution.weddingId
          : null,
      financeComparison: trace.financeComparison,
      domainComparison: trace.domainComparison,
      classification: trace.classification,
      error: trace.error,
    })
  }
}

function previewUtterance(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (t.length <= 80) return t
  return `${t.slice(0, 77)}…`
}

function emptyTraceBase(
  turnId: string,
  userText: string,
): Omit<
  ShadowTrace,
  | 'latencyMs'
  | 'resolverMs'
  | 'validationOk'
  | 'taskSpec'
  | 'resolution'
  | 'error'
  | 'v3Coarse'
  | 'agreement'
  | 'classification'
> {
  return {
    turnId,
    utterancePreview: previewUtterance(userText),
    capabilityExecution: null,
    capabilityExecuteMs: 0,
    financeExecution: null,
    financeExecuteMs: 0,
    financeComparison: null,
    domainComparison: null,
  }
}

export function runAssistantV4Shadow(input: {
  turnId: string
  userText: string
  semanticContext?: TaskSpecSemanticContext | null
  workingContext?: AssistantWorkingContext | null
  /** Current route resource — page context, not conversation memory. */
  pageContext?: PageContextHint | null
  v3Domain?: AssistantDomainRequest | null
  signal?: AbortSignal
  force?: boolean
}): void {
  if (
    !input.force &&
    !isAssistantV4ShadowEnabled() &&
    !isAnyV4CapabilityExecutionEnabled()
  ) {
    return
  }
  if (!input.userText.trim()) return
  if (inFlightTurns.has(input.turnId)) return
  inFlightTurns.add(input.turnId)

  void (async () => {
    try {
      if (input.signal?.aborted) {
        emit({
          ...emptyTraceBase(input.turnId, input.userText),
          latencyMs: 0,
          resolverMs: 0,
          validationOk: false,
          taskSpec: null,
          resolution: null,
          error: 'aborted',
          v3Coarse: v3DomainToCoarse(input.v3Domain),
          agreement: null,
          classification: 'dropped',
        })
        return
      }

      const previousTask = previousTaskSummaryForInterpreter()
      const semanticContext: TaskSpecSemanticContext = {
        ...(input.semanticContext ?? {}),
        previousTask:
          input.semanticContext?.previousTask ?? previousTask ?? null,
        previousOp:
          input.semanticContext?.previousOp ?? previousTask?.op ?? null,
        previousSubject:
          input.semanticContext?.previousSubject ??
          previousTask?.subject ??
          null,
      }

      const result = await interpretTaskSpec({
        userText: input.userText,
        semanticContext,
        signal: input.signal,
      })

      if (input.signal?.aborted) {
        emit({
          ...emptyTraceBase(input.turnId, input.userText),
          latencyMs: result.latencyMs,
          resolverMs: 0,
          validationOk: false,
          taskSpec: null,
          resolution: null,
          error: 'aborted',
          v3Coarse: v3DomainToCoarse(input.v3Domain),
          agreement: null,
          classification: 'dropped',
        })
        return
      }

      const v3Coarse = v3DomainToCoarse(input.v3Domain ?? null)

      if (!result.ok) {
        emit({
          ...emptyTraceBase(input.turnId, input.userText),
          latencyMs: result.latencyMs,
          resolverMs: 0,
          validationOk: false,
          taskSpec: null,
          resolution: null,
          error: result.error,
          v3Coarse,
          agreement: null,
          classification: 'v4_error',
        })
        return
      }

      const baseCtx = adaptWorkingContextToV4ShadowContext({
        workingContext: input.workingContext ?? emptyWorkingContext(),
      })
      const shadowCtx = applyPageContextToV4ShadowContext(
        mergeShadowOverlay(baseCtx),
        input.pageContext,
      )

      const resolverStarted = Date.now()
      const resolution = resolveTaskSpec(result.taskSpec, shadowCtx)
      const resolverMs = Date.now() - resolverStarted

      let capabilityExecution: CapabilityExecutionResult | null = null
      let capabilityExecuteMs = 0
      if (isAnyV4CapabilityExecutionEnabled()) {
        const started = Date.now()
        try {
          const dispatched = await runV4CapabilityExecution(resolution)
          if (dispatched.handled) {
            capabilityExecution =
              dispatched.result.status === 'disabled'
                ? null
                : dispatched.result
          }
        } catch {
          capabilityExecution = {
            status: 'error',
            safeCode: 'capability_shadow_exception',
            selectionMs: 0,
            executionMs: 0,
          }
        }
        capabilityExecuteMs = Date.now() - started
      }

      const financeExecution = financeViewFromCapability(capabilityExecution)

      // G2: migration-bridge DomainQuery agreement (DEV shadow only, non-blocking).
      // CollectionQuery remains a temporary bridge — not future semantic authority.
      if (
        capabilityExecution?.status === 'success' &&
        capabilityExecution.capabilityId === 'collection.query' &&
        (capabilityExecution.observation.kind === 'collection' ||
          capabilityExecution.observation.kind === 'domain_query')
      ) {
        const cq = peekLastExecutedCollectionQuery()
        const extras = peekCollectionQueryExecutionExtras()
        if (cq) {
          const obs =
            capabilityExecution.observation.kind === 'domain_query'
              ? domainQueryObservationToCollectionObservation(
                  capabilityExecution.observation,
                )
              : capabilityExecution.observation
          scheduleDomainQueryAgreementShadow({
            turnId: input.turnId,
            collectionQuery: cq,
            observation: obs,
            memberIds: extras?.activeCollection.memberIds,
          })
        }
      }

      if (!input.signal?.aborted) {
        applyAssistantV4ShadowTransition({
          taskSpec: result.taskSpec,
          resolution,
          capabilityExecution,
        })
        pendingCapabilityByTurn.set(input.turnId, capabilityExecution)
      }

      const v4Coarse = taskSpecToCoarse(result.taskSpec)
      const agreement = v3Coarse ? compareCoarse(v4Coarse, v3Coarse) : null

      emit({
        turnId: input.turnId,
        utterancePreview: previewUtterance(input.userText),
        latencyMs: result.latencyMs,
        resolverMs,
        validationOk: true,
        taskSpec: result.taskSpec,
        resolution,
        capabilityExecution,
        capabilityExecuteMs,
        financeExecution,
        financeExecuteMs: capabilityExecuteMs,
        financeComparison: null,
        domainComparison: null,
        error: null,
        v3Coarse,
        agreement,
        classification: !v3Coarse
          ? 'v3_missing'
          : agreement?.overallAgree
            ? 'agree'
            : 'disagree',
      })
    } catch {
      emit({
        ...emptyTraceBase(input.turnId, input.userText),
        latencyMs: 0,
        resolverMs: 0,
        validationOk: false,
        taskSpec: null,
        resolution: null,
        error: 'exception',
        v3Coarse: v3DomainToCoarse(input.v3Domain ?? null),
        agreement: null,
        classification: 'v4_error',
      })
    } finally {
      inFlightTurns.delete(input.turnId)
    }
  })()
}

/**
 * After V3 visible answer returns — attach structured domain comparison.
 * Never throws into the V3 path.
 */
export function completeAssistantV4ShadowComparison(input: {
  turnId: string
  v3Response: AssistantResponse | null | undefined
}): V4ShadowDomainComparison | null {
  if (!isAnyV4CapabilityExecutionEnabled()) return null
  try {
    const v4 =
      pendingCapabilityByTurn.get(input.turnId) ??
      getAssistantV4LastCapabilityExecution()
    pendingCapabilityByTurn.delete(input.turnId)
    if (!v4) return null

    if (v4.status === 'success' && v4.observation.kind === 'money') {
      const comparison = compareV4FinanceWithV3Response({
        v4: capabilityResultToFinanceExecution(v4),
        v3: input.v3Response,
      })
      if (import.meta.env?.DEV) {
        console.debug('[assistant-v4-finance-compare]', {
          turnId: input.turnId,
          ...comparison,
        })
      }
      return { domain: 'finance', comparison }
    }

    if (v4.status === 'success' && v4.observation.kind === 'place') {
      const comparison = compareV4PlaceWithV3Response({
        v4,
        v3: input.v3Response,
      })
      if (import.meta.env?.DEV) {
        console.debug('[assistant-v4-place-compare]', {
          turnId: input.turnId,
          ...comparison,
        })
      }
      return { domain: 'place', comparison }
    }

    if (v4.status === 'success' && v4.observation.kind === 'time') {
      const comparison = compareV4TimeWithV3Response({
        v4,
        v3: input.v3Response,
      })
      if (import.meta.env?.DEV) {
        console.debug('[assistant-v4-time-compare]', {
          turnId: input.turnId,
          ...comparison,
        })
      }
      return { domain: 'time', comparison }
    }

    // Non-success finance-shaped control still comparable when V3 is finance
    const finCapId =
      'capabilityId' in v4 ? v4.capabilityId : undefined
    if (
      isAssistantV4FinanceExecutionEnabled() ||
      finCapId === 'wedding.finance.get'
    ) {
      const fin = financeViewFromCapability(v4)
      if (fin) {
        const comparison = compareV4FinanceWithV3Response({
          v4: fin,
          v3: input.v3Response,
        })
        return { domain: 'finance', comparison }
      }
    }

    return null
  } catch {
    return null
  }
}

/** @deprecated Phase 3A name — forwards to completeAssistantV4ShadowComparison */
export function completeAssistantV4FinanceShadowComparison(input: {
  turnId: string
  v3Response: AssistantResponse | null | undefined
}): V4FinanceShadowComparison | null {
  const result = completeAssistantV4ShadowComparison(input)
  if (result?.domain === 'finance') return result.comparison
  return null
}

export function semanticContextFromWorkingHints(input: {
  activeResourceKind?: 'wedding' | 'session' | null
  activeParticipantHint?: string | null
  previousOp?: AssistantTaskSpec['op'] | null
  previousSubject?: AssistantTaskSpec['subject']
  currentTopic?: string | null
  hasSequenceContext?: boolean
  lastTemporalPhrase?: string | null
  /** Page route kind when conversation has no active resource yet. */
  pageResourceKind?: 'wedding' | 'session' | null
}): TaskSpecSemanticContext {
  const previousTask = previousTaskSummaryForInterpreter()
  return {
    activeResourceKind:
      input.activeResourceKind ?? input.pageResourceKind ?? null,
    activeParticipantHint: input.activeParticipantHint ?? null,
    previousOp: input.previousOp ?? previousTask?.op ?? null,
    previousSubject: input.previousSubject ?? previousTask?.subject ?? null,
    currentTopic: input.currentTopic ?? null,
    hasSequenceContext: input.hasSequenceContext ?? false,
    lastTemporalPhrase: input.lastTemporalPhrase ?? null,
    previousTask,
  }
}
