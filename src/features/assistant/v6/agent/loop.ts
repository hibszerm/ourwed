/**
 * V6-F1.4 — Client-orchestrated TurnPlan loop.
 * Luna emits complete TurnPlan → validate → execute → completeness → finalize.
 */

import { buildModelCollectionContext } from '../collections/summary'
import {
  destroyV6CollectionSession,
  v6CollectionStore,
} from '../collections/store'
import { decideV6Authority } from '../authority/decide'
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
}

const MAX_PLAN_REPAIRS = 1

export async function runV6ShadowTurn(input: {
  turnId: string
  utterance: string
  locale?: string
  recentUtterances?: string[]
  signal?: AbortSignal
  todayKey?: string
}): Promise<V6ShadowTurnResult> {
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
    const step = await invokeV6AgentStep({
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

    // Edge returns native_message with TurnPlan JSON in content, parsed client-side
    // invokeStep may return final/clarify/unsupported/error OR a special turn_plan via diagnostics
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

    // Also accept when invoke mapped plan into unsupported/clarify directly
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
      if (
        repair < MAX_PLAN_REPAIRS &&
        step.message?.includes('TURN_PLAN')
      ) {
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
          message: parsed.detail,
        },
        toolTrace,
        authority: decideV6Authority({}),
        errorCode: 'PLAN_VALIDATION_ERROR',
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
            reason: validated.detail,
          },
          plan: parsed.plan,
          toolTrace,
          authority: decideV6Authority({}),
          plannedOps: plannedOpClassesFromPlan(parsed.plan),
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
          message: validated.detail,
        },
        plan: parsed.plan,
        toolTrace,
        authority: decideV6Authority({}),
        errorCode: validated.code,
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

    const t0 = Date.now()
    const execution = await executeTurnPlan({
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
      })
    }

    if (!execution.completeness.ok) {
      return {
        turnId: input.turnId,
        rounds: repair + 1,
        response: {
          status: 'error',
          code: execution.completeness.code,
          message: execution.completeness.detail,
        },
        plan: parsed.plan,
        execution,
        toolTrace,
        authority: decideV6Authority({ toolOk: false }),
        errorCode: execution.completeness.code,
        plannedOps: plannedOpClassesFromPlan(parsed.plan),
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
