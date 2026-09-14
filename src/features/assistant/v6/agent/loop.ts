/**
 * V6-F1.3 — Client-orchestrated agent loop with deterministic turn controller.
 * Max 4 model decisions. Duplicate tool calls blocked (one repair).
 */

import { buildModelCollectionContext } from '../collections/summary'
import {
  destroyV6CollectionSession,
  v6CollectionStore,
} from '../collections/store'
import {
  assessToolCapability,
  decideV6Authority,
} from '../authority/decide'
import { emitV6Diagnostic } from '../diagnostics/emit'
import { executeV6Tool } from '../tools'
import {
  V6_REPAIR_DIAGNOSTIC,
  V6_STRUCTURED_OUTCOME_DIAGNOSTIC,
  V6_MAX_MODEL_DECISIONS,
  buildExecutionState,
  createV6TurnController,
  decideToolExecution,
  fingerprintToolCall,
  markRepairUsed,
  markTermination,
  markToolExecuted,
  noteModelDecision,
} from './turnController'
import type { V6AgentStepRequest, V6AgentStepResponse } from './protocol'
import { invokeV6AgentStep } from './invokeStep'

export type V6ShadowTurnResult = {
  turnId: string
  rounds: number
  response: V6AgentStepResponse | null
  toolTrace: Array<{
    round: number
    name: string
    inputHandle?: string
    outputHandle?: string
    ok: boolean
    code?: string
    latencyMs: number
  }>
  authority: ReturnType<typeof decideV6Authority>
  errorCode?: string
  observability?: ReturnType<typeof createV6TurnController>['observability']
}

