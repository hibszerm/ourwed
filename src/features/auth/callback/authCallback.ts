/**
 * Canonical Supabase Auth callback pipeline.
 *
 * Password recovery (cross-device): token_hash + type=recovery → verifyOtp
 * Legacy / other PKCE email flows: ?code= → exchangeCodeForSession
 *
 * Supabase client is loaded lazily when deps are not injected (tests).
 */

import type { EmailOtpType, Session } from '@supabase/supabase-js'

export const AUTH_CALLBACK_PATH = '/auth/callback'

/** Production origin for recovery email CTAs (Dashboard template). */
export const AUTH_EMAIL_PRODUCTION_ORIGIN = 'https://ourwed.pl'

export type AuthCallbackNext =
  | 'recovery'
  | 'confirm'
  | 'magic'
  | 'invite'
  | 'email_change'
  | 'auto'

export interface AuthCallbackParams {
  code: string | null
  tokenHash: string | null
  type: string | null
  error: string | null
  errorDescription: string | null
  next: AuthCallbackNext
}

export type AuthCallbackResult =
  | {
      ok: true
      session: Session | null
      isRecovery: boolean
    }
  | {
      ok: false
      reason:
        | 'missing_code'
        | 'missing_token'
        | 'provider_error'
        | 'exchange_failed'
        | 'verify_failed'
        | 'invalid_type'
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

const FRIENDLY_EXPIRED = 'Link wygasł lub został już użyty.'

/** In-flight / completed PKCE exchanges keyed by code (exact-once). */
const exchangeCache = new Map<string, Promise<AuthCallbackResult>>()

/** In-flight / completed verifyOtp recoveries keyed by token_hash (exact-once). */
const verifyCache = new Map<string, Promise<AuthCallbackResult>>()

export function authCallbackUrl(next: AuthCallbackNext): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : ''
  const params = new URLSearchParams({ next })
  return `${origin}${AUTH_CALLBACK_PATH}?${params.toString()}`
}

/** Production recovery CTA for Supabase Reset Password email template. */
export function recoveryEmailActionHref(): string {
  return `${AUTH_EMAIL_PRODUCTION_ORIGIN}${AUTH_CALLBACK_PATH}?token_hash={{ .TokenHash }}&type=recovery`
}

export function parseAuthCallbackNext(raw: string | null): AuthCallbackNext {
  if (raw && NEXT_VALUES.has(raw as AuthCallbackNext)) {
    return raw as AuthCallbackNext
  }
  return 'auto'
}

export function parseAuthCallbackParams(search: string): AuthCallbackParams {
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  )
  const code = params.get('code')
  const tokenHash = params.get('token_hash')
  const type = params.get('type')
  const error = params.get('error')
  const errorDescription = params.get('error_description')
  const typeHint = type
  const nextRaw =
    params.get('next') ?? (typeHint === 'recovery' ? 'recovery' : null)

  return {
    code: code && code.trim() ? code.trim() : null,
    tokenHash: tokenHash && tokenHash.trim() ? tokenHash.trim() : null,
    type: type && type.trim() ? type.trim() : null,
    error: error && error.trim() ? error.trim() : null,
    errorDescription:
      errorDescription && errorDescription.trim()
        ? errorDescription.trim().replace(/\+/g, ' ')
        : null,
    next: parseAuthCallbackNext(nextRaw),
  }
}

/**
 * Token-hash recovery takes priority when type=recovery and token_hash is present.
 */
export function isTokenHashRecovery(params: AuthCallbackParams): boolean {
  return Boolean(params.tokenHash && params.type === 'recovery')
}

/** True when the current location must be handled by the callback pipeline. */
export function locationNeedsAuthCallback(
  pathname: string,
  search: string,
): boolean {
  if (pathname === AUTH_CALLBACK_PATH) return false
  const { code, error, tokenHash } = parseAuthCallbackParams(search)
  return Boolean(code || error || tokenHash)
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
  _reason:
    | 'missing_code'
    | 'missing_token'
    | 'provider_error'
    | 'exchange_failed'
    | 'verify_failed'
    | 'invalid_type',
): string {
  void _reason
  return FRIENDLY_EXPIRED
}

function isExpiredOrUsedError(message: string): boolean {
  const n = message.toLowerCase()
  return (
    n.includes('expired') ||
    n.includes('invalid') ||
    n.includes('already') ||
    n.includes('used') ||
    n.includes('otp') ||
    n.includes('token') ||
    n.includes('flow state') ||
    n.includes('pkce') ||
    n.includes('code verifier') ||
    n.includes('auth code')
  )
}

type ExchangeFn = (authCode: string) => Promise<{
  data: { session: Session | null; user?: Session['user'] | null }
  error: { message?: string } | null
}>

