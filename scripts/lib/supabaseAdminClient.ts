/**
 * Server-only Supabase Admin client.
 *
 * NEVER import this file from browser/Vite client code.
 * NEVER use VITE_* names for the service-role key.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createRequire } from 'node:module'

function assertServerOnly(): void {
  // Vite/browser bundles define import.meta.env.SSR / import.meta.env.PROD etc.
  // Detect classic browser globals as a hard stop.
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    throw new Error(
      'supabaseAdminClient must not be imported in a browser bundle',
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = import.meta as any
  if (meta?.env && meta.env.VITE_SUPABASE_ANON_KEY && !meta.env.SSR) {
    // Soft signal only — Node scripts using tsx may still have empty meta.env
  }
}

function readEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined
}

export type AdminServerClient = SupabaseClient

/**
 * Creates a privileged Supabase client for local scripts / server runtimes.
 * Required env:
 *   SUPABASE_URL                 (or VITE_SUPABASE_URL for local convenience)
 *   SUPABASE_SERVICE_ROLE_KEY    (never VITE_)
 */
export function createSupabaseAdminClient(): AdminServerClient {
  assertServerOnly()

  const url =
    readEnv('SUPABASE_URL') ??
    readEnv('VITE_SUPABASE_URL') ??
    readEnv('NEXT_PUBLIC_SUPABASE_URL')

  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!url) {
    throw new Error(
      'Missing SUPABASE_URL (or VITE_SUPABASE_URL for local scripts)',
    )
  }
  if (!serviceKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY (server-only; never use VITE_ prefix)',
    )
  }
  if (serviceKey === readEnv('VITE_SUPABASE_ANON_KEY')) {
    throw new Error('Refusing to use anon key as service role')
  }

  // Guard against accidental VITE_SERVICE_ROLE usage
  if (readEnv('VITE_SUPABASE_SERVICE_ROLE_KEY') && !serviceKey) {
    throw new Error(
      'Found VITE_SUPABASE_SERVICE_ROLE_KEY — rename to SUPABASE_SERVICE_ROLE_KEY (never ship in Vite)',
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

/** Optional helper for scripts that need to confirm Node context. */
export function assertNodeScriptContext(scriptName: string): void {
  assertServerOnly()
  try {
    createRequire(import.meta.url)
  } catch {
    throw new Error(`${scriptName}: must run under Node/tsx, not the browser`)
  }
}
