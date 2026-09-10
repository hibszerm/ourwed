/**
 * Post-login redirect + remember-me honesty + ProtectedRoute from capture.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/auth/postLoginRedirectAcceptance.test.ts
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_POST_LOGIN_PATH,
  captureProtectedFrom,
  resolvePostLoginPath,
} from '@/features/auth/postLoginRedirect'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  post-login — ${msg}`)
}

function assertEq(a: unknown, b: unknown, msg: string) {
  assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`)
}

{
  assertEq(resolvePostLoginPath(undefined), DEFAULT_POST_LOGIN_PATH, '1. direct login → dashboard')
  assertEq(resolvePostLoginPath(null), DEFAULT_POST_LOGIN_PATH, '1b. null → dashboard')
  assertEq(resolvePostLoginPath(''), DEFAULT_POST_LOGIN_PATH, '1c. empty → dashboard')
  console.log('PASS  1. direct login defaults to /dashboard')
}

{
  assertEq(
    resolvePostLoginPath('/sluby/abc-123'),
    '/sluby/abc-123',
    '2. protected wedding path',
  )
  assertEq(
    resolvePostLoginPath({ pathname: '/sesje/xyz', search: '' }),
    '/sesje/xyz',
    '2b. object pathname',
  )
  console.log('PASS  2. protected internal route restored')
}

{
  assertEq(
    resolvePostLoginPath('/ankiety/dane-do-umowy?generate=1'),
    '/ankiety/dane-do-umowy?generate=1',
    '3. query in string',
  )
  assertEq(
    resolvePostLoginPath({
      pathname: '/ankiety/dane-do-umowy',
      search: '?generate=1',
    }),
    '/ankiety/dane-do-umowy?generate=1',
    '3b. query in object',
  )
  assertEq(
    resolvePostLoginPath({
      pathname: '/ankiety/dane-do-umowy',
      search: 'generate=1',
    }),
    '/ankiety/dane-do-umowy?generate=1',
    '3c. search without ? normalized',
  )
  console.log('PASS  3. query string survives')
}

{
  assertEq(resolvePostLoginPath('https://evil.example/phish'), DEFAULT_POST_LOGIN_PATH, '4a')
  assertEq(resolvePostLoginPath('//evil.example/phish'), DEFAULT_POST_LOGIN_PATH, '4b')
  assertEq(resolvePostLoginPath('javascript:alert(1)'), DEFAULT_POST_LOGIN_PATH, '4c')
  assertEq(resolvePostLoginPath('sluby/no-leading-slash'), DEFAULT_POST_LOGIN_PATH, '4d')
  console.log('PASS  4. external / open redirects rejected')
}

{
  assertEq(resolvePostLoginPath('/login'), DEFAULT_POST_LOGIN_PATH, '5a')
  assertEq(resolvePostLoginPath('/login?x=1'), DEFAULT_POST_LOGIN_PATH, '5b')
  assertEq(resolvePostLoginPath('/register'), DEFAULT_POST_LOGIN_PATH, '5c')
  assertEq(resolvePostLoginPath('/'), DEFAULT_POST_LOGIN_PATH, '5d')
  assertEq(
    captureProtectedFrom('/sluby/1', '?tab=finanse'),
    '/sluby/1?tab=finanse',
    '5e. capture helper',
  )
  console.log('PASS  5. auth surfaces blocked (no redirect loop)')
}

{
  const loginForm = read('src/features/auth/components/LoginForm.tsx')
  assert(!loginForm.includes('Zapamiętaj mnie'), '6. remember-me label removed')
  assert(!loginForm.includes('rememberMe'), '6b. rememberMe field removed from form')
  assert(!loginForm.includes('login-remember-me'), '6c. checkbox id gone')
  assert(loginForm.includes('resolvePostLoginPath'), '6d. uses safe redirect helper')
  assert(loginForm.includes('blurActiveElement'), '6e. iOS blur preserved')

  const protectedRoute = read('src/features/auth/ProtectedRoute.tsx')
  assert(
    protectedRoute.includes('captureProtectedFrom'),
    '6f. ProtectedRoute captures from with search',
  )
  assert(
    protectedRoute.includes('location.search'),
    '6g. search included in capture',
  )

  const loginPage = read('src/pages/LoginPage.tsx')
  assert(loginPage.includes('resolvePostLoginPath'), '6h. already-auth uses helper')
  console.log('PASS  6. remember-me UI removed; wiring present')
}

console.log('\nAll post-login redirect acceptance checks passed.')
