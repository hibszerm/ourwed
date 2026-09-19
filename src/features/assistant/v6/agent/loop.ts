/**
 * V6-F1.4 / RI2 — Client-orchestrated TurnPlan loop with semantic + capability gates.
 * Luna emits complete TurnPlan → validate → verify → capability → execute → finalize.
 *
 * KNOWN_VERIFIER_FALSE_POSITIVE_H19: exclusion-reversal may over-block (safe).
 * KNOWN_CORRECTION_COLLECTION_BASE_GAP_H20: not fixed here.
 */

import { buildModelCollectionContext } from '../collections/summary'
import type { V6CollectionSummary } from '../collections/summary'
import {
  destroyV6CollectionSession,
  v6CollectionStore,
} from '../collections/store'
import { decideV6Authority } from '../authority/decide'
import {
  checkTurnPlanCapability,
  type V6TurnPlanCapabilityResult,
} from '../capability/checkTurnPlanCapability'
import { emitV6Diagnostic } from '../diagnostics/emit'
import {
  executeTurnPlan,
  parseTurnPlanWire,
  plannedOpClassesFromPlan,
  validateTurnPlan,
  type V6PlanExecutionResult,
  type V6TurnPlan,
} from '../turnPlan'
import type { V6AgentStepResponse } from './protocol'
import { invokeV6AgentStep } from './invokeStep'
import {
  invokeV6SemanticVerify,
  type V6SemanticVerifyInvokeResult,
} from './invokeSemanticVerify'

export type V6ShadowTurnResult = {
  turnId: string
  rounds: number
  response: V6AgentStepResponse | null
  plan?: V6TurnPlan
  execution?: V6PlanExecutionResult
  toolTrace: Array<{
    round: number
    name: string
    inputHandle?: string
    outputHandle?: string
    ok: boolean
    code?: string
    latencyMs: number
    args?: Record<string, unknown>
  }>
  authority: ReturnType<typeof decideV6Authority>
  errorCode?: string
  plannedOps?: string[]
  executedOps?: string[]
  semanticVerifierVerdict?: string
  capabilityVerdict?: string
  verificationBlockReason?: string
  verifierLatencyMs?: number
  verifierModel?: string
}

const MAX_PLAN_REPAIRS = 1

export type V6ShadowTurnDeps = {
  invokePlanner?: typeof invokeV6AgentStep
  invokeVerifier?: (input: {
    utterance: string
    priorUtterances: string[]
    draftTurnPlan: V6TurnPlan
    collectionSummaries: V6CollectionSummary[]
    signal?: AbortSignal
  }) => Promise<V6SemanticVerifyInvokeResult>
  executePlan?: typeof executeTurnPlan
  checkCapability?: (plan: unknown) => V6TurnPlanCapabilityResult
}

/** Structural gate: CRM execution only when both gates approve. */
export function mayExecuteVerifiedTurnPlan(input: {
  semanticVerdict: 'FAITHFUL' | 'NOT_FAITHFUL' | 'UNCERTAIN' | null
  capabilityVerdict: 'SUPPORTED' | 'UNSUPPORTED' | null
}): boolean {
  return (
    input.semanticVerdict === 'FAITHFUL' &&
    input.capabilityVerdict === 'SUPPORTED'
  )
}

