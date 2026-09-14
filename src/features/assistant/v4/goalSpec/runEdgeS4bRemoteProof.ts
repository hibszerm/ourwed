/**
 * Edge-only S4B raw remote proof. Never prints tokens/keys.
 *
 * OURWED_ACCESS_TOKEN + .env.local (URL/anon) required.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

function envFromLocal(name: string): string {
  const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of text.split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    if (k === name) return line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return ''
}

const url = envFromLocal('VITE_SUPABASE_URL')
const anon = envFromLocal('VITE_SUPABASE_ANON_KEY')
const token = process.env.OURWED_ACCESS_TOKEN?.trim() ?? ''

if (!url || !anon) {
  console.log('BLOCKED: missing supabase url/anon presence')
  process.exit(2)
}
if (!token) {
  console.log('BLOCKED: missing OURWED_ACCESS_TOKEN presence')
  process.exit(2)
}

type SmokeCase = {
  id: string
  mode: 'v5_goal_interpret' | 'v4_interpret' | ''
  utterance: string
  semanticContextSummary: unknown
  auth: boolean
}

const CTX_AUG = {
  hasActiveCollection: true,
  previousGoalSummary: {
    temporalExpression: 'sierpień',
    aggregation: 'count',
    source: 'wedding',
  },
}

const CTX_PAID = {
  hasActiveCollection: true,
  previousGoalSummary: {
    temporalExpression: 'sierpień',
    aggregation: 'sum',
    measure: 'wedding.paid_amount',
    source: 'wedding',
  },
}

async function call(c: SmokeCase) {
  const headers: Record<string, string> = {
    apikey: anon,
    'Content-Type': 'application/json',
  }
  if (c.auth) headers.Authorization = `Bearer ${token}`
  const body: Record<string, unknown> = {
    utterance: c.utterance,
    locale: 'pl-PL',
  }
  if (c.mode) body.mode = c.mode
  if (c.semanticContextSummary !== undefined) {
    body.semanticContextSummary = c.semanticContextSummary
  }
  const started = Date.now()
  const res = await fetch(`${url}/functions/v1/ai-assistant`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  return { http: res.status, latencyMs: Date.now() - started, json }
}

function rawGoalFields(json: unknown) {
  if (!json || typeof json !== 'object') return null
  const row = json as Record<string, unknown>
  const gs = (row.goalSpec ?? row) as Record<string, unknown>
  if (!gs || typeof gs !== 'object') return null
  const amb: string[] = []
  for (const k of ['ambiguitySlot0', 'ambiguitySlot1']) {
    const v = gs[k]
    if (typeof v === 'string' && v) amb.push(v)
  }
  // nested GoalSpec shape
  if (Array.isArray(gs.ambiguities)) {
    for (const a of gs.ambiguities as Array<{ slot?: string }>) {
      if (a?.slot) amb.push(a.slot)
    }
  }
  return {
    status: row.status ?? null,
    requestKind: gs.requestKind ?? null,
    aggregation: gs.aggregation ?? null,
    measure: gs.measure ?? null,
    dialogue: gs.dialogue ?? null,
    temporalExpression: gs.temporalExpression ?? gs.temporal ?? null,
    placeName: gs.placeName ?? null,
    ambiguitySlots: amb,
    model: (row.diagnostics as { model?: string } | undefined)?.model ?? null,
    code: row.code ?? null,
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const results: Record<string, unknown> = {
    tokenPresent: true,
    cases: {},
  }

  // AUTH: unauthenticated must fail
  {
    const r = await call({
      id: 'auth',
      mode: 'v5_goal_interpret',
      utterance: 'test',
      semanticContextSummary: null,
      auth: false,
    })
    const auth = {
      http: r.http,
      rejected: r.http === 401 || r.http === 403,
    }
    results.auth = auth
    console.log('AUTH unauthenticated http=', r.http, 'rejected=', auth.rejected)
  }

  const cases: SmokeCase[] = [
    {
      id: 'A_incomplete',
      mode: 'v5_goal_interpret',
      utterance: 'Ile to będzie?',
      semanticContextSummary: CTX_AUG,
      auth: true,
    },
    {
      id: 'B_resolved',
      mode: 'v5_goal_interpret',
      utterance: 'Ile już wpłynęło z wesel w sierpniu?',
      semanticContextSummary: null,
      auth: true,
    },
    {
      id: 'C_unsupported',
      mode: 'v5_goal_interpret',
      utterance: 'Jaka jest stawka VAT na usługi fotograficzne w UE?',
      semanticContextSummary: null,
      auth: true,
    },
    {
      id: 'D_prepare',
      mode: 'v5_goal_interpret',
      utterance: 'Przygotuj draft wiadomości do pary o zaliczce.',
      semanticContextSummary: null,
      auth: true,
    },
    {
      id: 'E_temporal',
      mode: 'v5_goal_interpret',
      utterance: 'a w przyszłym roku?',
      semanticContextSummary: CTX_PAID,
      auth: true,
    },
    {
      id: 'V3',
      mode: '',
      utterance: 'Ile mam wesel w tym roku?',
      semanticContextSummary: null,
      auth: true,
    },
    {
      id: 'V4',
      mode: 'v4_interpret',
      utterance: 'Ile mam wesel w tym roku?',
      semanticContextSummary: null,
      auth: true,
    },
  ]

  let schemaOk = 0
  let schemaN = 0
  let providerErr = 0

  for (const c of cases) {
    await sleep(300)
    const r = await call(c)
    if (c.mode === 'v5_goal_interpret') {
      schemaN += 1
      const fields = rawGoalFields(r.json)
      const status = (r.json as { status?: string } | null)?.status
      if (status === 'error') {
        const code = (r.json as { code?: string }).code
        if (code === 'provider_error') providerErr += 1
        else schemaOk += 0 // count as schema/other fail
        ;(results.cases as Record<string, unknown>)[c.id] = {
          http: r.http,
          latencyMs: r.latencyMs,
          error: true,
          code,
          fields,
        }
        console.log(c.id, 'ERROR', code, 'http', r.http)
        continue
      }
      if (status === 'goal_spec' && fields?.requestKind) schemaOk += 1
      ;(results.cases as Record<string, unknown>)[c.id] = {
        http: r.http,
        latencyMs: r.latencyMs,
        fields,
      }
      console.log(
        c.id,
        JSON.stringify({
          http: r.http,
          requestKind: fields?.requestKind,
          aggregation: fields?.aggregation,
          measure: fields?.measure,
          amb: fields?.ambiguitySlots,
          dialogue: fields?.dialogue,
          temporal: fields?.temporalExpression,
          model: fields?.model,
        }),
      )
    } else if (c.id === 'V3') {
      const row = r.json as Record<string, unknown> | null
      ;(results.cases as Record<string, unknown>)[c.id] = {
        http: r.http,
        latencyMs: r.latencyMs,
        status: row?.status ?? null,
        hasKind: typeof row?.kind === 'string' || typeof row?.domainKind === 'string',
        keys: row ? Object.keys(row).slice(0, 12) : [],
      }
      console.log(
        'V3',
        JSON.stringify({
          http: r.http,
          status: row?.status ?? null,
          domainKind: row?.domainKind ?? null,
          kind: row?.kind ?? null,
        }),
      )
    } else if (c.id === 'V4') {
      const row = r.json as Record<string, unknown> | null
      const ts = row?.taskSpec
      ;(results.cases as Record<string, unknown>)[c.id] = {
        http: r.http,
        latencyMs: r.latencyMs,
        status: row?.status ?? null,
        hasTaskSpec: !!ts,
        taskSpecKeys:
          ts && typeof ts === 'object' ? Object.keys(ts as object).slice(0, 12) : [],
      }
      console.log(
        'V4',
        JSON.stringify({
          http: r.http,
          status: row?.status ?? null,
          hasTaskSpec: !!ts,
        }),
      )
    }
  }

  results.schemaSuccessRate = schemaN ? schemaOk / schemaN : 0
  results.schemaOk = schemaOk
  results.schemaN = schemaN
  results.providerErr = providerErr

  // gates
  const A = (results.cases as Record<string, { fields?: Record<string, unknown> }>).A_incomplete
    ?.fields
  const B = (results.cases as Record<string, { fields?: Record<string, unknown> }>).B_resolved
    ?.fields
  const C = (results.cases as Record<string, { fields?: Record<string, unknown> }>).C_unsupported
    ?.fields
  const D = (results.cases as Record<string, { fields?: Record<string, unknown> }>).D_prepare
    ?.fields
  const E = (results.cases as Record<string, { fields?: Record<string, unknown> }>).E_temporal
    ?.fields

  const aOk =
    A?.requestKind === 'domain_query' &&
    A?.aggregation === 'sum' &&
    A?.measure == null &&
    Array.isArray(A?.ambiguitySlots) &&
    (A.ambiguitySlots as string[]).includes('measure')
  const bOk =
    B?.requestKind === 'domain_query' && B?.measure === 'wedding.paid_amount'
  const cOk = C?.requestKind != null && C.requestKind !== 'domain_query'
  const dOk = D?.requestKind === 'prepare_action'
  const eOk = E?.requestKind === 'domain_query'
  const noGuess = A?.measure == null
  const noFalsePromo = cOk && dOk

  results.gates = {
    aOk,
    bOk,
    cOk,
    dOk,
    eOk,
    noGuess,
    noFalsePromo,
    schema100: schemaOk === schemaN && schemaN > 0,
    provider0: providerErr === 0,
    authRejected: (results.auth as { rejected?: boolean })?.rejected === true,
  }

  const passed = Object.values(results.gates as Record<string, boolean>).every(Boolean)
  results.verdict = passed ? 'EDGE_S4B_RELEASE_PASSED' : 'EDGE_S4B_RELEASE_FAILED'

  const outDir = resolve(
    process.cwd(),
    'src/features/assistant/v4/benchmark/artifacts',
  )
  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    resolve(outDir, 'phase-edge-s4b-remote-proof.json'),
    JSON.stringify(results, null, 2),
  )
  console.log('VERDICT', results.verdict)
  console.log('GATES', JSON.stringify(results.gates))
}

main().catch((e) => {
  console.error('fatal', e instanceof Error ? e.message : 'error')
  process.exit(1)
})