export async function runV6ShadowTurn(input: {
  turnId: string
  utterance: string
  locale?: string
  recentUtterances?: string[]
  signal?: AbortSignal
}): Promise<V6ShadowTurnResult> {
  const toolTrace: V6ShadowTurnResult['toolTrace'] = []
  let previousToolResults: V6AgentStepRequest['previousToolResults'] = []
  let lastResponse: V6AgentStepResponse | null = null
  const controller = createV6TurnController()
  let lastAggregateOk = false
  let lastRestoreOk = false
  const observations: string[] = []
  let pendingRepair: string | null = null
  let forceOutcome = false

  while (controller.modelDecisionCount < V6_MAX_MODEL_DECISIONS) {
    if (input.signal?.aborted) {
      markTermination(controller, 'aborted')
      return {
        turnId: input.turnId,
        rounds: controller.modelDecisionCount,
        response: lastResponse,
        toolTrace,
        authority: decideV6Authority({
          toolOk: false,
          toolFailureCode: 'EXECUTION_ERROR',
        }),
        errorCode: 'aborted',
        observability: controller.observability,
      }
    }

    const active = v6CollectionStore.getActive()
    const summaries = buildModelCollectionContext({
      active,
      recent: v6CollectionStore.listRecent(5),
    })
    const executionState = buildExecutionState({
      controller,
      activeHandle: active?.handle ?? null,
      observations,
      lastAggregateOk,
      lastRestoreOk,
    })

    noteModelDecision(controller)
    const stepStarted = Date.now()
    const step = await invokeV6AgentStep({
      utterance: input.utterance,
      locale: input.locale ?? 'pl-PL',
      round: controller.modelDecisionCount,
      compactConversationContext: {
        recentUtterances: input.recentUtterances ?? [],
        executionState,
        controllerDiagnostic: pendingRepair ?? undefined,
      },
      collectionSummaries: summaries,
      previousToolResults,
      transportMode: forceOutcome ? 'outcome' : 'tools',
      signal: input.signal,
    })
    pendingRepair = null
    forceOutcome = false
    const modelLatency = Date.now() - stepStarted
    lastResponse = step

    emitV6Diagnostic({
      turnId: input.turnId,
      round: controller.modelDecisionCount,
      modelLatencyMs: modelLatency,
      agentStatus: step.status,
    })

    if (
      step.status === 'error' &&
      step.message?.includes('structured_outcome_required') &&
      !controller.repairUsed &&
      previousToolResults.length === 0 &&
      observations.length === 0
    ) {
      markRepairUsed(controller)
      pendingRepair = V6_STRUCTURED_OUTCOME_DIAGNOSTIC
      forceOutcome = true
      continue
    }

    if (step.status !== 'tool_calls') {
      if (step.status === 'unsupported') {
        markTermination(controller, 'unsupported', step.reason)
      } else if (step.status === 'clarify') {
        markTermination(controller, 'clarify')
      } else if (step.status === 'final') {
        markTermination(controller, 'final')
      } else {
        markTermination(controller, 'safe_error')
      }
      return {
        turnId: input.turnId,
        rounds: controller.modelDecisionCount,
        response: step,
        toolTrace,
        authority: decideV6Authority({
          observationValid: step.status === 'final',
        }),
        observability: controller.observability,
      }
    }

    previousToolResults = []
    let hitDuplicate = false
    for (const call of step.toolCalls) {
      const cap = assessToolCapability(call.name)
      if (!cap.supported) {
        toolTrace.push({
          round: controller.modelDecisionCount,
          name: call.name,
          ok: false,
          code: cap.code,
          latencyMs: 0,
        })
        previousToolResults.push({
          toolCallId: call.id,
          name: call.name,
          result: { ok: false, code: cap.code, detail: cap.detail },
        })
        continue
      }

      const args = call.arguments ?? {}
      const inputHandle =
        typeof args.parentHandle === 'string'
          ? args.parentHandle
          : typeof args.collection === 'string'
            ? args.collection
            : undefined
      const fp = fingerprintToolCall(call.name, args, inputHandle)
      const execDecision = decideToolExecution(controller, fp)
      if (execDecision.action === 'BLOCK_DUPLICATE') {
        hitDuplicate = true
        if (execDecision.allowRepair) {
          markRepairUsed(controller)
          pendingRepair = V6_REPAIR_DIAGNOSTIC
          break
        }
        markTermination(controller, 'repeated_tool_call')
        return {
          turnId: input.turnId,
          rounds: controller.modelDecisionCount,
          response: {
            status: 'error',
            code: 'PLAN_ERROR',
            message: 'REPEATED_TOOL_CALL',
          },
          toolTrace,
          authority: decideV6Authority({ toolOk: false }),
          errorCode: 'PLAN_ERROR',
          observability: controller.observability,
        }
      }

      const t0 = Date.now()
      const result = await executeV6Tool(
        {
          name: call.name as Parameters<typeof executeV6Tool>[0]['name'],
          arguments: args,
        },
        { turnId: input.turnId },
      )
      const latencyMs = Date.now() - t0
      markToolExecuted(controller, fp, call.name)
      if (call.name === 'aggregate_collection' && result.ok) lastAggregateOk = true
      if (call.name === 'restore_collection' && result.ok) lastRestoreOk = true
      if (result.ok) {
        if (call.name === 'query_collection') observations.push('root_collection')
        if (call.name === 'transform_collection')
          observations.push('refined_collection')
        if (call.name === 'aggregate_collection')
          observations.push('aggregate_scalar')
        if (call.name === 'restore_collection')
          observations.push('restored_collection')
      }

      const outputHandle =
        result.ok &&
        result.data &&
        typeof result.data === 'object' &&
        'handle' in result.data
          ? String((result.data as { handle: string }).handle)
          : undefined

      toolTrace.push({
        round: controller.modelDecisionCount,
        name: call.name,
        inputHandle,
        outputHandle,
        ok: result.ok,
        code: result.ok ? undefined : result.code,
        latencyMs,
      })

      emitV6Diagnostic({
        turnId: input.turnId,
        round: controller.modelDecisionCount,
        toolName: call.name,
        inputHandle,
        outputHandle,
        toolLatencyMs: latencyMs,
        failureCode: result.ok ? undefined : result.code,
      })

      previousToolResults.push({
        toolCallId: call.id,
        name: call.name,
        result,
      })
    }
    if (hitDuplicate && pendingRepair) continue
    if (
      controller.modelDecisionCount >= V6_MAX_MODEL_DECISIONS - 1 &&
      previousToolResults.length > 0
    ) {
      forceOutcome = true
    }
  }

  markTermination(controller, 'max_rounds')
  return {
    turnId: input.turnId,
    rounds: controller.modelDecisionCount,
    response: {
      status: 'error',
      code: 'PLAN_ERROR',
      message: 'max_tool_rounds_exceeded',
    },
    toolTrace,
    authority: decideV6Authority({}),
    errorCode: 'PLAN_ERROR',
    observability: controller.observability,
  }
}

export { destroyV6CollectionSession }