export async function runV6ShadowTurn(input: {
  turnId: string
  utterance: string
  locale?: string
  recentUtterances?: string[]
  signal?: AbortSignal
  todayKey?: string
  deps?: V6ShadowTurnDeps
}): Promise<V6ShadowTurnResult> {
  const invokePlanner = input.deps?.invokePlanner ?? invokeV6AgentStep
  const invokeVerifier = input.deps?.invokeVerifier ?? invokeV6SemanticVerify
  const executePlan = input.deps?.executePlan ?? executeTurnPlan
  const checkCapability = input.deps?.checkCapability ?? checkTurnPlanCapability

  const toolTrace: V6ShadowTurnResult['toolTrace'] = []
  let repair = 0
  let lastDiagnostic: string | undefined

  while (repair <= MAX_PLAN_REPAIRS) {
    if (input.signal?.aborted) {
      return {
        turnId: input.turnId,
        rounds: repair + 1,
        response: null,
        toolTrace,
        authority: decideV6Authority({ toolOk: false }),
        errorCode: 'aborted',
      }
    }

    const active = v6CollectionStore.getActive()
    const summaries = buildModelCollectionContext({
      active,
      recent: v6CollectionStore.listRecent(5),
    })

    const stepStarted = Date.now()
    const step = await invokePlanner({
      utterance: input.utterance,
      locale: input.locale ?? 'pl-PL',
      round: repair + 1,
      compactConversationContext: {
        recentUtterances: input.recentUtterances ?? [],
        controllerDiagnostic: lastDiagnostic,
      },
      collectionSummaries: summaries,
      previousToolResults: [],
      transportMode: 'turn_plan',
      signal: input.signal,
    })
    const modelLatency = Date.now() - stepStarted
    emitV6Diagnostic({
      turnId: input.turnId,
      round: repair + 1,
      modelLatencyMs: modelLatency,
      agentStatus: step.status,
    })

    const planRaw =
      step.diagnostics && typeof step.diagnostics === 'object'
        ? (step.diagnostics as { turnPlan?: unknown }).turnPlan
        : undefined

    let planWire: unknown = planRaw
    if (!planWire && step.status === 'final' && typeof step.text === 'string') {
      try {
        planWire = JSON.parse(step.text)
      } catch {
        planWire = null
      }
    }

    if (
      !planWire &&
      (step.status === 'unsupported' || step.status === 'clarify')
    ) {
      return {
        turnId: input.turnId,
        rounds: repair + 1,
        response: step,
        toolTrace,
        authority: decideV6Authority({}),
      }
    }

    if (step.status === 'error' && !planWire) {
      if (repair < MAX_PLAN_REPAIRS && step.message?.includes('TURN_PLAN')) {
        lastDiagnostic = step.message
        repair += 1
        continue
      }
      return {
        turnId: input.turnId,
        rounds: repair + 1,
        response: step,
        toolTrace,
        authority: decideV6Authority({ toolOk: false }),
        errorCode: step.code,
      }
    }

    const parsed = parseTurnPlanWire(planWire)
    if (!parsed.ok) {
      if (repair < MAX_PLAN_REPAIRS) {
        lastDiagnostic = `TurnPlan validation failed: ${parsed.detail}. Emit a valid complete TurnPlan.`
        repair += 1
        continue
      }
      return {
        turnId: input.turnId,
        rounds: repair + 1,
        response: {
          status: 'error',
          code: 'PLAN_VALIDATION_ERROR',
          // Internal parse tokens must never become user-visible copy.
          message: null,
        },
        toolTrace,
        authority: decideV6Authority({}),
        errorCode: 'PLAN_VALIDATION_ERROR',
        verificationBlockReason: parsed.detail,
      }
    }

    const validated = validateTurnPlan(parsed.plan)
    if (!validated.ok) {
      if (validated.code === 'UNSUPPORTED_CAPABILITY') {
        return {
          turnId: input.turnId,
          rounds: repair + 1,
          response: {
            status: 'unsupported',
            reason: null,
          },
          plan: parsed.plan,
          toolTrace,
          authority: decideV6Authority({}),
          plannedOps: plannedOpClassesFromPlan(parsed.plan),
          errorCode: 'CAPABILITY_UNSUPPORTED',
          verificationBlockReason: validated.detail,
        }
      }
      if (repair < MAX_PLAN_REPAIRS) {
        lastDiagnostic = `TurnPlan invalid: ${validated.detail}. Emit a corrected complete TurnPlan.`
        repair += 1
        continue
      }
      return {
        turnId: input.turnId,
        rounds: repair + 1,
        response: {
          status: 'error',
          code: validated.code,
          message: null,
        },
        plan: parsed.plan,
        toolTrace,
        authority: decideV6Authority({}),
        errorCode: validated.code,
        verificationBlockReason: validated.detail,
      }
    }

    if (parsed.plan.output.kind === 'UNSUPPORTED') {
      return {
        turnId: input.turnId,
        rounds: repair + 1,
        response: {
          status: 'unsupported',
          reason: parsed.plan.output.reason,
        },
        plan: parsed.plan,
        toolTrace,
        authority: decideV6Authority({}),
        plannedOps: plannedOpClassesFromPlan(parsed.plan),
      }
    }
    if (parsed.plan.output.kind === 'CLARIFICATION') {
      return {
        turnId: input.turnId,
        rounds: repair + 1,
        response: {
          status: 'clarify',
          slot: parsed.plan.output.slot,
          reason: parsed.plan.output.reason,
        },
        plan: parsed.plan,
        toolTrace,
        authority: decideV6Authority({}),
        plannedOps: plannedOpClassesFromPlan(parsed.plan),
      }
    }

    // —— RI2: semantic verifier (no CRM yet) ——
    const verify = await invokeVerifier({
      utterance: input.utterance,
      priorUtterances: input.recentUtterances ?? [],
      draftTurnPlan: parsed.plan,
      collectionSummaries: summaries,
      signal: input.signal,
    })

    if (!verify.ok) {
      const code =
        verify.code === 'aborted' ? 'aborted' : verify.code
      emitV6Diagnostic({
        turnId: input.turnId,
        round: repair + 1,
        failureCode: code,
        verifierLatencyMs: verify.latencyMs,
        verifierModel: verify.model,
        verificationBlockReason: verify.message,
        semanticVerifierVerdict: 'ERROR',
      })
      return {
        turnId: input.turnId,
        rounds: repair + 1,
        response: {
          status: 'error',
          code,
          message: verify.message,
        },
        plan: parsed.plan,
        toolTrace,
        authority: decideV6Authority({}),
        errorCode: code,
        plannedOps: plannedOpClassesFromPlan(parsed.plan),
        semanticVerifierVerdict: 'ERROR',
        verificationBlockReason: verify.message,
        verifierLatencyMs: verify.latencyMs,
        verifierModel: verify.model,
      }
    }

    const semanticVerdict = verify.result.verdict
    emitV6Diagnostic({
      turnId: input.turnId,
      round: repair + 1,
      semanticVerifierVerdict: semanticVerdict,
      verifierLatencyMs: verify.latencyMs,
      verifierModel: verify.model,
    })

    if (semanticVerdict !== 'FAITHFUL') {
      const code =
        semanticVerdict === 'NOT_FAITHFUL'
          ? 'VERIFICATION_NOT_FAITHFUL'
          : 'VERIFICATION_UNCERTAIN'
      // Verifier explanation stays internal — never copy into user-visible message.
      return {
        turnId: input.turnId,
        rounds: repair + 1,
        response: {
          status: 'error',
          code,
          message: 'plan_blocked',
        },
        plan: parsed.plan,
        toolTrace,
        authority: decideV6Authority({}),
        errorCode: code,
        plannedOps: plannedOpClassesFromPlan(parsed.plan),
        semanticVerifierVerdict: semanticVerdict,
        verificationBlockReason: code,
        verifierLatencyMs: verify.latencyMs,
        verifierModel: verify.model,
      }
    }

    // —— RI2: deterministic capability gate ——
    const capability = checkCapability(parsed.plan)
    emitV6Diagnostic({
      turnId: input.turnId,
      round: repair + 1,
      semanticVerifierVerdict: semanticVerdict,
      capabilityVerdict: capability.verdict,
      verificationBlockReason:
        capability.verdict === 'UNSUPPORTED' ? capability.code : undefined,
    })

    if (
      !mayExecuteVerifiedTurnPlan({
        semanticVerdict,
        capabilityVerdict: capability.verdict,
      })
    ) {
      return {
        turnId: input.turnId,
        rounds: repair + 1,
        response: {
          // Never put capability.detail in user-facing reason (sanitizer is the boundary).
          status: 'unsupported',
          reason: null,
        },
        plan: parsed.plan,
        toolTrace,
        authority: decideV6Authority({}),
        errorCode: 'CAPABILITY_UNSUPPORTED',
        plannedOps: plannedOpClassesFromPlan(parsed.plan),
        semanticVerifierVerdict: semanticVerdict,
        capabilityVerdict: capability.verdict,
        verificationBlockReason: capability.detail || capability.code,
        verifierLatencyMs: verify.latencyMs,
        verifierModel: verify.model,
      }
    }

    const t0 = Date.now()
    const execution = await executePlan({
      plan: parsed.plan,
      turnId: input.turnId,
      todayKey: input.todayKey,
    })
    const execMs = Date.now() - t0

    for (const rec of execution.executed) {
      toolTrace.push({
        round: repair + 1,
        name: rec.toolName,
        inputHandle:
          typeof rec.toolArgs.parentHandle === 'string'
            ? rec.toolArgs.parentHandle
            : typeof rec.toolArgs.collection === 'string'
              ? rec.toolArgs.collection
              : undefined,
        outputHandle: rec.outputHandle,
        ok: rec.ok,
        code: rec.code,
        latencyMs: execMs,
        args: rec.toolArgs,
      })
      emitV6Diagnostic({
        turnId: input.turnId,
        round: repair + 1,
        toolName: rec.toolName,
        inputHandle: toolTrace[toolTrace.length - 1]?.inputHandle,
        outputHandle: rec.outputHandle,
        toolLatencyMs: execMs,
        failureCode: rec.ok ? undefined : rec.code,
        semanticVerifierVerdict: semanticVerdict,
        capabilityVerdict: capability.verdict,
      })
    }

    if (!execution.completeness.ok) {
      return {
        turnId: input.turnId,
        rounds: repair + 1,
        response: {
          status: 'error',
          code: execution.completeness.code,
          message: null,
        },
        plan: parsed.plan,
        execution,
        toolTrace,
        authority: decideV6Authority({ toolOk: false }),
        errorCode: execution.completeness.code,
        plannedOps: plannedOpClassesFromPlan(parsed.plan),
        semanticVerifierVerdict: semanticVerdict,
        capabilityVerdict: capability.verdict,
        verificationBlockReason: execution.completeness.detail,
        verifierLatencyMs: verify.latencyMs,
        verifierModel: verify.model,
      }
    }

    const obs = execution.completeness.authorizingObservation
    const text =
      obs && obs.kind === 'count_result'
        ? String(obs.value)
        : obs && obs.kind === 'money_aggregate'
          ? `${obs.value} ${obs.currency}`
          : obs && obs.kind === 'collection_result'
            ? `collection:${obs.handle} count=${obs.totalCount}`
            : 'ok'

    return {
      turnId: input.turnId,
      rounds: repair + 1,
      response: {
        status: 'final',
        text,
        observationRef:
          obs && 'handle' in obs ? String(obs.handle) : undefined,
      },
      plan: parsed.plan,
      execution,
      toolTrace,
      authority: decideV6Authority({ observationValid: true }),
      plannedOps: plannedOpClassesFromPlan(parsed.plan),
      semanticVerifierVerdict: semanticVerdict,
      capabilityVerdict: capability.verdict,
      verifierLatencyMs: verify.latencyMs,
      verifierModel: verify.model,
    }
  }

  return {
    turnId: input.turnId,
    rounds: MAX_PLAN_REPAIRS + 1,
    response: {
      status: 'error',
      code: 'PLAN_VALIDATION_ERROR',
      message: 'plan_repair_exhausted',
    },
    toolTrace,
    authority: decideV6Authority({}),
    errorCode: 'PLAN_VALIDATION_ERROR',
  }
}

export { destroyV6CollectionSession }
