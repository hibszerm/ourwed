/**
 * V6-F1.4 — Edge invoke for TurnPlan (and legacy native tools).
 */

import type { V6AgentStepRequest, V6AgentStepResponse } from './protocol'
import { parseV6NativeChatMessage } from './parseNativeStep'
import { parseTurnPlanWire } from '../turnPlan/parse'

export async function invokeV6AgentStep(
  input: Omit<V6AgentStepRequest, 'mode'> & {
    signal?: AbortSignal
    transportMode?: 'turn_plan' | 'tools' | 'outcome'
  },
): Promise<V6AgentStepResponse> {
  if (input.signal?.aborted) {
    return {
      status: 'error',
      code: 'aborted',
      message: 'aborted_before_invoke',
    }
  }

  const transportMode = input.transportMode ?? 'turn_plan'
  const body = {
    mode: 'v6_agent_step' as const,
    utterance: input.utterance,
    locale: input.locale,
    round: input.round,
    compactConversationContext: input.compactConversationContext,
    collectionSummaries: input.collectionSummaries,
    previousToolResults: input.previousToolResults,
    transportMode,
  }

  const { supabase } = await import('@/lib/supabase')
  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body,
  })

  if (input.signal?.aborted) {
    return {
      status: 'error',
      code: 'aborted',
      message: 'aborted_after_invoke',
    }
  }

  if (error) {
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : 'invoke_failed'
    return {
      status: 'error',
      code: 'PROVIDER_ERROR',
      message,
    }
  }

  if (!data || typeof data !== 'object') {
    return {
      status: 'error',
      code: 'INTERPRETATION_ERROR',
      message: 'empty_response',
    }
  }

  const row = data as Record<string, unknown>
  const diagnostics =
    row.diagnostics && typeof row.diagnostics === 'object'
      ? (row.diagnostics as Record<string, unknown>)
      : undefined

  if (row.status === 'native_message') {
    const message = row.message
    if (!message || typeof message !== 'object') {
      return {
        status: 'error',
        code: 'INTERPRETATION_ERROR',
        message: 'empty_native_message',
      }
    }
    const msg = message as {
      content?: string | null
      tool_calls?: Array<{
        id: string
        function: { name: string; arguments: string }
      }> | null
    }

    if (transportMode === 'turn_plan') {
      const content =
        typeof msg.content === 'string' ? msg.content.trim() : ''
      if (!content) {
        return {
          status: 'error',
          code: 'INTERPRETATION_ERROR',
          message: 'TURN_PLAN:empty_content',
        }
      }
      let wire: unknown
      try {
        wire = JSON.parse(content)
      } catch {
        return {
          status: 'error',
          code: 'INTERPRETATION_ERROR',
          message: 'TURN_PLAN:json_parse_failed',
        }
      }
      const parsed = parseTurnPlanWire(wire)
      if (!parsed.ok) {
        return {
          status: 'error',
          code: 'PLAN_VALIDATION_ERROR',
          message: `TURN_PLAN:${parsed.detail}`,
          diagnostics: { ...diagnostics, turnPlan: wire },
        }
      }
      // Pass plan via diagnostics for loop; also encode as final text JSON for fallback
      return {
        status: 'final',
        text: content,
        diagnostics: { ...diagnostics, turnPlan: wire, transport: 'turn_plan' },
      }
    }

    const hasEvidence =
      Array.isArray(input.previousToolResults) &&
      input.previousToolResults.length > 0
    const parsed = parseV6NativeChatMessage(msg, {
      allowPlainTextFinal:
        hasEvidence && transportMode !== 'outcome',
    })
    if (!parsed.ok) {
      return {
        status: 'error',
        code: 'INTERPRETATION_ERROR',
        message: parsed.reason,
      }
    }
    return {
      ...parsed.response,
      diagnostics,
    } as V6AgentStepResponse
  }

  const status = row.status
  if (
    status === 'tool_calls' ||
    status === 'final' ||
    status === 'clarify' ||
    status === 'unsupported' ||
    status === 'error'
  ) {
    return data as V6AgentStepResponse
  }

  return {
    status: 'error',
    code: 'INTERPRETATION_ERROR',
    message: `unexpected_status:${String(status)}`,
  }
}
