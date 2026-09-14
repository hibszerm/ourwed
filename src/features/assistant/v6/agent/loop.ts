/**
 * V6-F1 — Client-orchestrated agent loop (shadow).
 * Max 4 tool rounds. Tools execute via authenticated app services/RLS.
 */

import {
  buildModelCollectionContext,
} from '../collections/summary'
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
  V6_MAX_TOOL_ROUNDS,
  normalizeToolCalls,
  type V6AgentStepRequest,
  type V6AgentStepResponse,
} from './protocol'
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
  let rounds = 0

  for (let round = 1; round <= V6_MAX_TOOL_ROUNDS + 1; round++) {
    if (input.signal?.aborted) {
      const authority = decideV6Authority({ toolOk: false, toolFailureCode: 'EXECUTION_ERROR' })
      emitV6Diagnostic({
        turnId: input.turnId,
        round,
        failureCode: 'PLAN_ERROR',
        detail: 'aborted',
      })
      return {
        turnId: input.turnId,
        rounds,
        response: lastResponse,
        toolTrace,
        authority,
        errorCode: 'aborted',
      }
    }

    if (round > V6_MAX_TOOL_ROUNDS) {
      const authority = decideV6Authority({ toolOk: false })
      emitV6Diagnostic({
        turnId: input.turnId,
        round,
        failureCode: 'PLAN_ERROR',
        detail: 'max_tool_rounds_exceeded',
      })
      return {
        turnId: input.turnId,
        rounds,
        response: {
          status: 'error',
          code: 'PLAN_ERROR',
          message: 'max_tool_rounds_exceeded',
        },
        toolTrace,
        authority,
        errorCode: 'PLAN_ERROR',
      }
    }

    rounds = round
    const active = v6CollectionStore.getActive()
    const summaries = buildModelCollectionContext({
      active,
      recent: v6CollectionStore.listRecent(5),
    })

    const stepStarted = Date.now()
    const step = await invokeV6AgentStep({
      utterance: input.utterance,
      locale: input.locale ?? 'pl-PL',
      round,
      compactConversationContext: {
        recentUtterances: input.recentUtterances ?? [],
      },
      collectionSummaries: summaries,
      previousToolResults,
      signal: input.signal,
    })
    const modelLatency = Date.now() - stepStarted
    lastResponse = step

    emitV6Diagnostic({
      turnId: input.turnId,
      round,
      modelLatencyMs: modelLatency,
      agentStatus: step.status,
    })

    if (step.status !== 'tool_calls') {
      const authority = decideV6Authority({
        observationValid: step.status === 'final',
      })
      return {
        turnId: input.turnId,
        rounds,
        response: step,
        toolTrace,
        authority,
      }
    }

    const calls = normalizeToolCalls(step.toolCalls)
    previousToolResults = []

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i]!
      const cap = assessToolCapability(call.name)
      if (!cap.supported) {
        toolTrace.push({
          round,
          name: call.name,
          ok: false,
          code: cap.code,
          latencyMs: 0,
        })
        previousToolResults.push({
          toolCallId: step.toolCalls[i]?.id ?? `call_${i}`,
          name: call.name,
          result: { ok: false, code: cap.code, detail: cap.detail },
        })
        continue
      }

      const t0 = Date.now()
      const result = await executeV6Tool(call, { turnId: input.turnId })
      const latencyMs = Date.now() - t0
      const inputHandle =
        typeof call.arguments.parentHandle === 'string'
          ? call.arguments.parentHandle
          : typeof call.arguments.collection === 'string'
            ? call.arguments.collection
            : undefined
      const outputHandle =
        result.ok &&
        result.data &&
        typeof result.data === 'object' &&
        'handle' in result.data
          ? String((result.data as { handle: string }).handle)
          : undefined

      toolTrace.push({
        round,
        name: call.name,
        inputHandle,
        outputHandle,
        ok: result.ok,
        code: result.ok ? undefined : result.code,
        latencyMs,
      })

      emitV6Diagnostic({
        turnId: input.turnId,
        round,
        toolName: call.name,
        inputHandle,
        outputHandle,
        toolLatencyMs: latencyMs,
        failureCode: result.ok ? undefined : result.code,
      })

      previousToolResults.push({
        toolCallId: step.toolCalls[i]?.id ?? `call_${i}`,
        name: call.name,
        result,
      })
    }
  }

  return {
    turnId: input.turnId,
    rounds,
    response: lastResponse,
    toolTrace,
    authority: decideV6Authority({}),
  }
}

export { destroyV6CollectionSession }
