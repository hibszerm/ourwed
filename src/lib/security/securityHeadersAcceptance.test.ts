/**
 * Security headers / CSP shape for Vercel + JSON-LD externalization.
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/security/securityHeadersAcceptance.test.ts
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

const root = process.cwd()
const vercel = JSON.parse(
  readFileSync(resolve(root, 'vercel.json'), 'utf8'),
) as {
  rewrites?: unknown[]
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
}
const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8')

run('SPA rewrite preserved', () => {
  assert(Array.isArray(vercel.rewrites) && vercel.rewrites.length >= 1, 'rewrites')
})

run('required security headers present', () => {
  const headers = vercel.headers?.[0]?.headers ?? []
  const map = Object.fromEntries(headers.map((h) => [h.key, h.value]))
  assert(!!map['Content-Security-Policy'], 'CSP')
  assert(map['X-Content-Type-Options'] === 'nosniff', 'nosniff')
  assert(map['X-Frame-Options'] === 'DENY', 'frame deny')
  assert(
    map['Referrer-Policy'] === 'strict-origin-when-cross-origin',
    'referrer',
  )
  assert(
    map['Permissions-Policy'] ===
      'camera=(), microphone=(), geolocation=()',
    'permissions',
  )
})

run('CSP forbids unsafe script and wildcards', () => {
  const csp =
    vercel.headers?.[0]?.headers.find((h) => h.key === 'Content-Security-Policy')
      ?.value ?? ''
  assert(!csp.includes("script-src 'unsafe-inline'"), 'no script unsafe-inline')
  assert(!csp.includes("script-src 'unsafe-eval'"), 'no unsafe-eval')
  assert(!csp.includes('unsafe-eval'), 'no unsafe-eval anywhere')
  assert(!csp.includes('default-src *'), 'no default *')
  assert(!csp.includes('connect-src *'), 'no connect *')
  assert(!csp.includes('img-src *'), 'no img *')
  assert(!csp.includes('*.supabase.co'), 'no supabase wildcard')
  assert(!csp.includes('places.googleapis.com'), 'no places API')
  assert(!csp.includes('routes.googleapis.com'), 'no routes API')
  assert(csp.includes("script-src 'self' https://maps.googleapis.com"), 'script')
  assert(csp.includes("style-src 'self' 'unsafe-inline'"), 'style')
  assert(
    csp.includes('https://xyycwllsovpxlcustpcv.supabase.co'),
    'supabase host',
  )
  assert(
    csp.includes('wss://xyycwllsovpxlcustpcv.supabase.co'),
    'supabase wss',
  )
})

run('JSON-LD is external same-origin asset', () => {
  assert(
    indexHtml.includes('src="/ld-json/ourwed-software-application.json"'),
    'src',
  )
  assert(
    !/<script\s+type="application\/ld\+json"\s*>/.test(indexHtml),
    'not inline',
  )
  assert(
    existsSync(
      resolve(root, 'public/ld-json/ourwed-software-application.json'),
    ),
    'file exists',
  )
})

console.log('ok — securityHeadersAcceptance')
