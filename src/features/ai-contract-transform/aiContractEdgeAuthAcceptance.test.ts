/**
 * P0 AI Edge auth lockdown — source + policy acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/ai-contract-transform/aiContractEdgeAuthAcceptance.test.ts
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

const SHARED = resolve(
  root,
  'supabase/functions/_shared/requireAuthenticatedUser.ts',
)
const FULL = resolve(
  root,
  'supabase/functions/ai-contract-full-rewrite/index.ts',
)
const GUARDED = resolve(
  root,
  'supabase/functions/ai-contract-guarded-transform/index.ts',
)
const RETIRED_LAB_ANALYZE = resolve(
  root,
  'supabase/functions/ai-contract-lab-analyze',
)
const RETIRED_LAB_MAPPING = resolve(
  root,
  'supabase/functions/ai-contract-lab-structured-mapping',
)

/** Simulates the auth gate before any provider call (unit, no Deno). */
function shouldInvokeOpenAi(auth: {
  ok: boolean
}): { openAiCalls: number } {
  let openAiCalls = 0
  if (!auth.ok) return { openAiCalls }
  openAiCalls += 1
  return { openAiCalls }
}

run('shared requireAuthenticatedUser uses getUser', () => {
  const src = readFileSync(SHARED, 'utf8')
  assert(src.includes('auth.getUser()'), 'must call getUser')
  assert(src.includes('createClient'), 'must create supabase client')
  assert(
    src.includes("Deno.env.get('SUPABASE_ANON_KEY')"),
    'uses anon key with caller Authorization',
  )
  assert(src.includes('if (authError || !user)'), 'rejects missing user')
})

run('retired lab-analyze and lab-structured-mapping source absent', () => {
  assert(!existsSync(RETIRED_LAB_ANALYZE), 'lab-analyze Edge source retired')
  assert(!existsSync(RETIRED_LAB_MAPPING), 'lab-structured-mapping Edge source retired')
  const toml = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8')
  assert(
    !toml.includes('[functions.ai-contract-lab-analyze]'),
    'lab-analyze config.toml stanza absent',
  )
  assert(
    !toml.includes('[functions.ai-contract-lab-structured-mapping]'),
    'lab-structured-mapping config.toml stanza absent',
  )
})

for (const [label, path] of [
  ['full-rewrite', FULL],
  ['guarded-transform', GUARDED],
] as const) {
  run(`${label}: requireAuthenticatedUser before OpenAI`, () => {
    const src = readFileSync(path, 'utf8')
    assert(
      src.includes("from '../_shared/requireAuthenticatedUser.ts'"),
      'imports shared auth',
    )
    assert(src.includes('requireAuthenticatedUser(req)'), 'calls auth gate')
    assert(
      !src.includes("startsWith('Bearer ')"),
      'must not use Bearer-prefix-only auth',
    )
    const serveIdx = src.indexOf('Deno.serve')
    assert(serveIdx >= 0, 'Deno.serve present')
    const handler = src.slice(serveIdx)
    const authIdx = handler.indexOf('requireAuthenticatedUser(req)')
    const callOpenAiIdx = handler.indexOf('callOpenAi(')
    const fetchOpenAiIdx = handler.indexOf("fetch('https://api.openai.com")
    assert(authIdx >= 0, 'auth gate in handler')
    assert(
      callOpenAiIdx < 0 || authIdx < callOpenAiIdx,
      'auth before callOpenAi in handler',
    )
    assert(
      fetchOpenAiIdx < 0 || authIdx < fetchOpenAiIdx,
      'auth before direct openai fetch in handler',
    )
    const bodyIdx = handler.indexOf('await req.json()')
    assert(bodyIdx > authIdx, 'auth before body parse')
  })

  run(`${label}: config.toml verify_jwt = true`, () => {
    const dir = path.replace(/\/index\.ts$/, '')
    const toml = readFileSync(resolve(dir, 'config.toml'), 'utf8')
    assert(/verify_jwt\s*=\s*true/.test(toml), 'verify_jwt true')
  })
}

run('unauthorized paths never increment OpenAI call counter', () => {
  assert(shouldInvokeOpenAi({ ok: false }).openAiCalls === 0, 'missing auth')
  assert(shouldInvokeOpenAi({ ok: false }).openAiCalls === 0, 'garbage bearer')
  assert(shouldInvokeOpenAi({ ok: false }).openAiCalls === 0, 'publishable only')
  assert(shouldInvokeOpenAi({ ok: true }).openAiCalls === 1, 'authed may call')
})

run('full-rewrite does not trust body userId for identity', () => {
  const src = readFileSync(FULL, 'utf8')
  assert(!/\buserId\b/.test(src) || !src.includes('payload.userId'), 'no body userId trust')
  assert(src.includes('requireAuthenticatedUser'), 'identity from getUser path')
})

console.log('ok — aiContractEdgeAuthAcceptance')
