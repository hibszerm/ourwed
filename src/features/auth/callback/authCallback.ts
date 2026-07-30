/**
 * Canonical Supabase Auth callback pipeline.
 *
 * All actionable auth emails:
 *   token_hash + type + intent → confirm click → verifyOtp (exact-once)
 *
 * Legacy emails already sent:
 *   ?code= → exchangeCodeForSession (exact-once)
 *
 * Supabase client is loaded lazily when deps are not injected (tests).
 */

import type { EmailOtpType, Session } from '@supabase/supabase-js'

export const AUTH_CALLBACK_PATH = '/auth/callback'

/** Production origin for auth email CTAs (Dashboard templates). */
export const AUTH_EMAIL_PRODUCTION_ORIGIN = 'https://ourwed.pl'

/** OurWed intent — never trust arbitrary redirect URLs from the query string. */
export type AuthCallbackIntent =
  | 'recovery'
  | 'signup'
  | 'magic-link'
  | 'invite'
  | 'email-change'

/** Legacy `next` query values still accepted for ?code= links. */
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
  intent: AuthCallbackIntent | null
  error: string | null
  errorDescription: string | null
  /** Legacy PKCE / redirect intent. */
  next: AuthCallbackNext
}

export type AuthCallbackResult =
  | {
      ok: true
      session: Session | null
      isRecovery: boolean
      intent: AuthCallbackIntent | null
    }
  | {
      ok: false
      reason: AuthCallbackFailureReason
      /** Friendly Polish message — never raw Supabase text. */
      message: string
    }

export interface AuthCallbackDestination {
  path: string
  state?: Record<string, unknown>
}

export interface AuthConfirmCopy {
  title: string
  subtitle: string
  body: string
  buttonLabel: string
  verifyingLabel: string
}

const FRIENDLY_EXPIRED = 'Link wygasł lub został już użyty.'

const NEXT_VALUES = new Set<AuthCallbackNext>([
  'recovery',
  'confirm',
  'magic',
  'invite',
  'email_change',
  'auto',
])

const INTENT_VALUES = new Set<AuthCallbackIntent>([
  'recovery',
  'signup',
  'magic-link',
  'invite',
  'email-change',
])

/**
 * Allow-listed OurWed intent → verifyOtp type + destinations.
 * Types match installed @supabase/auth-js EmailOtpType + current docs:
 * signup/magic-link use `email` for token_hash verification.
 */
export const AUTH_TOKEN_HASH_FLOWS: Record<
  AuthCallbackIntent,
  {
    verificationType: EmailOtpType
    /** Accepted `type` query values (primary first). */
    acceptedTypes: readonly string[]
    destination: (hasSession: boolean) => AuthCallbackDestination
    confirm: AuthConfirmCopy
    errorAction: { label: string; to: string }
    safeFallbackPath: string
  }
