/**
 * Canonical Supabase Auth PKCE callback pipeline.
 * Pure module — no React. Used by AuthCallbackPage + tests.
 *
 * All email flows (recovery, confirm, magic link, invite, email change)
 * land here with ?code=… and optionally ?next=….
 *
 * Supabase client is loaded lazily only when exchanging without test deps.
 */

import type { Session } from '@supabase/supabase-js'

export const AUTH_CALLBACK_PATH = '/auth/callback'

export type AuthCallbackNext =
  | 'recovery'
  | 'confirm'
  | 'magic'
  | 'invite'
  | 'email_change'
  | 'auto'

export type AuthCallbackStatus =
  | 'idle'
  | 'exchanging'
  | 'success'
  | 'error'

export interface AuthCallbackParams {
  code: string | null
  error: string | null
  errorDescription: string | null
  next: AuthCallbackNext
}

export type AuthCallbackExchangeResult =
  | {
      ok: true
      session: Session | null
      isRecovery: boolean
    }
  | {
      ok: false
      reason: 'missing_code' | 'provider_error' | 'exchange_failed'
      /** Friendly Polish message — never raw Supabase text. */
      message: string
    }

export interface AuthCallbackDestination {
  path: string
  state?: Record<string, unknown>
}

const NEXT_VALUES = new Set<AuthCallbackNext>([
  'recovery',
  'confirm',
  'magic',
  'invite',
  'email_change',
  'auto',
])

/** In-flight / completed exchanges keyed by code (exact-once). */
const exchangeCache = new Map<string, Promise<AuthCallbackExchangeResult>>()

export function authCallbackUrl(next: AuthCallbackNext): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : ''
  const params = new URLSearchParams({ next })
  return `${origin}${AUTH_CALLBACK_PATH}?${params.toString()}`
}

export function parseAuthCallbackNext(raw: string | null): AuthCallbackNext {
  if (raw && NEXT_VALUES.has(raw as AuthCallbackNext)) {
    return raw as AuthCallbackNext
  }
  return 'auto'
}

export function parseAuthCallbackParams(
  search: string,
): AuthCallbackParams {
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  )
  const code = params.get('code')
  const error = params.get('error')
  const errorDescription = params.get('error_description')
  // Supabase may include type=recovery on some redirects; prefer explicit next=.
  const typeHint = params.get('type')
  const nextRaw = params.get('next') ?? (typeHint === 'recovery' ? 'recovery' : null)

  return {
    code: code && code.trim() ? code.trim() : null,
    error: error && error.trim() ? error.trim() : null,
    errorDescription:
      errorDescription && errorDescription.trim()
        ? errorDescription.trim().replace(/\+/g, ' ')
        : null,
    next: parseAuthCallbackNext(nextRaw),
  }
}

/** True when the current location must be handled by the callback pipeline. */
export function locationNeedsAuthCallback(
  pathname: string,
  search: string,
): boolean {
  if (pathname === AUTH_CALLBACK_PATH) return false
  const { code, error } = parseAuthCallbackParams(search)
  return Boolean(code || error)
}

export function buildAuthCallbackRedirect(
  search: string,
  hash = '',
): string {
  const qs = search.startsWith('?') ? search : search ? `?${search}` : ''
  const h = hash.startsWith('#') ? hash : hash ? `#${hash}` : ''
  return `${AUTH_CALLBACK_PATH}${qs}${h}`
}

export function mapAuthCallbackFailureMessage(
  reason: 'missing_code' | 'provider_error' | 'exchange_failed',
): string {
  void reason
  return 'Link wygasł lub został już użyty.'
}

function isExpiredOrUsedError(message: string): boolean {
  const n = message.toLowerCase()
  return (
    n.includes('expired') ||
    n.includes('invalid') ||
    n.includes('already') ||
    n.includes('used') ||
    n.includes('otp') ||
    n.includes('flow state') ||
    n.includes('pkce') ||
    n.includes('code verifier') ||
    n.includes('auth code')
  )
}

/**
 * Exchange a PKCE auth code for a session exactly once per code value.
 * Optional deps are for tests only.
 */
