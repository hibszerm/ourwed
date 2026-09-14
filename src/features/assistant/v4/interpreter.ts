/**
 * Client V4 interpreter — calls Edge mode=v4_interpret only.
 * Never executes TaskSpec. Never mutates WorkingContext.
 */

import {
  parseFlatTaskSpecPayload,
  validateAssistantTaskSpec,
} from './taskSpecSchema'
import type {
  AssistantTaskSpec,
  TaskSpecSemanticContext,
} from './taskSpec'

export type V4InterpretResult =
  | {
      ok: true
      taskSpec: AssistantTaskSpec
      latencyMs: number
    }
  | {
      ok: false
      error: string
      code?: string
      latencyMs: number
    }

type InvokeFn = (
  functionName: string,
  options: { body: Record<string, unknown> },
) => Promise<{ data: unknown; error: unknown }>

const defaultInvoke: InvokeFn = async (functionName, options) => {
  const { supabase } = await import('@/lib/supabase')
  return supabase.functions.invoke(functionName, options)
}

function asErrorCode(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const code = (data as Record<string, unknown>).code
  return typeof code === 'string' ? code : undefined
}

/**
 * Interpret utterance → TaskSpec via Edge.
 * Does not run V3, does not execute, does not patch state.
 */
export async function interpretTaskSpec(input: {
  userText: string
  semanticContext?: TaskSpecSemanticContext | null
  locale?: string
  signal?: AbortSignal
  invoke?: InvokeFn
}): Promise<V4InterpretResult> {
  const utterance = input.userText.trim().slice(0, 500)
  if (!utterance) {
    return { ok: false, error: 'empty_utterance', latencyMs: 0 }
  }

  const started = Date.now()
  const invoke = input.invoke ?? defaultInvoke

  try {
    if (input.signal?.aborted) {
      return { ok: false, error: 'aborted', code: 'aborted', latencyMs: 0 }
    }

    const { data, error } = await invoke('ai-assistant', {
      body: {
        mode: 'v4_interpret',
        utterance,
        locale: input.locale ?? 'pl-PL',
        semanticContextSummary: input.semanticContext ?? null,
      },
    })

    const latencyMs = Date.now() - started

    if (input.signal?.aborted) {
      return { ok: false, error: 'aborted', code: 'aborted', latencyMs }
    }

    if (error) {
      return {
        ok: false,
        error: 'invoke_error',
        code: asErrorCode(data) ?? 'invoke_error',
        latencyMs,
      }
    }

    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'empty_response', latencyMs }
    }

    const row = data as Record<string, unknown>
    if (row.status === 'error') {
      return {
        ok: false,
        error: typeof row.message === 'string' ? row.message : 'edge_error',
        code: typeof row.code === 'string' ? row.code : 'edge_error',
        latencyMs,
      }
    }

    if (row.status !== 'task_spec') {
      return { ok: false, error: 'unexpected_status', latencyMs }
    }

    const flat = row.taskSpec
    const nested = parseFlatTaskSpecPayload(flat) ?? validateAssistantTaskSpec(flat)
    if (!nested) {
      return {
        ok: false,
        error: 'schema_validation_failed',
        code: 'malformed_model',
        latencyMs,
      }
    }

    return { ok: true, taskSpec: nested, latencyMs }
  } catch (err) {
    const latencyMs = Date.now() - started
    if (input.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      return { ok: false, error: 'aborted', code: 'aborted', latencyMs }
    }
    return { ok: false, error: 'exception', latencyMs }
  }
}
