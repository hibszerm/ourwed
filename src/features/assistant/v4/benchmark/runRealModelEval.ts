/**
 * Real-model V4 TaskSpec eval harness (read-only interpretation).
 *
 * Usage:
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v4/benchmark/runRealModelEval.ts
 *
 * Auth:
 *   OURWED_PO_EMAIL + OURWED_PO_PASSWORD
 *   or existing session via SUPABASE access (anon + password grant)
 *
 * No CRM mutations. No V4 execution.
 */

import { createClient } from '@supabase/supabase-js'
import { matchTaskSpecExpectation } from '../expect'
import { parseFlatTaskSpecPayload } from '../taskSpecSchema'
import {
  ASSISTANT_V4_BENCHMARK_CORPUS,
  type AssistantBenchmarkCase,
} from './corpus'
import { UNSEEN_PARAPHRASE_CASES } from './fixtures'
import {
  aggregateCaseScores,
  formatMetrics,
  type CaseScore,
} from './metrics'

function env(name: string): string | undefined {
  const v = process.env[name]?.trim()
  return v || undefined
}

async function main() {
  const url = env('VITE_SUPABASE_URL') ?? env('SUPABASE_URL')
  const anon =
    env('VITE_SUPABASE_ANON_KEY') ??
    env('SUPABASE_ANON_KEY') ??
    env('VITE_SUPABASE_PUBLISHABLE_KEY')
  const email = env('OURWED_PO_EMAIL') ?? env('ASSISTANT_EVAL_EMAIL')
  const password = env('OURWED_PO_PASSWORD') ?? env('ASSISTANT_EVAL_PASSWORD')
  const accessTokenEnv = env('OURWED_ACCESS_TOKEN')

  if (!url || !anon) {
    console.error('Missing Supabase URL/anon key')
    process.exit(1)
  }

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let accessToken = accessTokenEnv
  if (!accessToken) {
    if (!email || !password) {
      console.error(
        'Missing OURWED_ACCESS_TOKEN or OURWED_PO_EMAIL / OURWED_PO_PASSWORD',
      )
      process.exit(1)
    }
    const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (authErr || !auth.session) {
      console.error('Auth failed', authErr?.message)
      process.exit(1)
    }
    accessToken = auth.session.access_token
  }

  async function interpret(
    utterance: string,
    semanticContextSummary: unknown,
  ): Promise<{
    ok: boolean
    taskSpec: ReturnType<typeof parseFlatTaskSpecPayload>
    latencyMs: number
    error?: string
  }> {
    const started = Date.now()
    const res = await fetch(`${url}/functions/v1/ai-assistant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anon!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'v4_interpret',
        utterance,
        locale: 'pl-PL',
        semanticContextSummary,
      }),
    })
    const latencyMs = Date.now() - started
    const body = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    if (!body || body.status !== 'task_spec') {
      return {
        ok: false,
        taskSpec: null,
        latencyMs,
        error:
          typeof body?.code === 'string'
            ? body.code
            : `http_${res.status}`,
      }
    }
    const taskSpec = parseFlatTaskSpecPayload(body.taskSpec)
    if (!taskSpec) {
      return {
        ok: false,
        taskSpec: null,
        latencyMs,
        error: 'schema_validation_failed',
      }
    }
    return { ok: true, taskSpec, latencyMs }
  }

  const limitBench = Number(env('V4_EVAL_BENCH_LIMIT') ?? '100')
  const benchCases: AssistantBenchmarkCase[] = [
    ...ASSISTANT_V4_BENCHMARK_CORPUS.filter((c) =>
      c.tags?.includes('phase25'),
    ),
    ...ASSISTANT_V4_BENCHMARK_CORPUS.filter((c) =>
      c.tags?.includes('golden'),
    ),
    ...ASSISTANT_V4_BENCHMARK_CORPUS.filter((c) =>
      c.tags?.includes('override-matrix'),
    ),
    ...ASSISTANT_V4_BENCHMARK_CORPUS.filter((c) =>
      c.tags?.includes('ellipsis-matrix'),
    ),
    ...ASSISTANT_V4_BENCHMARK_CORPUS.filter((c) =>
      c.tags?.includes('correction-matrix'),
    ),
    ...ASSISTANT_V4_BENCHMARK_CORPUS.filter((c) =>
      c.tags?.includes('temporal-matrix'),
    ),
    ...ASSISTANT_V4_BENCHMARK_CORPUS.filter((c) =>
      c.tags?.includes('multi-turn'),
    ),
  ]
  const unique = new Map<string, AssistantBenchmarkCase>()
  for (const c of benchCases) unique.set(c.id, c)
  const selected = [...unique.values()].slice(0, Math.max(100, limitBench))

  const scores: CaseScore[] = []
  const failures: string[] = []

  console.log(`Running benchmark interpretations: ${selected.length}`)
  for (const c of selected) {
    const r = await interpret(c.input.userText, c.input.semanticContext ?? null)
    const match = r.taskSpec
      ? matchTaskSpecExpectation(r.taskSpec, c.expected.taskSpec)
      : null
    const expectedCorrection =
      c.expected.taskSpec.requireCorrection === true ||
      c.expected.taskSpec.op === 'correction'
    const actualCorrection = r.taskSpec?.op === 'correction'
    const score: CaseScore = {
      id: c.id,
      category: c.category,
      ok: Boolean(match?.ok),
      latencyMs: r.latencyMs,
      schemaOk: Boolean(r.taskSpec),
      match,
      error: r.error,
      expectedCorrection,
      actualCorrection: Boolean(actualCorrection),
    }
    scores.push(score)
    if (!score.ok) {
      failures.push(
        `${c.id} | ${c.input.userText} | ${JSON.stringify(match?.diffs ?? r.error)} | actual=${JSON.stringify({ op: r.taskSpec?.op, subject: r.taskSpec?.subject, patch: r.taskSpec?.correction?.patch, participant: r.taskSpec?.participant, temporal: r.taskSpec?.temporal })}`,
      )
    }
    await new Promise((x) => setTimeout(x, 120))
  }

  console.log(`Running unseen paraphrases: ${UNSEEN_PARAPHRASE_CASES.length}`)
  const unseenResults: Array<{ id: string; pass: boolean; brief: string }> = []
  for (const u of UNSEEN_PARAPHRASE_CASES) {
    const r = await interpret(u.userText, u.semanticContext ?? null)
    const ops = Array.isArray(u.expectOp) ? u.expectOp : [u.expectOp]
    const opOk = Boolean(r.taskSpec && ops.includes(r.taskSpec.op))
    let subjectOk = true
    if (u.expectSubject !== undefined && r.taskSpec) {
      const subs = Array.isArray(u.expectSubject)
        ? u.expectSubject
        : [u.expectSubject]
      subjectOk =
        u.expectSubject === null
          ? r.taskSpec.subject == null
          : subs.includes(r.taskSpec.subject)
    }
    const pass = r.ok && opOk && subjectOk
    unseenResults.push({
      id: u.id,
      pass,
      brief: r.taskSpec
        ? `${r.taskSpec.op}/${r.taskSpec.subject ?? 'null'}`
        : r.error ?? 'fail',
    })
    scores.push({
      id: `unseen-${u.id}`,
      category: 'typos_casual',
      ok: pass,
      latencyMs: r.latencyMs,
      schemaOk: Boolean(r.taskSpec),
      match: null,
      error: r.error,
    })
    await new Promise((x) => setTimeout(x, 120))
  }

  const metrics = aggregateCaseScores(scores)
  console.log('\n=== METRICS ===')
  console.log(formatMetrics(metrics))
  console.log(`\nFailures (${failures.length}):`)
  for (const f of failures.slice(0, 50)) console.log(`- ${f}`)
  console.log(`\nUnseen:`)
  for (const u of unseenResults) {
    console.log(`- ${u.id} ${u.pass ? 'PASS' : 'FAIL'} ${u.brief}`)
  }

  await supabase.auth.signOut().catch(() => undefined)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
