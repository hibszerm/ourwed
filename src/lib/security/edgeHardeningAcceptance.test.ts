/**
 * Calendar redirect, token-key fail-closed, and restricted CORS acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/security/edgeHardeningAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildRestrictedCorsHeaders,
  resolveAllowedCorsOrigins,
} from '../../../supabase/functions/_shared/security/browserCors.ts'
import {
  LOCAL_DEV_CALENDAR_TOKEN_KEY,
  resolveCalendarTokenKeyMaterial,
} from '../../../supabase/functions/_shared/security/calendarTokenKey.ts'
import {
  resolveSafeAppRedirectPath,
  sanitizeAppRelativePath,
} from '../../../supabase/functions/_shared/security/safeAppRedirectPath.ts'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`ok — ${name}`)
  } catch (e) {
    console.error(`FAIL — ${name}`)
    throw e
  }
}

const APP = 'https://www.ourwed.pl'

run('OAuth valid relative redirect allowed', () => {
  assert(
    resolveSafeAppRedirectPath('/ustawienia/integracje', APP) ===
      '/ustawienia/integracje',
    'valid path',
  )
})

run('OAuth malicious redirects blocked', () => {
  const bad = [
    'https://evil.example/phish',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'data:text/html,hi',
    '@evil.example',
    '/%2F%2Fevil.example',
    '/ustawienia/../../evil',
    'http://www.ourwed.pl/ustawienia',
  ]
  for (const input of bad) {
    const out = resolveSafeAppRedirectPath(input, APP)
    assert(out === '/ustawienia/integracje', `blocked: ${input} → ${out}`)
  }
  assert(sanitizeAppRelativePath('@evil.example') === null, '@evil')
  assert(sanitizeAppRelativePath('//evil.example') === null, '//evil')
})

run('calendar crypto fail-closed in production without keys', () => {
  let threw = false
  try {
    resolveCalendarTokenKeyMaterial(() => null, {
      appPublicUrl: 'https://www.ourwed.pl',
    })
  } catch {
    threw = true
  }
  assert(threw, 'must throw')
})

run('calendar crypto never uses local-dev key in production', () => {
  const material = resolveCalendarTokenKeyMaterial(
    (name) =>
      name === 'GOOGLE_CALENDR_CLIENT_SECRET' ? 'google-secret-material' : null,
    { appPublicUrl: 'https://www.ourwed.pl' },
  )
  assert(
    material.encryptKey === 'google-secret-material',
    'legacy google allowed until dedicated key',
  )
  assert(
    !material.decryptKeys.includes(LOCAL_DEV_CALENDAR_TOKEN_KEY),
    'no local-dev in prod decrypt',
  )
})

run('dedicated key preferred; google kept as decrypt legacy', () => {
  const material = resolveCalendarTokenKeyMaterial(
    (name) => {
      if (name === 'CALENDAR_TOKEN_ENCRYPTION_KEY') return 'dedicated-key-32b!!!!!!!!!!!!'
      if (name === 'GOOGLE_CALENDR_CLIENT_SECRET') return 'google-secret-material'
      return null
    },
    { appPublicUrl: 'https://www.ourwed.pl' },
  )
  assert(material.encryptKey.startsWith('dedicated'), 'encrypt dedicated')
  assert(material.decryptKeys[0]!.startsWith('dedicated'), 'decrypt primary')
  assert(material.decryptKeys.includes('google-secret-material'), 'legacy decrypt')
  assert(material.usingLegacyGoogleSecretForEncrypt === false, 'no legacy encrypt')
})

run('local runtime may use local-dev placeholder explicitly', () => {
  const material = resolveCalendarTokenKeyMaterial(() => null, {
    appPublicUrl: 'http://localhost:5173',
  })
  assert(material.encryptKey === LOCAL_DEV_CALENDAR_TOKEN_KEY, 'local ok')
})

run('CORS allows www.ourwed.pl', () => {
  const env = (n: string) =>
    n === 'APP_PUBLIC_URL' ? 'https://www.ourwed.pl' : null
  const req = new Request('https://xyycwllsovpxlcustpcv.supabase.co/functions/v1/x', {
    headers: { Origin: 'https://www.ourwed.pl' },
  })
  const headers = buildRestrictedCorsHeaders(req, env, 'POST, OPTIONS')
  assert(headers['Access-Control-Allow-Origin'] === 'https://www.ourwed.pl', 'ACAO')
})

run('CORS rejects malicious origin', () => {
  const env = (n: string) =>
    n === 'APP_PUBLIC_URL' ? 'https://www.ourwed.pl' : null
  const req = new Request('https://example.supabase.co/functions/v1/x', {
    headers: { Origin: 'https://evil.example' },
  })
  const headers = buildRestrictedCorsHeaders(req, env, 'POST, OPTIONS')
  assert(!('Access-Control-Allow-Origin' in headers), 'no ACAO')
})

run('CORS no-origin does not emit wildcard', () => {
  const env = (n: string) =>
    n === 'APP_PUBLIC_URL' ? 'https://www.ourwed.pl' : null
  const req = new Request('https://example.supabase.co/functions/v1/x')
  const headers = buildRestrictedCorsHeaders(req, env, 'POST, OPTIONS')
  assert(headers['Access-Control-Allow-Origin'] !== '*', 'not star')
  assert(!('Access-Control-Allow-Origin' in headers), 'omit ACAO')
})

run('CORS OPTIONS methods preserved', () => {
  const env = (n: string) =>
    n === 'APP_PUBLIC_URL' ? 'https://www.ourwed.pl' : null
  const req = new Request('https://example.supabase.co/functions/v1/x', {
    method: 'OPTIONS',
    headers: { Origin: 'https://www.ourwed.pl' },
  })
  const headers = buildRestrictedCorsHeaders(req, env, 'POST, OPTIONS')
  assert(headers['Access-Control-Allow-Methods']?.includes('OPTIONS'), 'options')
})

run('allowed origins include production app', () => {
  const origins = resolveAllowedCorsOrigins((n) =>
    n === 'APP_PUBLIC_URL' ? 'https://www.ourwed.pl' : null,
  )
  assert(origins.includes('https://www.ourwed.pl'), 'prod origin')
})

run('edge sources no longer use wildcard ACAO on hardened functions', () => {
  const files = [
    'supabase/functions/google-calendar-oauth/index.ts',
    'supabase/functions/google-calendar-sync/index.ts',
    'supabase/functions/delete-account/index.ts',
    'supabase/functions/places-proxy/index.ts',
    'supabase/functions/routes-proxy/index.ts',
    'supabase/functions/ai-contract-full-rewrite/index.ts',
  ]
  for (const rel of files) {
    const src = readFileSync(resolve(process.cwd(), rel), 'utf8')
    assert(
      !src.includes("'Access-Control-Allow-Origin': '*'"),
      `${rel} still wildcard`,
    )
    assert(src.includes('buildRestrictedCorsHeaders'), `${rel} helper`)
  }
})

run('oauth uses safe redirect helper', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'supabase/functions/google-calendar-oauth/index.ts'),
    'utf8',
  )
  assert(src.includes('resolveSafeAppRedirectPath'), 'redirect helper')
  assert(src.includes('resolveCalendarEncryptKey'), 'encrypt key helper')
  assert(!src.includes("'local-dev-only-calendar-token-key'"), 'no inline local key')
})

console.log('ok — edgeHardeningAcceptance')