> = {
  recovery: {
    verificationType: 'recovery',
    acceptedTypes: ['recovery'],
    destination: () => ({ path: '/reset-password' }),
    confirm: {
      title: 'Reset hasła',
      subtitle: 'Potwierdź, że chcesz ustawić nowe hasło do konta OurWed.',
      body: 'Kliknij poniżej, aby kontynuować.',
      buttonLabel: 'Kontynuuj reset hasła',
      verifyingLabel: 'Weryfikacja…',
    },
    errorAction: { label: 'Wyślij nowy link', to: '/forgot-password' },
    safeFallbackPath: '/forgot-password',
  },
  signup: {
    verificationType: 'email',
    acceptedTypes: ['email', 'signup'],
    destination: (hasSession) =>
      hasSession
        ? { path: '/dashboard' }
        : { path: '/login', state: { emailConfirmed: true } },
    confirm: {
      title: 'Potwierdź konto',
      subtitle:
        'Potwierdź adres e-mail, aby dokończyć zakładanie konta OurWed.',
      body: 'Kliknij poniżej, aby aktywować konto.',
      buttonLabel: 'Potwierdź konto',
      verifyingLabel: 'Weryfikacja…',
    },
    errorAction: {
      label: 'Wyślij ponownie link potwierdzający',
      to: '/register',
    },
    safeFallbackPath: '/register',
  },
  'magic-link': {
    verificationType: 'email',
    acceptedTypes: ['email', 'magiclink'],
    destination: (hasSession) =>
      hasSession
        ? { path: '/dashboard' }
        : { path: '/login', state: { emailConfirmed: true } },
    confirm: {
      title: 'Zaloguj się do OurWed',
      subtitle: 'Potwierdź, że chcesz zalogować się jednym kliknięciem.',
      body: 'Kliknij poniżej, aby kontynuować logowanie.',
      buttonLabel: 'Kontynuuj logowanie',
      verifyingLabel: 'Weryfikacja…',
    },
    errorAction: { label: 'Wyślij nowy link logowania', to: '/login' },
    safeFallbackPath: '/login',
  },
  invite: {
    verificationType: 'invite',
    acceptedTypes: ['invite'],
    destination: (hasSession) =>
      hasSession
        ? { path: '/dashboard' }
        : { path: '/login', state: { emailConfirmed: true } },
    confirm: {
      title: 'Zaproszenie do OurWed',
      subtitle: 'Przyjmij zaproszenie, aby dokończyć zakładanie konta.',
      body: 'Kliknij poniżej, aby kontynuować.',
      buttonLabel: 'Przyjmij zaproszenie',
      verifyingLabel: 'Weryfikacja…',
    },
    errorAction: { label: 'Poproś o nowe zaproszenie', to: '/login' },
    safeFallbackPath: '/login',
  },
  'email-change': {
    verificationType: 'email_change',
    acceptedTypes: ['email_change'],
    destination: () => ({
      path: '/login',
      state: { emailChanged: true },
    }),
    confirm: {
      title: 'Potwierdź nowy adres e-mail',
      subtitle: 'Potwierdź zmianę adresu e-mail przypisanego do konta OurWed.',
      body: 'Kliknij poniżej, aby potwierdzić zmianę.',
      buttonLabel: 'Potwierdź zmianę adresu',
      verifyingLabel: 'Weryfikacja…',
    },
    errorAction: { label: 'Zaloguj się ponownie', to: '/login' },
    safeFallbackPath: '/login',
  },
}

/** In-flight / completed PKCE exchanges keyed by code (exact-once). */
const exchangeCache = new Map<string, Promise<AuthCallbackResult>>()

/** In-flight / completed verifyOtp keyed by `${type}:${tokenHash}` (exact-once). */
const verifyCache = new Map<string, Promise<AuthCallbackResult>>()

export function authCallbackUrl(next: AuthCallbackNext): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : ''
  const params = new URLSearchParams({ next })
  return `${origin}${AUTH_CALLBACK_PATH}?${params.toString()}`
}

/** Production CTA for a TokenHash auth email. */
export function authEmailActionHref(
  intent: AuthCallbackIntent,
  verificationType: EmailOtpType = AUTH_TOKEN_HASH_FLOWS[intent]
    .verificationType,
): string {
  return `${AUTH_EMAIL_PRODUCTION_ORIGIN}${AUTH_CALLBACK_PATH}?token_hash={{ .TokenHash }}&type=${verificationType}&intent=${intent}`
}

/** @deprecated use authEmailActionHref('recovery') */
export function recoveryEmailActionHref(): string {
  return authEmailActionHref('recovery')
}

export function parseAuthCallbackNext(raw: string | null): AuthCallbackNext {
  if (raw && NEXT_VALUES.has(raw as AuthCallbackNext)) {
    return raw as AuthCallbackNext
  }
  return 'auto'
}

export function parseAuthCallbackIntent(
  raw: string | null,
): AuthCallbackIntent | null {
  if (raw && INTENT_VALUES.has(raw as AuthCallbackIntent)) {
    return raw as AuthCallbackIntent
  }
  return null
}

