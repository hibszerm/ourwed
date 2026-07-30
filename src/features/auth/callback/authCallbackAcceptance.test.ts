/**
 * Acceptance tests for the canonical Supabase Auth PKCE callback pipeline.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildAuthCallbackRedirect,
  exchangeAuthCodeOnce,
  locationNeedsAuthCallback,
  parseAuthCallbackParams,
  resetAuthCallbackExchangeCache,
  resolveAuthCallbackDestination,
  resolveAuthCallbackErrorAction,
} from '@/features/auth/callback/authCallback'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  auth callback — ${msg}`)
}

function assertEq<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`FAIL  auth callback — ${msg}: got ${String(actual)} expected ${String(expected)}`)
  }
}

// ── parse / gate ─────────────────────────────────────────────
{
  const parsed = parseAuthCallbackParams(
    '?code=abc123&next=recovery',
  )
  assertEq(parsed.code, 'abc123', 'parses code')
  assertEq(parsed.next, 'recovery', 'parses next=recovery')
  assert(locationNeedsAuthCallback('/', '?code=abc123'), 'root with code needs callback')
  assert(
    !locationNeedsAuthCallback('/auth/callback', '?code=abc123'),
    'callback path does not re-gate',
  )
  assert(
    !locationNeedsAuthCallback('/', ''),
    'homepage without code does not gate',
  )
  assertEq(
    buildAuthCallbackRedirect('?code=abc&next=recovery'),
    '/auth/callback?code=abc&next=recovery',
    'builds callback redirect',
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
    resolveAuthCallbackDestination({
      next: 'confirm',
      isRecovery: false,
      hasSession: false,
    }).path,
    '/login',
    'confirm without session → login',
  )
  assertEq(
    resolveAuthCallbackDestination({
      next: 'magic',
      isRecovery: false,
      hasSession: true,
    }).path,
    '/dashboard',
    'magic → dashboard',
  )
  assertEq(
    resolveAuthCallbackDestination({
      next: 'invite',
      isRecovery: false,
      hasSession: true,
    }).path,
    '/dashboard',
    'invite → dashboard',
  )
  assertEq(
    resolveAuthCallbackDestination({
      next: 'email_change',
      isRecovery: false,
      hasSession: false,
    }).path,
    '/login',
    'email_change → login',
  )
  assertEq(
    resolveAuthCallbackErrorAction('recovery').to,
    '/forgot-password',
    'recovery error CTA → forgot-password',
  )
}

// ── exchangeCodeForSession once + expired ────────────────────
{
  resetAuthCallbackExchangeCache()
  let calls = 0
  const deps = {
    exchangeCodeForSession: async () => {
      calls += 1
      return {
        data: { session: { access_token: 't' } as never },
        error: null,
      }
    },
    onAuthStateChange: (cb: (event: string) => void) => {
      cb('PASSWORD_RECOVERY')
      return { data: { subscription: { unsubscribe: () => undefined } } }
    },
  }

  const a = await exchangeAuthCodeOnce('code-1', deps)
  const b = await exchangeAuthCodeOnce('code-1', deps)
  assert(a.ok && b.ok, 'exchange success')
  assertEq(calls, 1, 'exchangeCodeForSession called once')
  if (a.ok) assert(a.isRecovery, 'recovery event detected')
}

{
  resetAuthCallbackExchangeCache()
  const result = await exchangeAuthCodeOnce('expired', {
    exchangeCodeForSession: async () => ({
      data: { session: null },
      error: { message: 'Email link is invalid or has expired' },
    }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe: () => undefined } },
    }),
  })
  assert(!result.ok, 'expired fails')
  if (!result.ok) {
    assertEq(
      result.message,
      'Link wygasł lub został już użyty.',
      'friendly expired message',
    )
  }
}

// ── source wiring ────────────────────────────────────────────
{
  const router = readFileSync(join(ROOT, 'src/routes/router.tsx'), 'utf8')
  assert(router.includes('AuthCallbackGate'), 'router uses AuthCallbackGate')
  assert(router.includes('/auth/callback'), 'router has /auth/callback')
  assert(router.includes('AuthCallbackPage'), 'router mounts AuthCallbackPage')

  const supabaseClient = readFileSync(join(ROOT, 'src/lib/supabase.ts'), 'utf8')
  assert(
    supabaseClient.includes('detectSessionInUrl: false'),
    'detectSessionInUrl disabled — callback owns exchange',
  )
  assert(supabaseClient.includes("flowType: 'pkce'"), 'PKCE flow preserved')

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
    'reset redirects to callback?next=recovery',
  )

  const callbackPage = readFileSync(
    join(ROOT, 'src/pages/AuthCallbackPage.tsx'),
    'utf8',
  )
  assert(
    callbackPage.includes('exchangeAuthCodeOnce'),
    'callback page exchanges code',
  )
  assert(
    callbackPage.includes('Trwa weryfikacja'),
    'callback shows verification status',
  )
  assert(
    callbackPage.includes('armPasswordRecovery'),
    'callback arms recovery for reset page',
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

  const gate = readFileSync(
    join(ROOT, 'src/features/auth/callback/AuthCallbackGate.tsx'),
    'utf8',
  )
  assert(
    gate.includes('locationNeedsAuthCallback'),
    'gate intercepts code before child routes',
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
}

console.log('PASS  auth callback')
