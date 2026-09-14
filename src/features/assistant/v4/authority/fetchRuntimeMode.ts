/**
 * PC1 — fetch runtime assistant mode from authenticated Edge.
 * Fail-closed: any error → null (treated as off by resolveEffectiveMode).
 */

import type { AssistantV5Mode } from './types'
import { parseAssistantV5Mode } from './resolveEffectiveMode'

type InvokeFn = (
  functionName: string,
  options: { body: Record<string, unknown> },
) => Promise<{ data: unknown; error: unknown }>

const defaultInvoke: InvokeFn = async (functionName, options) => {
  const { supabase } = await import('@/lib/supabase')
  return supabase.functions.invoke(functionName, options)
}

let cached: { mode: AssistantV5Mode | null; at: number } | null = null
const CACHE_MS = 60_000

export function __resetAssistantRuntimeModeCacheForTests(): void {
  cached = null
}

export function __setAssistantRuntimeModeCacheForTests(
  mode: AssistantV5Mode | null,
): void {
  cached = { mode, at: Date.now() }
}

/**
 * Returns normalized runtime mode, or null if unavailable/invalid.
 * Does not escalate; never trusts client-supplied mode overrides.
 */
export async function fetchAssistantRuntimeMode(input?: {
  invoke?: InvokeFn
  forceRefresh?: boolean
}): Promise<AssistantV5Mode | null> {
  if (
    !input?.forceRefresh &&
    cached &&
    Date.now() - cached.at < CACHE_MS
  ) {
    return cached.mode
  }

  const invoke = input?.invoke ?? defaultInvoke
  try {
    const { data, error } = await invoke('ai-assistant', {
      body: { mode: 'assistant_runtime_config' },
    })
    if (error || !data || typeof data !== 'object') {
      cached = { mode: null, at: Date.now() }
      return null
    }
    const row = data as Record<string, unknown>
    if (row.status === 'error') {
      cached = { mode: null, at: Date.now() }
      return null
    }
    const parsed = parseAssistantV5Mode(row.assistantMode)
    cached = { mode: parsed, at: Date.now() }
    return parsed
  } catch {
    cached = { mode: null, at: Date.now() }
    return null
  }
}
