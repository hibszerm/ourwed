import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const viteEnv = (import.meta as unknown as { env?: Record<string, unknown> }).env
const supabaseUrl =
  (viteEnv?.VITE_SUPABASE_URL as string | undefined) ??
  process.env.VITE_SUPABASE_URL
const supabaseAnonKey =
  (viteEnv?.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  process.env.VITE_SUPABASE_ANON_KEY

// In the real app, Vite always provides `import.meta.env`.
// Some unit-test runners import modules without Vite env populated; in that
// case, avoid crashing at import-time (tests that don't hit Supabase will
// still work).
const isViteRuntime = viteEnv != null
if (
  isViteRuntime &&
  (typeof supabaseUrl !== 'string' || !supabaseUrl || typeof supabaseAnonKey !== 'string' || !supabaseAnonKey)
) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
}

const safeSupabaseUrl =
  typeof supabaseUrl === 'string' && supabaseUrl ? supabaseUrl : 'http://localhost'
const safeSupabaseAnonKey =
  typeof supabaseAnonKey === 'string' && supabaseAnonKey
    ? supabaseAnonKey
    : 'local-anon-key'

/**
 * Shared Supabase client (web).
 * Session persistence uses localStorage by default — required for refresh tokens.
 * "Remember me" is handled at the UX layer; mobile can inject its own storage later.
 *
 * detectSessionInUrl is false: PKCE ?code= is exchanged exactly once by the
 * Auth Callback module (/auth/callback), not implicitly on every page load.
 */
export const supabase: SupabaseClient = createClient(
  safeSupabaseUrl,
  safeSupabaseAnonKey,
  {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
  },
)
