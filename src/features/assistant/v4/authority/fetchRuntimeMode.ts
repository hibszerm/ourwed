/**
 * IC1 — fetch runtime assistant mode + canary eligibility from authenticated Edge.
 * Fail-closed: any error → mode null (off) + canaryEligible false.
 * Client cannot escalate; Edge derives eligibility from JWT user id + secret allowlist.
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

export type AssistantRuntimeConfig = {
  mode: AssistantV5Mode | null
  /** Server-attested allowlist membership. Never trust client-set values. */
  canaryEligible: boolean
}

let cached: { config: AssistantRuntimeConfig; at: number } | null = null
const CACHE_MS = 60_000

export function __resetAssistantRuntimeModeCacheForTests(): void {
  cached = null
}

export function __setAssistantRuntimeModeCacheForTests(
  mode: AssistantV5Mode | null,
  canaryEligible = false,
): void {
  cached = {
    config: { mode, canaryEligible },
    at: Date.now(),
  }
}

/**
 * Returns normalized runtime config.
 * Ignores any client-supplied canaryEligible / mode overrides in the request body.
 */
export async function fetchAssistantRuntimeConfig(input?: {
  invoke?: InvokeFn
  forceRefresh?: boolean
}): Promise<AssistantRuntimeConfig> {
  if (
    !input?.forceRefresh &&
    cached &&
    Date.now() - cached.at < CACHE_MS
  ) {
    return cached.config
  }

  const invoke = input?.invoke ?? defaultInvoke
  try {
    // Body must not include canaryEligible — Edge ignores client claims.
    const { data, error } = await invoke('ai-assistant', {
      body: { mode: 'assistant_runtime_config' },
    })
    if (error || !data || typeof data !== 'object') {
      const fail: AssistantRuntimeConfig = {
        mode: null,
        canaryEligible: false,
      }
      cached = { config: fail, at: Date.now() }
      return fail
    }
    const row = data as Record<string, unknown>
    if (row.status === 'error') {
      const fail: AssistantRuntimeConfig = {
        mode: null,
        canaryEligible: false,
      }
      cached = { config: fail, at: Date.now() }
      return fail
    }
    const parsed = parseAssistantV5Mode(row.assistantMode)
    const canaryEligible = row.canaryEligible === true
    const config: AssistantRuntimeConfig = {
      mode: parsed,
      canaryEligible,
    }
    cached = { config, at: Date.now() }
    return config
  } catch {
    const fail: AssistantRuntimeConfig = {
      mode: null,
      canaryEligible: false,
    }
    cached = { config: fail, at: Date.now() }
    return fail
  }
}

/**
 * @deprecated Prefer fetchAssistantRuntimeConfig. Returns mode only.
 */
export async function fetchAssistantRuntimeMode(input?: {
  invoke?: InvokeFn
  forceRefresh?: boolean
}): Promise<AssistantV5Mode | null> {
  const cfg = await fetchAssistantRuntimeConfig(input)
  return cfg.mode
}
