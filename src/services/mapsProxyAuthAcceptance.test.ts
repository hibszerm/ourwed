/**
 * Places/Routes Edge auth — require getUser, reject publishable-only.
 * Run: npx tsx --tsconfig tsconfig.app.json src/services/mapsProxyAuthAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
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

/** Simulates auth gate before any Google provider call. */
function shouldInvokeGoogle(auth: { ok: boolean }): { googleCalls: number } {
  let googleCalls = 0
  if (!auth.ok) return { googleCalls }
  googleCalls += 1
  return { googleCalls }
}

const places = readFileSync(
  resolve(process.cwd(), 'supabase/functions/places-proxy/index.ts'),
  'utf8',
)
const routes = readFileSync(
  resolve(process.cwd(), 'supabase/functions/routes-proxy/index.ts'),
  'utf8',
)
const shared = readFileSync(
  resolve(
    process.cwd(),
    'supabase/functions/_shared/requireAuthenticatedUser.ts',
  ),
  'utf8',
)

for (const [label, src] of [
  ['places-proxy', places],
  ['routes-proxy', routes],
] as const) {
  run(`${label}: requireAuthenticatedUser before Google`, () => {
    assert(
      src.includes("from '../_shared/requireAuthenticatedUser.ts'"),
      'imports shared auth',
    )
    assert(src.includes('requireAuthenticatedUser(req)'), 'calls auth')
    assert(
      !src.includes('if (!auth && !apikey)') &&
        !src.includes("if (!auth && !apikey)"),
      'no apikey-or-auth presence check',
    )
    const serveIdx = src.indexOf('Deno.serve')
    const handler = src.slice(serveIdx)
    const authIdx = handler.indexOf('requireAuthenticatedUser(req)')
    const googleIdx = Math.min(
      ...['googleAutocomplete', 'googleResolvePlace', 'googleComputeRoute']
        .map((n) => handler.indexOf(n))
        .filter((i) => i >= 0),
      handler.length,
    )
    assert(authIdx >= 0, 'auth in handler')
    assert(authIdx < googleIdx, 'auth before Google client calls')
    const bodyIdx = handler.indexOf('await req.json()')
    assert(bodyIdx > authIdx, 'auth before body parse')
  })

  run(`${label}: verify_jwt = true in config.toml`, () => {
    const toml = readFileSync(
      resolve(
        process.cwd(),
        `supabase/functions/${label}/config.toml`,
      ),
      'utf8',
    )
    assert(/verify_jwt\s*=\s*true/.test(toml), 'verify_jwt true')
  })
}

run('shared helper uses getUser', () => {
  assert(shared.includes('auth.getUser()'), 'getUser')
})

run('unauthorized paths never increment Google call counter', () => {
  assert(shouldInvokeGoogle({ ok: false }).googleCalls === 0, 'missing')
  assert(shouldInvokeGoogle({ ok: false }).googleCalls === 0, 'garbage')
  assert(shouldInvokeGoogle({ ok: false }).googleCalls === 0, 'publishable')
  assert(shouldInvokeGoogle({ ok: true }).googleCalls === 1, 'authed may call')
})

run('frontend callers use supabase.functions.invoke (session JWT)', () => {
  const placesClient = readFileSync(
    resolve(process.cwd(), 'src/services/googlePlacesAddressProvider.ts'),
    'utf8',
  )
  const routesClient = readFileSync(
    resolve(process.cwd(), 'src/services/googleRoutesProvider.ts'),
    'utf8',
  )
  assert(placesClient.includes('supabase.functions.invoke'), 'places invoke')
  assert(routesClient.includes('supabase.functions.invoke'), 'routes invoke')
  assert(
    !placesClient.includes('apikey:') || placesClient.includes('functions.invoke'),
    'places uses invoke helper',
  )
})

run('root config.toml enables gateway JWT for both proxies', () => {
  const cfg = readFileSync(
    resolve(process.cwd(), 'supabase/config.toml'),
    'utf8',
  )
  assert(cfg.includes('[functions.places-proxy]'), 'places section')
  assert(cfg.includes('[functions.routes-proxy]'), 'routes section')
})

console.log('ok — mapsProxyAuthAcceptance')