/** Infer intent from OTP type when `intent` is absent (legacy TokenHash recovery links). */
export function inferIntentFromType(
  type: string | null,
): AuthCallbackIntent | null {
  if (!type) return null
  if (type === 'recovery') return 'recovery'
  if (type === 'invite') return 'invite'
  if (type === 'email_change') return 'email-change'
  // `email` / `signup` / `magiclink` are ambiguous without intent.
  return null
}

export function parseAuthCallbackParams(search: string): AuthCallbackParams {
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  )
  const code = params.get('code')
  const tokenHash = params.get('token_hash')
  const type = params.get('type')
  const intentRaw = params.get('intent')
  const error = params.get('error')
  const errorDescription = params.get('error_description')
  const intent =
    parseAuthCallbackIntent(intentRaw) ?? inferIntentFromType(type)
  const nextRaw =
    params.get('next') ??
    (intent === 'recovery' || type === 'recovery'
      ? 'recovery'
      : intent === 'signup'
        ? 'confirm'
        : intent === 'magic-link'
          ? 'magic'
          : intent === 'invite'
            ? 'invite'
            : intent === 'email-change'
              ? 'email_change'
              : null)

  return {
    code: code && code.trim() ? code.trim() : null,
    tokenHash: tokenHash && tokenHash.trim() ? tokenHash.trim() : null,
    type: type && type.trim() ? type.trim() : null,
    intent,
    error: error && error.trim() ? error.trim() : null,
    errorDescription:
      errorDescription && errorDescription.trim()
        ? errorDescription.trim().replace(/\+/g, ' ')
        : null,
    next: parseAuthCallbackNext(nextRaw),
  }
}

export function isTokenHashCallback(params: AuthCallbackParams): boolean {
  return Boolean(params.tokenHash)
}

/** @deprecated use isTokenHashCallback */
export function isTokenHashRecovery(params: AuthCallbackParams): boolean {
  return Boolean(params.tokenHash && params.intent === 'recovery')
}

export type AuthCallbackFailureReason =
  | 'missing_code'
  | 'missing_token'
  | 'missing_intent'
  | 'unsupported_intent'
  | 'type_mismatch'
  | 'provider_error'
  | 'exchange_failed'
  | 'verify_failed'
  | 'invalid_type'

export type ResolvedTokenHashFlow =
  | {
      ok: true
      tokenHash: string
      intent: AuthCallbackIntent
      verificationType: EmailOtpType
      confirm: AuthConfirmCopy
    }
  | { ok: false; reason: AuthCallbackFailureReason; message: string }

/**
 * Validate token_hash + type + intent against the allow-listed flow map.
 */
