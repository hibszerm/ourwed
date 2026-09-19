/**
 * V7-CANARY — Edge invoke for one LLM step (tools + messages).
 * OPENAI_API_KEY stays on Edge. Client executes tools under RLS.
 */

import type { V7ChatMessage } from './loop'

/** Provider usage fields — only keys that Edge actually returned. */
export type V7ProviderUsage = {
  promptTokens?: number
  cachedTokens?: number
  cacheWriteTokens?: number
  completionTokens?: number
}

export type V7EdgeStepResult =
  | {
      ok: true
      message: {
        role?: string
        content?: string | null
        tool_calls?: Array<{
          id: string
          type: 'function'
          function: { name: string; arguments: string }
        }>
      }
      model: string
      /** Client-observed roundtrip (network + Edge + OpenAI). */
      latencyMs: number
      /** Edge-reported OpenAI wall time when present (diagnostics.durationMs). */
      edgeOpenaiMs: number | null
      /** Present only when Edge diagnostics.usage includes the field(s). */
      usage: V7ProviderUsage | null
    }
  | {
      ok: false
      error: string
      latencyMs: number
      edgeOpenaiMs: number | null
      usage: V7ProviderUsage | null
    }

export async function invokeV7AgentStep(input: {
  messages: V7ChatMessage[]
  tools: unknown
  allowTools: boolean
  signal?: AbortSignal
}): Promise<V7EdgeStepResult> {
  const t0 = Date.now()
  if (input.signal?.aborted) {
    return {
      ok: false,
      error: 'aborted',
      latencyMs: 0,
      edgeOpenaiMs: null,
      usage: null,
    }
  }

  const { supabase } = await import('@/lib/supabase')
  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body: {
      mode: 'v7_agent_step',
      messages: input.messages,
      tools: input.allowTools ? input.tools : undefined,
      allowTools: input.allowTools,
    },
  })

  const latencyMs = Date.now() - t0
  if (input.signal?.aborted) {
    return {
      ok: false,
      error: 'aborted',
      latencyMs,
      edgeOpenaiMs: null,
      usage: null,
    }
  }
  if (error) {
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : 'invoke_failed'
    return {
      ok: false,
      error: message,
      latencyMs,
      edgeOpenaiMs: null,
      usage: null,
    }
  }
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      error: 'empty_response',
      latencyMs,
      edgeOpenaiMs: null,
      usage: null,
    }
  }
  const row = data as Record<string, unknown>
  const edgeOpenaiMs = readEdgeOpenaiMs(row)
  const usage = readEdgeUsage(row)
  if (row.status === 'error') {
    return {
      ok: false,
      error: String(row.message ?? row.code ?? 'provider_error'),
      latencyMs,
      edgeOpenaiMs,
      usage,
    }
  }
  if (row.status !== 'native_message' || !row.message) {
    return {
      ok: false,
      error: 'unexpected_response',
      latencyMs,
      edgeOpenaiMs,
      usage,
    }
  }
  return {
    ok: true,
    message: row.message as V7EdgeStepResult extends { ok: true }
      ? V7EdgeStepResult['message']
      : never,
    model: typeof row.model === 'string' ? row.model : 'gpt-5.6-terra',
    latencyMs,
    edgeOpenaiMs,
    usage,
  }
}

/** Read Edge diagnostics.durationMs when present (already returned by ai-assistant). */
function readEdgeOpenaiMs(row: Record<string, unknown>): number | null {
  const diagnostics = row.diagnostics
  if (!diagnostics || typeof diagnostics !== 'object') return null
  const durationMs = (diagnostics as { durationMs?: unknown }).durationMs
  return typeof durationMs === 'number' && Number.isFinite(durationMs)
    ? durationMs
    : null
}

/**
 * Map Edge diagnostics.usage → client audit fields.
 * Only includes keys that are actual numbers (0 is kept; absent is omitted).
 */
function readEdgeUsage(row: Record<string, unknown>): V7ProviderUsage | null {
  const diagnostics = row.diagnostics
  if (!diagnostics || typeof diagnostics !== 'object') return null
  const usage = (diagnostics as { usage?: unknown }).usage
  if (!usage || typeof usage !== 'object') return null
  const u = usage as Record<string, unknown>
  const out: V7ProviderUsage = {}
  if (typeof u.prompt_tokens === 'number') out.promptTokens = u.prompt_tokens
  if (typeof u.completion_tokens === 'number') {
    out.completionTokens = u.completion_tokens
  }
  if (typeof u.cached_tokens === 'number') out.cachedTokens = u.cached_tokens
  if (typeof u.cache_write_tokens === 'number') {
    out.cacheWriteTokens = u.cache_write_tokens
  }
  return Object.keys(out).length > 0 ? out : null
}
