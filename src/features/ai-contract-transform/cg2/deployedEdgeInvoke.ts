/**
 * CG2.1 — invoke deployed production Edge `ai-contract-full-rewrite`.
 *
 * OpenAI key stays inside Edge. Requires a real user JWT via:
 *   CG21_SUPABASE_ACCESS_TOKEN
 * (owner/session-injected; never print/commit).
 *
 * Transport-only: same request/response shape as transformApi expects.
 */

import type { TransformFunctionsInvoke } from '../transformApi'

export type Cg21EdgeUsage = {
  calls: number
  retries: number
  latenciesMs: number[]
  models: string[]
  edgeFunction: 'ai-contract-full-rewrite'
  transport: 'deployed_edge'
}

export function createEdgeUsageTracker(): Cg21EdgeUsage {
  return {
    calls: 0,
    retries: 0,
    latenciesMs: [],
    models: [],
    edgeFunction: 'ai-contract-full-rewrite',
    transport: 'deployed_edge',
  }
}

function resolveProjectUrl(): string {
  const url =
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    ''
  if (!url) {
    throw new Error('VITE_SUPABASE_URL (or SUPABASE_URL) required for Edge invoke')
  }
  return url.replace(/\/$/, '')
}

function resolveAnonKey(): string {
  const key =
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    ''
  if (!key) {
    throw new Error('VITE_SUPABASE_ANON_KEY required for Edge invoke')
  }
  return key
}

function resolveAccessToken(): string | null {
  const t =
    process.env.CG21_SUPABASE_ACCESS_TOKEN?.trim() ||
    process.env.SUPABASE_ACCESS_TOKEN?.trim() ||
    ''
  return t || null
}

export function hasCg21EdgeAuth(): boolean {
  return Boolean(resolveAccessToken())
}

/**
 * Factory matching runSparseProductTransform invoke signature.
 */
export function createDeployedEdgeFullRewriteInvoke(input: {
  usage: Cg21EdgeUsage
}): TransformFunctionsInvoke {
  const { usage } = input
  const baseUrl = resolveProjectUrl()
  const anon = resolveAnonKey()
  const access = resolveAccessToken()
  if (!access) {
    throw new Error('CG21_SUPABASE_ACCESS_TOKEN absent')
  }

  return async (functionName, options) => {
    if (functionName !== 'ai-contract-full-rewrite') {
      return {
        data: null,
        error: { message: `unexpected function ${functionName}` },
      }
    }

    const t0 = Date.now()
    usage.calls += 1
    const res = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        apikey: anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options.body),
    })
    usage.latenciesMs.push(Date.now() - t0)

    let json: unknown = null
    try {
      json = await res.json()
    } catch {
      return {
        data: null,
        error: { message: `Edge non-JSON status=${res.status}` },
      }
    }

    if (!res.ok) {
      return {
        data: json,
        error: {
          message: `Edge HTTP ${res.status}`,
          context: json,
        },
      }
    }

    // Edge returns { ok, changedBlocks, model, ... } or { ok:false, error }
    if (json && typeof json === 'object') {
      const row = json as Record<string, unknown>
      if (typeof row.model === 'string') usage.models.push(row.model)
      // transformApi expects the function body as `data`
      return { data: json, error: null }
    }
    return { data: json, error: null }
  }
}

/** Auth presence report — never includes token material. */
export function cg21AuthStatus(): {
  accessTokenAvailable: boolean
  supabaseUrlConfigured: boolean
  anonKeyConfigured: boolean
} {
  return {
    accessTokenAvailable: hasCg21EdgeAuth(),
    supabaseUrlConfigured: Boolean(
      process.env.VITE_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim(),
    ),
    anonKeyConfigured: Boolean(
      process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
        process.env.SUPABASE_ANON_KEY?.trim(),
    ),
  }
}