export function resolveTokenHashFlow(
  params: AuthCallbackParams,
): ResolvedTokenHashFlow {
  if (!params.tokenHash) {
    return {
      ok: false,
      reason: 'missing_token',
      message: mapAuthCallbackFailureMessage('missing_token'),
    }
  }

  if (!params.intent) {
    return {
      ok: false,
      reason: params.type ? 'missing_intent' : 'unsupported_intent',
      message: mapAuthCallbackFailureMessage(
        params.type ? 'missing_intent' : 'unsupported_intent',
      ),
    }
  }

  const flow = AUTH_TOKEN_HASH_FLOWS[params.intent]
  if (!flow) {
    return {
      ok: false,
      reason: 'unsupported_intent',
      message: mapAuthCallbackFailureMessage('unsupported_intent'),
    }
  }

  if (!params.type) {
    return {
      ok: false,
      reason: 'invalid_type',
      message: mapAuthCallbackFailureMessage('invalid_type'),
    }
  }

  if (!flow.acceptedTypes.includes(params.type)) {
    return {
      ok: false,
      reason: 'type_mismatch',
      message: mapAuthCallbackFailureMessage('type_mismatch'),
    }
  }

  return {
    ok: true,
    tokenHash: params.tokenHash,
    intent: params.intent,
    verificationType: flow.verificationType,
    confirm: flow.confirm,
  }
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
  _reason: AuthCallbackFailureReason,
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
    n.includes('auth code') ||
    n.includes('user not found') ||
    n.includes('deleted')
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

export type VerifyAuthTokenHashInput = {
  tokenHash: string
  verificationType: EmailOtpType
  intent: AuthCallbackIntent
}

/**
 * Verify a token_hash exactly once (cross-browser / cross-device).
 * Does not use exchangeCodeForSession.
 */
export async function verifyAuthTokenHashOnce(
  input: VerifyAuthTokenHashInput,
  deps?: AuthCallbackDeps,
): Promise<AuthCallbackResult> {
  const key = `${input.verificationType}:${input.tokenHash}`
  const existing = verifyCache.get(key)
  if (existing) return existing

  const promise = performVerifyTokenHash(input, deps)
  verifyCache.set(key, promise)
  try {
    return await promise
  } catch (err) {
    verifyCache.delete(key)
    throw err
  }
}

/** @deprecated use verifyAuthTokenHashOnce */
export async function verifyRecoveryTokenHashOnce(
  tokenHash: string,
  deps?: AuthCallbackDeps,
): Promise<AuthCallbackResult> {
  return verifyAuthTokenHashOnce(
    {
      tokenHash,
      verificationType: 'recovery',
      intent: 'recovery',
    },
    deps,
  )
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
      intent: sawRecovery ? 'recovery' : null,
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

async function performVerifyTokenHash(
  input: VerifyAuthTokenHashInput,
  deps?: AuthCallbackDeps,
): Promise<AuthCallbackResult> {
  const fns = await resolveAuthFns(deps)
  const { data: listener } = fns.onAuthStateChange(() => undefined)

  try {
    const { data, error } = await fns.verifyOtp({
      token_hash: input.tokenHash,
      type: input.verificationType,
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

    const needsSession =
      input.intent === 'recovery' ||
      input.intent === 'magic-link' ||
      input.intent === 'invite'

    if (needsSession && !data.session) {
      return {
        ok: false,
        reason: 'verify_failed',
        message: FRIENDLY_EXPIRED,
      }
    }

    return {
      ok: true,
      session: data.session,
      isRecovery: input.intent === 'recovery',
      intent: input.intent,
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
  intent?: AuthCallbackIntent | null
}): AuthCallbackDestination {
  const { next, isRecovery, hasSession, intent } = input

  if (intent && AUTH_TOKEN_HASH_FLOWS[intent]) {
    return AUTH_TOKEN_HASH_FLOWS[intent].destination(hasSession)
  }

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

export function resolveAuthCallbackErrorAction(
  nextOrIntent: AuthCallbackNext | AuthCallbackIntent,
): {
  label: string
  to: string
} {
  if (INTENT_VALUES.has(nextOrIntent as AuthCallbackIntent)) {
    return AUTH_TOKEN_HASH_FLOWS[nextOrIntent as AuthCallbackIntent].errorAction
  }

  const next = nextOrIntent as AuthCallbackNext
  if (next === 'recovery') {
    return { label: 'Wyślij nowy link', to: '/forgot-password' }
  }
  if (next === 'confirm') {
    return {
      label: 'Wyślij ponownie link potwierdzający',
      to: '/register',
    }
  }
  if (next === 'magic') {
    return { label: 'Wyślij nowy link logowania', to: '/login' }
  }
  if (next === 'invite') {
    return { label: 'Poproś o nowe zaproszenie', to: '/login' }
  }
  if (next === 'email_change') {
    return { label: 'Zaloguj się ponownie', to: '/login' }
  }
  return { label: 'Wyślij nowy link', to: '/forgot-password' }
}

export function getConfirmCopyForIntent(
  intent: AuthCallbackIntent,
): AuthConfirmCopy {
  return AUTH_TOKEN_HASH_FLOWS[intent].confirm
}
