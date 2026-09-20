/**
 * CG2.1 — paid validation via deployed production Edge (OpenAI key stays in Edge).
 *
 * Opt-in:
 *   CG21_PAID_EVAL=1 CG21_SUPABASE_ACCESS_TOKEN=… npm run test:cg21-edge-paid-eval
 *
 * Loads public VITE_SUPABASE_* from env / .vercel/.env.production.local if present.
 * Never prints tokens.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PAID_CASE_IDS,
  runCg2PaidSuite,
  type Cg2CaseResult,
} from './runPaidFullAiSuite'
import {
  cg21AuthStatus,
  createDeployedEdgeFullRewriteInvoke,
  createEdgeUsageTracker,
  hasCg21EdgeAuth,
} from './deployedEdgeInvoke'
import { createUsageTracker } from './localFullRewriteInvoke'

function loadPublicEnvFromVercelPull() {
  const p = resolve(process.cwd(), '.vercel/.env.production.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i)
    let v = line.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (
      (k === 'VITE_SUPABASE_URL' || k === 'VITE_SUPABASE_ANON_KEY') &&
      !process.env[k]
    ) {
      process.env[k] = v
    }
  }
}

async function main() {
  loadPublicEnvFromVercelPull()

  const paid = process.env.CG21_PAID_EVAL === '1'
  const auth = cg21AuthStatus()

  console.log(
    JSON.stringify({
      phase: 'CG21',
      EDGE_COMPUTE_ONLY_SAFE: true,
      SOURCE_DEFAULT_MODEL: 'gpt-4.1-mini',
      transport: 'deployed_edge',
      auth,
      plannedCases: PAID_CASE_IDS.length,
      canary: 'T01_EXTRAS',
    }),
  )

  if (!paid) {
    console.log(
      JSON.stringify({
        status: 'SKIPPED',
        reason: 'CG21_PAID_EVAL not set to 1',
        command:
          'CG21_PAID_EVAL=1 CG21_SUPABASE_ACCESS_TOKEN=… npm run test:cg21-edge-paid-eval',
      }),
    )
    process.exit(0)
  }

  if (!hasCg21EdgeAuth()) {
    console.log('CG21_BLOCKED_SAFE_EDGE_AUTH_REQUIRED')
    console.log(
      JSON.stringify({
        status: 'BLOCKED',
        reason:
          'No disposable QA JWT available; inject CG21_SUPABASE_ACCESS_TOKEN (real user access token). Do not use service_role. Do not extract OpenAI secrets.',
        how: [
          'Sign in to www.ourwed.pl (or a disposable QA account) in a private browser.',
          'Copy only the session access_token into the agent/shell env as CG21_SUPABASE_ACCESS_TOKEN.',
          'Do not paste the token into chat. Do not commit it.',
          'Then re-run: CG21_PAID_EVAL=1 npm run test:cg21-edge-paid-eval',
        ],
        note: 'ai-contract-full-rewrite is pure compute (no CRM/Storage writes) but requires requireAuthenticatedUser JWT.',
      }),
    )
    process.exitCode = 2
    return
  }

  if (!auth.supabaseUrlConfigured || !auth.anonKeyConfigured) {
    console.log('CG21_BLOCKED_SAFE_EDGE_AUTH_REQUIRED')
    console.log(
      JSON.stringify({
        status: 'BLOCKED',
        reason: 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not configured in process',
      }),
    )
    process.exitCode = 2
    return
  }

  const edgeUsage = createEdgeUsageTracker()
  const invoke = createDeployedEdgeFullRewriteInvoke({ usage: edgeUsage })
  // Reuse CG2 usage shape for reporting (model filled from Edge responses)
  const usage = createUsageTracker()
  usage.model = 'edge:ai-contract-full-rewrite'

  // --- CANARY ---
  console.log('CG21_CANARY_START T01_EXTRAS')
  const canary = await runCg2PaidSuite({
    invoke,
    usage,
    caseIds: ['T01_EXTRAS'],
    artifactDir: 'tmp/cg2-artifacts/edge-canary',
    reviewDir: 'tmp/cg2-owner-review',
  })
  const canaryRow = canary.results[0]!
  console.log(
    'CG21_CANARY_RESULT',
    JSON.stringify({
      scenarioId: canaryRow.scenarioId,
      overall: canaryRow.overall,
      model: canaryRow.model,
      durationMs: canaryRow.durationMs,
      why: canaryRow.why,
      edgeCalls: edgeUsage.calls,
      runtimeModelsObserved: edgeUsage.models,
    }),
  )

  if (canaryRow.overall === 'FAIL') {
    console.log('CG21_STOPPED_SAFELY canary FAIL — no further paid calls')
    process.exitCode = 1
    return
  }

  // --- FULL BATCH (remaining) ---
  const rest = PAID_CASE_IDS.filter((id) => id !== 'T01_EXTRAS')
  const batch = await runCg2PaidSuite({
    invoke,
    usage,
    caseIds: rest,
    artifactDir: 'tmp/cg2-artifacts/edge-batch',
    reviewDir: 'tmp/cg2-owner-review',
  })

  const results: Cg2CaseResult[] = [...canary.results, ...batch.results]
  const summary = {
    total: results.length,
    pass: results.filter((r) => r.overall === 'PASS').length,
    partial: results.filter((r) => r.overall === 'PARTIAL').length,
    fail: results.filter((r) => r.overall === 'FAIL').length,
  }

  console.log('\nCG21 PAID MATRIX')
  for (const r of results) {
    console.log(
      [
        r.scenarioId,
        r.parties,
        r.extrasMode,
        r.llm,
        r.docx,
        r.data,
        r.placement,
        r.extrasPricesAbsent,
        r.overall,
        r.model ?? '',
        r.why,
      ].join(' | '),
    )
  }
  console.log('\nSUMMARY', summary)
  console.log(
    'EDGE_USAGE',
    JSON.stringify({
      calls: edgeUsage.calls,
      latenciesMs: edgeUsage.latenciesMs,
      models: edgeUsage.models,
      TOKEN_USAGE_NOTE:
        edgeUsage.models.length > 0
          ? 'model returned by Edge when present'
          : 'TOKEN_USAGE_NOT_EXPOSED_BY_EDGE',
    }),
  )

  if (summary.fail > 0) process.exitCode = 1
}

const isDirect =
  typeof process !== 'undefined' &&
  process.argv[1]?.includes('runCg21EdgeSuite')

if (isDirect) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
