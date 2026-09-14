/**
 * V6-F1 — Edge invoke for one agent step.
 */

import type { V6AgentStepRequest, V6AgentStepResponse } from './protocol'

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

  const status = (data as { status?: string }).status
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
