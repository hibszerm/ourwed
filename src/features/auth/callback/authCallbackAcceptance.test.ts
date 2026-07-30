/**
 * Acceptance tests for Supabase Auth callback:
 * - TokenHash recovery (verifyOtp) — cross-browser / cross-device
 * - Legacy PKCE (?code= → exchangeCodeForSession)
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildAuthCallbackRedirect,
  exchangeAuthCodeOnce,
  isTokenHashRecovery,
  locationNeedsAuthCallback,
  parseAuthCallbackParams,
  recoveryEmailActionHref,
  resetAuthCallbackExchangeCache,
  resolveAuthCallbackDestination,
  resolveAuthCallbackErrorAction,
  verifyRecoveryTokenHashOnce,
} from '@/features/auth/callback/authCallback'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  auth callback — ${msg}`)
}

function assertEq<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(
      `FAIL  auth callback — ${msg}: got ${String(actual)} expected ${String(expected)}`,
    )
  }
}

const noopVerify = async () => ({
  data: { session: null },
  error: { message: 'unexpected verifyOtp' },
})

const noopExchange = async () => ({
  data: { session: null },
  error: { message: 'unexpected exchangeCodeForSession' },
})

const noopListener = () => ({
  data: { subscription: { unsubscribe: () => undefined } },
})

// ── parse / gate ─────────────────────────────────────────────
{
  const parsed = parseAuthCallbackParams('?code=abc123&next=recovery')
  assertEq(parsed.code, 'abc123', 'parses code')
  assertEq(parsed.next, 'recovery', 'parses next=recovery')
  assert(locationNeedsAuthCallback('/', '?code=abc123'), 'root with code needs callback')
  assert(
    !locationNeedsAuthCallback('/auth/callback', '?code=abc123'),
    'callback path does not re-gate',
  )
  assert(!locationNeedsAuthCallback('/', ''), 'homepage without code does not gate')
  assertEq(
    buildAuthCallbackRedirect('?code=abc&next=recovery'),
    '/auth/callback?code=abc&next=recovery',
    'builds callback redirect',
  )
}

{
  const recovery = parseAuthCallbackParams(
    '?token_hash=th_secret_value&type=recovery',
  )
  assertEq(recovery.tokenHash, 'th_secret_value', 'parses token_hash')
  assertEq(recovery.type, 'recovery', 'parses type=recovery')
  assertEq(recovery.next, 'recovery', 'type=recovery implies next=recovery')
  assertEq(recovery.code, null, 'no code on token_hash recovery')
  assert(isTokenHashRecovery(recovery), 'isTokenHashRecovery true')
  assert(
    locationNeedsAuthCallback('/', '?token_hash=x&type=recovery'),
    'token_hash gates to callback',
  )
  assertEq(
    recoveryEmailActionHref(),
    'https://ourwed.pl/auth/callback?token_hash={{ .TokenHash }}&type=recovery',
    'production recovery CTA',
  )
}

{
  const expired = parseAuthCallbackParams(
    '?error=access_denied&error_description=Email+link+is+invalid+or+has+expired&next=recovery',
  )
  assertEq(expired.code, null, 'no code on provider error')
  assertEq(expired.error, 'access_denied', 'parses error')
  assert(
    expired.errorDescription?.includes('expired'),
    'parses error_description',
  )
  assert(locationNeedsAuthCallback('/', '?error=access_denied'), 'error gates to callback')
}

{
  const missing = parseAuthCallbackParams('?type=recovery')
  assertEq(missing.tokenHash, null, 'missing token_hash')
  assert(!isTokenHashRecovery(missing), 'not token-hash recovery without hash')
}

// ── destinations ─────────────────────────────────────────────
{
  assertEq(
    resolveAuthCallbackDestination({
      next: 'recovery',
      isRecovery: false,
      hasSession: true,
    }).path,
    '/reset-password',
    'recovery → reset-password',
  )
  assertEq(
    resolveAuthCallbackDestination({
      next: 'auto',
      isRecovery: true,
      hasSession: true,
    }).path,
    '/reset-password',
    'auto+recovery event → reset-password',
  )
  assertEq(
    resolveAuthCallbackDestination({
      next: 'confirm',
      isRecovery: false,
      hasSession: true,
    }).path,
    '/dashboard',
    'confirm with session → dashboard',
  )
  assertEq(
    resolveAuthCallbackErrorAction('recovery').to,
    '/forgot-password',
    'recovery error CTA → forgot-password',
  )
  assertEq(
    resolveAuthCallbackErrorAction('recovery').label,
    'Wyślij nowy link',
    'recovery error label',
  )
}

// ── verifyOtp recovery (cross-device: no PKCE verifier) ───────
{
  resetAuthCallbackExchangeCache()
  let verifyCalls = 0
  let exchangeCalls = 0
  let lastTokenHash: string | null = null
  let lastType: string | null = null

  const deps = {
    exchangeCodeForSession: async () => {
      exchangeCalls += 1
      return noopExchange()
    },
    verifyOtp: async (args: { token_hash: string; type: string }) => {
      verifyCalls += 1
      lastTokenHash = args.token_hash
      lastType = args.type
      return {
        data: { session: { access_token: 'recovery-session' } as never },
        error: null,
      }
    },
    onAuthStateChange: noopListener,
  }

  const [a, b] = await Promise.all([
    verifyRecoveryTokenHashOnce('hash-cross-device', deps),
    verifyRecoveryTokenHashOnce('hash-cross-device', deps),
  ])

  assert(a.ok && b.ok, 'concurrent verify success')
  assertEq(verifyCalls, 1, 'verifyOtp called exactly once')
  assertEq(exchangeCalls, 0, 'exchangeCodeForSession not called for token_hash')
  assertEq(lastTokenHash, 'hash-cross-device', 'verify receives token_hash')
  assertEq(lastType, 'recovery', "verify type is 'recovery'")
  if (a.ok) {
    assert(a.isRecovery, 'token_hash path marks isRecovery')
    assert(a.session, 'session present after verify')
  }

  // Second sequential call must still be cache-only (no new SDK call).
  const c = await verifyRecoveryTokenHashOnce('hash-cross-device', deps)
  assert(c.ok, 'cached verify still ok')
  assertEq(verifyCalls, 1, 'still exactly one verifyOtp after cache hit')
}

{
  resetAuthCallbackExchangeCache()
  const result = await verifyRecoveryTokenHashOnce('expired-hash', {
    exchangeCodeForSession: noopExchange,
    verifyOtp: async () => ({
      data: { session: null },
      error: { message: 'Token has expired or is invalid' },
    }),
    onAuthStateChange: noopListener,
  })
  assert(!result.ok, 'expired token fails')
  if (!result.ok) {
    assertEq(
      result.message,
      'Link wygasł lub został już użyty.',
      'friendly expired message',
    )
  }
}

{
  resetAuthCallbackExchangeCache()
  const result = await verifyRecoveryTokenHashOnce('used-hash', {
    exchangeCodeForSession: noopExchange,
    verifyOtp: async () => ({
      data: { session: null },
      error: { message: 'OTP has already been used' },
    }),
    onAuthStateChange: noopListener,
  })
  assert(!result.ok, 'already-used fails')
  if (!result.ok) {
    assertEq(result.message, 'Link wygasł lub został już użyty.', 'friendly used message')
  }
}

// ── legacy PKCE exchange still works ─────────────────────────
{
  resetAuthCallbackExchangeCache()
  let realCalls = 0
  let verifyCalls = 0
  const deps = {
    exchangeCodeForSession: async () => {
      realCalls += 1
      return {
        data: { session: { access_token: 't' } as never },
        error: null,
      }
    },
    verifyOtp: async () => {
      verifyCalls += 1
      return noopVerify()
    },
    onAuthStateChange: (cb: (event: string) => void) => {
      cb('PASSWORD_RECOVERY')
      return noopListener()
    },
  }

  const [a, b] = await Promise.all([
    exchangeAuthCodeOnce('legacy-code', deps),
    exchangeAuthCodeOnce('legacy-code', deps),
  ])
  assert(a.ok && b.ok, 'concurrent exchange success')
  assertEq(realCalls, 1, 'legacy exchange once')
  assertEq(verifyCalls, 0, 'legacy path does not call verifyOtp')
  if (a.ok) assert(a.isRecovery, 'PASSWORD_RECOVERY sets isRecovery')
}

{
  resetAuthCallbackExchangeCache()
  const result = await exchangeAuthCodeOnce('expired', {
    exchangeCodeForSession: async () => ({
      data: { session: null },
      error: { message: 'Email link is invalid or has expired' },
    }),
    verifyOtp: noopVerify,
    onAuthStateChange: noopListener,
  })
  assert(!result.ok, 'expired PKCE fails')
  if (!result.ok) {
    assertEq(
      result.message,
      'Link wygasł lub został już użyty.',
      'friendly PKCE expired message',
    )
  }
}

// ── source wiring + security ─────────────────────────────────
{
  const router = readFileSync(join(ROOT, 'src/routes/router.tsx'), 'utf8')
  assert(router.includes('AuthCallbackGate'), 'router uses AuthCallbackGate')
  assert(router.includes('/auth/callback'), 'router has /auth/callback')
  assert(router.includes('AuthCallbackPage'), 'router mounts AuthCallbackPage')

  const supabaseClient = readFileSync(join(ROOT, 'src/lib/supabase.ts'), 'utf8')
  assert(
    supabaseClient.includes('detectSessionInUrl: false'),
    'detectSessionInUrl disabled — callback owns exchange/verify',
  )
  assert(supabaseClient.includes("flowType: 'pkce'"), 'PKCE flow preserved globally')

  const authService = readFileSync(
    join(ROOT, 'src/features/auth/services/authService.ts'),
    'utf8',
  )
  assert(
    authService.includes("authCallbackUrl('confirm')"),
    'signup redirects to callback?next=confirm',
  )
  assert(
    authService.includes("authCallbackUrl('recovery')"),
    'resetPasswordForEmail redirectTo still set (legacy + SiteURL)',
  )

  const callbackSrc = readFileSync(
    join(ROOT, 'src/features/auth/callback/authCallback.ts'),
    'utf8',
  )
  assert(!callbackSrc.includes('__OURWED_AUTH_EXCHANGE__'), 'no TEMP window diagnostics')
  assert(!callbackSrc.includes('getAuthExchangeDiagnostics'), 'diagnostics helper removed')
  assert(!callbackSrc.includes('fullCallbackUrl'), 'no fullCallbackUrl logging')
  assert(
    !/console\.(log|debug|info|warn)\([^)]*token_hash/.test(callbackSrc),
    'no token_hash console logging',
  )

  const callbackPage = readFileSync(
    join(ROOT, 'src/pages/AuthCallbackPage.tsx'),
    'utf8',
  )
  assert(
    callbackPage.includes('verifyRecoveryTokenHashOnce'),
    'callback page verifies token_hash',
  )
  assert(
    callbackPage.includes('exchangeAuthCodeOnce'),
    'callback page still exchanges legacy code',
  )
  assert(
    callbackPage.includes('isTokenHashRecovery'),
    'token_hash recovery takes priority',
  )
  assert(
    callbackPage.includes('confirm_recovery') ||
      callbackPage.includes('Kontynuuj reset hasła'),
    'confirm-click before verifyOtp (prefetch guard)',
  )
  assert(
    callbackPage.includes("replaceState({}, '', '/auth/callback')"),
    'strips sensitive params from URL',
  )
  assert(
    callbackPage.includes('navigate(phase.path, { replace: true') ||
      callbackPage.includes('<Navigate to={phase.path} replace'),
    'navigation uses replace semantics',
  )
  assert(callbackPage.includes("path: '/reset-password'"), 'success → /reset-password')
  assert(
    callbackPage.includes('Trwa weryfikacja') ||
      callbackPage.includes('AuthLoadingScreen'),
    'callback shows verification status (not homepage)',
  )
  assert(
    callbackPage.includes('Link wygasł lub został już użyty'),
    'callback error copy',
  )
  assert(
    callbackPage.includes('Wyślij nowy link') ||
      callbackPage.includes('resolveAuthCallbackErrorAction'),
    'callback offers new link action',
  )
  assert(callbackPage.includes('armPasswordRecovery'), 'arms recovery for reset page')
  assert(
    !/console\.(log|debug|info)\([^)]*token/.test(callbackPage),
    'callback page does not console-log tokens',
  )

  const gate = readFileSync(
    join(ROOT, 'src/features/auth/callback/AuthCallbackGate.tsx'),
    'utf8',
  )
  assert(
    gate.includes('locationNeedsAuthCallback'),
    'gate intercepts code/token before child routes',
  )

  const resetForm = readFileSync(
    join(ROOT, 'src/features/auth/components/ResetPasswordForm.tsx'),
    'utf8',
  )
  assert(
    resetForm.includes("navigate('/login'") &&
      resetForm.includes('passwordReset: true'),
    'successful password update → login with success state',
  )

  const loginPage = readFileSync(join(ROOT, 'src/pages/LoginPage.tsx'), 'utf8')
  assert(
    loginPage.includes('Hasło zostało zmienione'),
    'login shows password-changed message',
  )

  const recoveryHtml = readFileSync(
    join(ROOT, 'supabase/templates/auth/recovery.html'),
    'utf8',
  )
  assert(
    recoveryHtml.includes(
      'https://ourwed.pl/auth/callback?token_hash={{ .TokenHash }}&type=recovery',
    ),
    'recovery email CTA uses TokenHash',
  )
  assert(
    !recoveryHtml.includes('href="{{ .ConfirmationURL }}"'),
    'recovery CTA no longer ConfirmationURL',
  )
}

console.log('PASS  auth callback')