export async function exchangeAuthCodeOnce(
  code: string,
  deps?: {
    exchangeCodeForSession: (
      authCode: string,
    ) => Promise<{
      data: { session: Session | null }
      error: { message: string } | null
    }>
    onAuthStateChange: (
      callback: (event: string) => void,
    ) => { data: { subscription: { unsubscribe: () => void } } }
  },
): Promise<AuthCallbackExchangeResult> {
  const existing = exchangeCache.get(code)
  if (existing) return existing

  const promise = performExchange(code, deps)
  exchangeCache.set(code, promise)
  try {
    return await promise
  } catch (err) {
    exchangeCache.delete(code)
    throw err
  }
}

/** Test helper — clears the exact-once cache. */
export function resetAuthCallbackExchangeCache(): void {
  exchangeCache.clear()
}

async function performExchange(
  code: string,
  deps?: {
    exchangeCodeForSession: (
      authCode: string,
    ) => Promise<{
      data: { session: Session | null }
      error: { message: string } | null
    }>
    onAuthStateChange: (
      callback: (event: string) => void,
    ) => { data: { subscription: { unsubscribe: () => void } } }
  },
): Promise<AuthCallbackExchangeResult> {
  let sawRecovery = false

  let exchangeCodeForSession = deps?.exchangeCodeForSession
  let onAuthStateChange = deps?.onAuthStateChange

  if (!exchangeCodeForSession || !onAuthStateChange) {
    const { supabase } = await import('@/lib/supabase')
    exchangeCodeForSession ??= (authCode: string) =>
      supabase.auth.exchangeCodeForSession(authCode)
    onAuthStateChange ??= (callback: (event: string) => void) =>
      supabase.auth.onAuthStateChange((event) => {
        callback(event)
      })
  }

  const { data: listener } = onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      sawRecovery = true
    }
  })

  try {
    const { data, error } = await exchangeCodeForSession(code)

    if (error) {
      const raw = error.message || ''
      return {
        ok: false,
        reason: 'exchange_failed',
        message: isExpiredOrUsedError(raw)
          ? 'Link wygasł lub został już użyty.'
          : 'Nie udało się zweryfikować linku. Spróbuj ponownie.',
      }
    }

    // Give the auth listener a tick to observe PASSWORD_RECOVERY.
    await Promise.resolve()

    return {
      ok: true,
      session: data.session,
      isRecovery: sawRecovery,
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    const network =
      raw.toLowerCase().includes('network') ||
      raw.toLowerCase().includes('fetch') ||
      raw.toLowerCase().includes('failed to fetch')

    return {
      ok: false,
      reason: 'exchange_failed',
      message: network
        ? 'Brak połączenia. Sprawdź sieć i spróbuj ponownie.'
        : 'Link wygasł lub został już użyty.',
    }
  } finally {
    listener.subscription.unsubscribe()
  }
}

export function resolveAuthCallbackDestination(input: {
  next: AuthCallbackNext
  isRecovery: boolean
  hasSession: boolean
}): AuthCallbackDestination {
  const { next, isRecovery, hasSession } = input

  if (next === 'recovery' || isRecovery) {
    return { path: '/reset-password' }
  }

  if (next === 'email_change') {
    return {
      path: '/login',
      state: { emailChanged: true },
    }
  }

  if (next === 'confirm') {
    if (hasSession) {
      return { path: '/dashboard' }
    }
    return {
      path: '/login',
      state: { emailConfirmed: true },
    }
  }

  if (next === 'magic' || next === 'invite') {
    return hasSession
      ? { path: '/dashboard' }
      : { path: '/login', state: { emailConfirmed: true } }
  }

  // auto — infer from recovery flag / session
  if (isRecovery) {
    return { path: '/reset-password' }
  }
  if (hasSession) {
    return { path: '/dashboard' }
  }
  return {
    path: '/login',
    state: { emailConfirmed: true },
  }
}

export function resolveAuthCallbackErrorAction(next: AuthCallbackNext): {
  label: string
  to: string
} {
  if (next === 'recovery') {
    return { label: 'Wyślij nowy link', to: '/forgot-password' }
  }
  if (next === 'confirm' || next === 'invite') {
    return { label: 'Wróć do logowania', to: '/login' }
  }
  return { label: 'Wyślij nowy link', to: '/forgot-password' }
}