type VerifyOtpFn = (args: {
  token_hash: string
  type: EmailOtpType
}) => Promise<{
  data: { session: Session | null; user?: Session['user'] | null }
  error: { message?: string } | null
}>

type OnAuthStateChangeFn = (
  callback: (event: string) => void,
) => { data: { subscription: { unsubscribe: () => void } } }

export type AuthCallbackDeps = {
  exchangeCodeForSession?: ExchangeFn
  verifyOtp?: VerifyOtpFn
  onAuthStateChange?: OnAuthStateChangeFn
}

/** Test helper — clears exact-once caches. */
export function resetAuthCallbackExchangeCache(): void {
  exchangeCache.clear()
  verifyCache.clear()
}

/**
 * Exchange a legacy PKCE auth code for a session exactly once per code.
 */
export async function exchangeAuthCodeOnce(
  code: string,
  deps?: AuthCallbackDeps,
): Promise<AuthCallbackResult> {
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

/**
 * Verify a recovery token_hash exactly once (cross-browser / cross-device).
 * Does not use exchangeCodeForSession.
 */
export async function verifyRecoveryTokenHashOnce(
  tokenHash: string,
  deps?: AuthCallbackDeps,
): Promise<AuthCallbackResult> {
  const existing = verifyCache.get(tokenHash)
  if (existing) return existing

  const promise = performVerifyRecovery(tokenHash, deps)
  verifyCache.set(tokenHash, promise)
  try {
    return await promise
  } catch (err) {
    verifyCache.delete(tokenHash)
    throw err
  }
}

async function resolveAuthFns(deps?: AuthCallbackDeps): Promise<{
  exchangeCodeForSession: ExchangeFn
  verifyOtp: VerifyOtpFn
  onAuthStateChange: OnAuthStateChangeFn
}> {
  if (
    deps?.exchangeCodeForSession &&
    deps.verifyOtp &&
    deps.onAuthStateChange
  ) {
    return {
      exchangeCodeForSession: deps.exchangeCodeForSession,
      verifyOtp: deps.verifyOtp,
      onAuthStateChange: deps.onAuthStateChange,
    }
  }

  const { supabase } = await import('@/lib/supabase')
  return {
    exchangeCodeForSession:
      deps?.exchangeCodeForSession ??
      ((authCode: string) => supabase.auth.exchangeCodeForSession(authCode)),
    verifyOtp:
      deps?.verifyOtp ?? ((args) => supabase.auth.verifyOtp(args)),
    onAuthStateChange:
      deps?.onAuthStateChange ??
      ((callback: (event: string) => void) =>
        supabase.auth.onAuthStateChange((event) => {
          callback(event)
        })),
  }
}

async function performExchange(
  code: string,
  deps?: AuthCallbackDeps,
): Promise<AuthCallbackResult> {
  let sawRecovery = false
  const fns = await resolveAuthFns(deps)

  const { data: listener } = fns.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      sawRecovery = true
    }
  })

  try {
    const { data, error } = await fns.exchangeCodeForSession(code)

    if (error) {
      const raw = error.message || ''
      return {
        ok: false,
        reason: 'exchange_failed',
        message: isExpiredOrUsedError(raw)
          ? FRIENDLY_EXPIRED
          : 'Nie udało się zweryfikować linku. Spróbuj ponownie.',
      }
    }

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
        : FRIENDLY_EXPIRED,
    }
  } finally {
    listener.subscription.unsubscribe()
  }
}

async function performVerifyRecovery(
  tokenHash: string,
  deps?: AuthCallbackDeps,
): Promise<AuthCallbackResult> {
  const fns = await resolveAuthFns(deps)

  // Listener kept for parity with PKCE path; recovery intent is explicit.
  const { data: listener } = fns.onAuthStateChange(() => undefined)

  try {
    const { data, error } = await fns.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    })

    if (error) {
      const raw = error.message || ''
      return {
        ok: false,
        reason: 'verify_failed',
        message: isExpiredOrUsedError(raw)
          ? FRIENDLY_EXPIRED
          : 'Nie udało się zweryfikować linku. Spróbuj ponownie.',
      }
    }

    if (!data.session) {
      return {
        ok: false,
        reason: 'verify_failed',
        message: FRIENDLY_EXPIRED,
      }
    }

    return {
      ok: true,
      session: data.session,
      isRecovery: true,
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    const network =
      raw.toLowerCase().includes('network') ||
      raw.toLowerCase().includes('fetch') ||
      raw.toLowerCase().includes('failed to fetch')

    return {
      ok: false,
      reason: 'verify_failed',
      message: network
        ? 'Brak połączenia. Sprawdź sieć i spróbuj ponownie.'
        : FRIENDLY_EXPIRED,
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

