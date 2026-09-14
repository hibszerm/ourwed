/**
 * V6-F1 — Edge invoke for one agent step (F1.2 native tools transport).
 */

import type { V6AgentStepRequest, V6AgentStepResponse } from './protocol'
import { parseV6NativeChatMessage } from './parseNativeStep'

export async function invokeV6AgentStep(
  input: Omit<V6AgentStepRequest, 'mode'> & { signal?: AbortSignal },
): Promise<V6AgentStepResponse> {
  if (input.signal?.aborted) {
    return {
      status: 'error',
      code: 'aborted',
      message: 'aborted_before_invoke',
    }
  }

  const body: V6AgentStepRequest = {
    mode: 'v6_agent_step',
    utterance: input.utterance,
    locale: input.locale,
    round: input.round,
    compactConversationContext: input.compactConversationContext,
    collectionSummaries: input.collectionSummaries,
    previousToolResults: input.previousToolResults,
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

  // F1.2 native tools: Edge returns raw OpenAI message for client-side mapping.
  if (row.status === 'native_message') {
    const message = row.message
    if (!message || typeof message !== 'object') {
      return {
        status: 'error',
        code: 'INTERPRETATION_ERROR',
        message: 'empty_native_message',
      }
    }
    const parsed = parseV6NativeChatMessage(
      message as {
        content?: string | null
        tool_calls?: Array<{
          id: string
          function: { name: string; arguments: string }
        }> | null
      },
    )
    if (!parsed.ok) {
      return {
        status: 'error',
        code: 'INTERPRETATION_ERROR',
        message: parsed.reason,
      }
    }
    return {
      ...parsed.response,
      diagnostics:
        row.diagnostics && typeof row.diagnostics === 'object'
          ? (row.diagnostics as Record<string, unknown>)
          : undefined,
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
