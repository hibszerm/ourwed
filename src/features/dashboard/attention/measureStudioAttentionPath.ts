/**
 * D2 — measure Studio Attention data path BEFORE Dashboard UI wiring.
 *
 * Run (isolate, authenticated local env):
 *   npx tsx --tsconfig tsconfig.app.json \
 *     src/features/dashboard/attention/measureStudioAttentionPath.ts
 *
 * Requires SUPABASE session via existing .env (same as app). Does not mutate CRM.
 */

import { createClient } from '@supabase/supabase-js'
import { studioAttentionService } from '@/features/dashboard/attention/studioAttentionService'

async function ensureSession(): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const anon =
    process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
  const email = process.env.D2_MEASURE_EMAIL ?? process.env.MEASURE_EMAIL
  const password =
    process.env.D2_MEASURE_PASSWORD ?? process.env.MEASURE_PASSWORD

  if (!url || !anon) {
    throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  }
  if (!email || !password) {
    console.log(
      JSON.stringify({
        ok: false,
        reason: 'NO_MEASURE_CREDENTIALS',
        hint: 'Set D2_MEASURE_EMAIL + D2_MEASURE_PASSWORD for live timing',
      }),
    )
    process.exit(2)
  }

  const client = createClient(url, anon)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error

  // Align app supabase singleton session via storage is env-dependent;
  // studioAttentionService uses @/lib/supabase — copy tokens if needed.
  const { data } = await client.auth.getSession()
  if (!data.session) throw new Error('No session after sign-in')

  const { supabase } = await import('@/lib/supabase')
  await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
}

async function main() {
  await ensureSession()

  const coldStart = performance.now()
  const cold = await studioAttentionService.listStudioAttention()
  const coldMs = performance.now() - coldStart

  const warmStart = performance.now()
  const warm = await studioAttentionService.listStudioAttention()
  const warmMs = performance.now() - warmStart

  const report = {
    ok: true,
    coldMs: Math.round(coldMs),
    warmMs: Math.round(warmMs),
    candidateCount: cold.topology.candidateCount,
    itemCount: cold.items.length,
    batchSteps: cold.topology.batchSteps,
    perWeddingServiceCalls: cold.topology.perWeddingServiceCalls,
    warmCandidateCount: warm.topology.candidateCount,
    kinds: cold.items.map((i) => i.kind),
    nPlusOne: cold.topology.perWeddingServiceCalls === 0 ? 'NO' : 'YES',
    requestCountApprox: cold.topology.batchSteps.length,
  }

  console.log(JSON.stringify(report, null, 2))

  if (report.nPlusOne === 'YES') {
    console.error('PERFORMANCE_GATE_FAILED: N+1')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
