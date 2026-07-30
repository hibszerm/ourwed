/**
 * Acceptance tests for unified TokenHash auth callback + legacy PKCE.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EmailOtpType } from '@supabase/supabase-js'
import {
  AUTH_TOKEN_HASH_FLOWS,
  authEmailActionHref,
  buildAuthCallbackRedirect,
  exchangeAuthCodeOnce,
  isTokenHashCallback,
  locationNeedsAuthCallback,
  parseAuthCallbackParams,
  resetAuthCallbackExchangeCache,
  resolveAuthCallbackDestination,
  resolveAuthCallbackErrorAction,
  resolveTokenHashFlow,
  verifyAuthTokenHashOnce,
  type AuthCallbackIntent,
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

const INTENTS: AuthCallbackIntent[] = [
  'recovery',
  'signup',
  'magic-link',
  'invite',
  'email-change',
]

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

for (const intent of INTENTS) {
  const flow = AUTH_TOKEN_HASH_FLOWS[intent]
  const type = flow.verificationType
  const qs = `?token_hash=th_secret&type=${type}&intent=${intent}`
  const parsed = parseAuthCallbackParams(qs)
  assertEq(parsed.tokenHash, 'th_secret', `${intent}: parses token_hash`)
  assertEq(parsed.type, type, `${intent}: parses type`)
  assertEq(parsed.intent, intent, `${intent}: parses intent`)
  assert(isTokenHashCallback(parsed), `${intent}: isTokenHashCallback`)
  assert(locationNeedsAuthCallback('/', qs), `${intent}: gate intercepts`)

  const resolved = resolveTokenHashFlow(parsed)
  assert(resolved.ok, `${intent}: resolveTokenHashFlow ok`)
  if (resolved.ok) {
    assertEq(resolved.verificationType, type, `${intent}: verification type`)
    assertEq(resolved.intent, intent, `${intent}: resolved intent`)
  }

  assertEq(
    authEmailActionHref(intent),
    `https://ourwed.pl/auth/callback?token_hash={{ .TokenHash }}&type=${type}&intent=${intent}`,
    `${intent}: production CTA`,
  )
}

{
  // Legacy recovery without intent still works via type inference.
  const legacy = parseAuthCallbackParams('?token_hash=th&type=recovery')
  assertEq(legacy.intent, 'recovery', 'infers recovery intent from type')
  assert(resolveTokenHashFlow(legacy).ok, 'legacy recovery TokenHash resolves')
}

{
  const ambiguous = parseAuthCallbackParams('?token_hash=th&type=email')
  assertEq(ambiguous.intent, null, 'type=email alone does not invent intent')
  const resolved = resolveTokenHashFlow(ambiguous)
  assert(!resolved.ok, 'ambiguous email type fails safely')
}

{
  const mismatch = resolveTokenHashFlow(
    parseAuthCallbackParams(
      '?token_hash=th&type=recovery&intent=signup',
    ),
  )
  assert(!mismatch.ok, 'type/intent mismatch fails')
}

{
  const missing = resolveTokenHashFlow(
    parseAuthCallbackParams('?type=email&intent=signup'),
  )
  assert(!missing.ok, 'missing token_hash fails')
}

{
  const unknown = resolveTokenHashFlow(
    parseAuthCallbackParams(
      '?token_hash=th&type=email&intent=not-a-real-intent',
    ),
  )
  assert(!unknown.ok, 'unknown intent fails')
}

{
  const expired = parseAuthCallbackParams(
    '?error=access_denied&error_description=Email+link+is+invalid+or+has+expired&next=recovery',
  )
  assertEq(expired.error, 'access_denied', 'parses error')
  assert(locationNeedsAuthCallback('/', '?error=access_denied'), 'error gates')
}

// ── destinations ─────────────────────────────────────────────
{
  assertEq(
    resolveAuthCallbackDestination({
      next: 'auto',
      isRecovery: false,
      hasSession: true,
      intent: 'recovery',
    }).path,
    '/reset-password',
    'recovery → reset-password',
  )
  assertEq(
    resolveAuthCallbackDestination({
      next: 'auto',
      isRecovery: false,
      hasSession: true,
      intent: 'signup',
    }).path,
    '/dashboard',
    'signup with session → dashboard',
  )
  assertEq(
    resolveAuthCallbackDestination({
      next: 'auto',
      isRecovery: false,
      hasSession: false,
      intent: 'signup',
    }).path,
    '/login',
    'signup without session → login',
  )
  assertEq(
    resolveAuthCallbackDestination({
      next: 'auto',
      isRecovery: false,
      hasSession: true,
      intent: 'magic-link',
    }).path,
    '/dashboard',
    'magic-link → dashboard',
  )
  assertEq(
    resolveAuthCallbackDestination({
      next: 'auto',
      isRecovery: false,
      hasSession: true,
      intent: 'invite',
    }).path,
    '/dashboard',
    'invite → dashboard',
  )
  assertEq(
    resolveAuthCallbackDestination({
      next: 'auto',
      isRecovery: false,
      hasSession: true,
      intent: 'email-change',
    }).path,
    '/login',
    'email-change → login',
  )
  assertEq(
    resolveAuthCallbackErrorAction('signup').to,
    '/register',
    'signup error CTA → register',
  )
  assertEq(
    resolveAuthCallbackErrorAction('recovery').label,
    'Wyślij nowy link',
    'recovery error label',
  )
}

// ── verifyOtp exact-once per intent (no PKCE verifier) ───────
for (const intent of INTENTS) {
  resetAuthCallbackExchangeCache()
  let verifyCalls = 0
  let exchangeCalls = 0
  let lastType: string | null = null
  let lastHash: string | null = null
  const verificationType = AUTH_TOKEN_HASH_FLOWS[intent].verificationType
  const tokenHash = `hash-${intent}`

  const deps = {
    exchangeCodeForSession: async () => {
      exchangeCalls += 1
      return noopExchange()
    },
    verifyOtp: async (args: { token_hash: string; type: EmailOtpType }) => {
      verifyCalls += 1
      lastType = args.type
      lastHash = args.token_hash
      return {
        data: { session: { access_token: 'sess' } as never },
        error: null,
      }
    },
    onAuthStateChange: noopListener,
  }

  const [a, b] = await Promise.all([
    verifyAuthTokenHashOnce({ tokenHash, verificationType, intent }, deps),
    verifyAuthTokenHashOnce({ tokenHash, verificationType, intent }, deps),
  ])
  assert(a.ok && b.ok, `${intent}: concurrent verify success`)
  assertEq(verifyCalls, 1, `${intent}: verifyOtp exactly once`)
  assertEq(exchangeCalls, 0, `${intent}: no exchangeCodeForSession`)
  assertEq(lastType, verificationType, `${intent}: correct verify type`)
  assertEq(lastHash, tokenHash, `${intent}: correct token_hash`)

  const c = await verifyAuthTokenHashOnce(
    { tokenHash, verificationType, intent },
    deps,
  )
  assert(c.ok, `${intent}: cache hit ok`)
  assertEq(verifyCalls, 1, `${intent}: still one verify after cache`)
}

{
  resetAuthCallbackExchangeCache()
  const result = await verifyAuthTokenHashOnce(
    {
      tokenHash: 'expired',
      verificationType: 'email',
      intent: 'signup',
    },
    {
      exchangeCodeForSession: noopExchange,
      verifyOtp: async () => ({
        data: { session: null },
        error: { message: 'Token has expired or is invalid' },
      }),
      onAuthStateChange: noopListener,
    },
  )
  assert(!result.ok, 'expired signup fails')
  if (!result.ok) {
    assertEq(result.message, 'Link wygasł lub został już użyty.', 'friendly expired')
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
}

// ── source wiring + security ─────────────────────────────────
{
  const router = readFileSync(join(ROOT, 'src/routes/router.tsx'), 'utf8')
  assert(router.includes('AuthCallbackGate'), 'router uses AuthCallbackGate')
  assert(router.includes('/auth/callback'), 'router has /auth/callback')

  const supabaseClient = readFileSync(join(ROOT, 'src/lib/supabase.ts'), 'utf8')
  assert(
    supabaseClient.includes('detectSessionInUrl: false'),
    'detectSessionInUrl disabled',
  )
  assert(supabaseClient.includes("flowType: 'pkce'"), 'PKCE preserved globally')

  const callbackSrc = readFileSync(
    join(ROOT, 'src/features/auth/callback/authCallback.ts'),
    'utf8',
  )
  assert(!callbackSrc.includes('__OURWED_AUTH_EXCHANGE__'), 'no TEMP diagnostics')
  assert(
    !/console\.(log|debug|info|warn)\([^)]*token_hash/.test(callbackSrc),
    'no token_hash console logging',
  )
  assert(callbackSrc.includes('verifyAuthTokenHashOnce'), 'canonical verify helper')

  const callbackPage = readFileSync(
    join(ROOT, 'src/pages/AuthCallbackPage.tsx'),
    'utf8',
  )
  assert(callbackPage.includes('verifyAuthTokenHashOnce'), 'page uses verifyAuthTokenHashOnce')
  assert(callbackPage.includes('resolveTokenHashFlow'), 'page resolves token-hash flow')
  assert(callbackPage.includes('exchangeAuthCodeOnce'), 'legacy code path retained')
  assert(
    callbackPage.includes("replaceState({}, '', '/auth/callback')"),
    'strips sensitive params',
  )
  assert(
    callbackPage.includes('navigate(phase.path, { replace: true') ||
      callbackPage.includes('<Navigate to={phase.path} replace'),
    'replace navigation',
  )
  assert(
    !/console\.(log|debug|info)\([^)]*token/.test(callbackPage),
    'page does not console-log tokens',
  )
  // User-facing JSX strings (not code comments)
  const jsxCopy = callbackPage
    .split('\n')
    .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
    .join('\n')
  assert(!jsxCopy.includes("'PKCE'") && !/"PKCE"/.test(jsxCopy), 'no PKCE in UI strings')
  assert(callbackSrc.includes('Potwierdź konto'), 'signup confirm copy in flow map')
  assert(callbackSrc.includes('Kontynuuj reset hasła'), 'recovery confirm copy in flow map')
  assert(callbackSrc.includes('Kontynuuj logowanie'), 'magic-link confirm copy')
  assert(callbackSrc.includes('Przyjmij zaproszenie'), 'invite confirm copy')
  assert(callbackSrc.includes('Potwierdź zmianę adresu'), 'email-change confirm copy')

  for (const intent of INTENTS) {
    const flow = AUTH_TOKEN_HASH_FLOWS[intent]
    const needle = authEmailActionHref(intent)
    // Map template id from intent
    const fileId =
      intent === 'signup'
        ? 'confirmation'
        : intent === 'magic-link'
          ? 'magic_link'
          : intent === 'email-change'
            ? 'email_change'
            : intent
    const html = readFileSync(
      join(ROOT, `supabase/templates/auth/${fileId}.html`),
      'utf8',
    )
    assert(html.includes(needle), `${fileId} CTA matches ${intent}`)
    assert(
      !html.includes('{{ .ConfirmationURL }}'),
      `${fileId} has no ConfirmationURL`,
    )
    assert(!/\blocalhost\b/i.test(html), `${fileId} no localhost`)
    assert(
      html.includes(flow.safeFallbackPath) ||
        html.includes(`https://ourwed.pl${flow.safeFallbackPath}`),
      `${fileId} safe fallback`,
    )
  }
}

console.log('PASS  auth callback')
