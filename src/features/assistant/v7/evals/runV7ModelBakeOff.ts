/**
 * V7 FROZEN MODEL BAKE-OFF
 *
 * Zero V7 semantic changes. Uses fetchImpl transport compatibility only.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v7/evals/runV7ModelBakeOff.ts
 *
 * Corpus + scoring identical to the 74.07% falsification harness.
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { V7ResourceSetStore } from '../resourceSet/store'
import {
  runV7Turn,
  type V7AgentSession,
  type V7TurnResult,
} from '../agent/loop'
import { buildV7FixtureDeps } from './v7FixtureUniverse'
import {
  summarizeCorpus,
  V7_FALSIFICATION_CORPUS,
} from './v7FalsificationCorpus'
import {
  classifyGeneralFailure,
  emptyHardSafety,
  percentile,
  scoreV7Turn,
  V7_FIXTURE_YEAR_END_REMAINING_SUM,
  type V7GeneralFailureClass,
} from './v7FalsificationScore'

type BakeModel = {
  id: string
  label: string
  /** Requested reasoning; may be overridden by transport compat. */
  requestedReasoning: string | null
  /** Actual reasoning sent on frozen chat.completions+tools path. */
  effectiveReasoning: string | null
  /** Transport compatibility notes. */
  compatNotes: string[]
  /** Approx $/1M input|output (provisional). */
  priceInPerM: number
  priceOutPerM: number
}

/**
 * Probe-confirmed: gpt-5.6-* + function tools on /v1/chat/completions
 * REJECT reasoning_effort=low. Must use reasoning_effort=none on this frozen path.
 * (Using /v1/responses would change transport — out of scope for frozen bake-off.)
 */
const BAKE_MODELS: BakeModel[] = [
  {
    id: 'gpt-4.1',
    label: 'baseline',
    requestedReasoning: null,
    effectiveReasoning: null,
    compatNotes: ['Frozen V7 defaults: temperature=0, max_tokens'],
    priceInPerM: 2,
    priceOutPerM: 8,
  },
  {
    id: 'gpt-5.6-luna',
    label: 'cheap-current',
    requestedReasoning: 'low',
    effectiveReasoning: 'none',
    compatNotes: [
      'Requested reasoning_effort=low REJECTED by API with tools on chat.completions',
      'Minimal compat: reasoning_effort=none + max_completion_tokens (no temperature)',
    ],
    // Luna list price not confirmed in-repo; provisional same order as gpt-4.1
    priceInPerM: 2,
    priceOutPerM: 8,
  },
  {
    id: 'gpt-5.6-terra',
    label: 'balanced-current',
    requestedReasoning: 'low',
    effectiveReasoning: 'none',
    compatNotes: [
      'Requested reasoning_effort=low REJECTED by API with tools on chat.completions',
      'Minimal compat: reasoning_effort=none + max_completion_tokens (no temperature)',
    ],
    priceInPerM: 5,
    priceOutPerM: 15,
  },
  {
    id: 'gpt-5.6-sol',
    label: 'strong-current',
    requestedReasoning: 'low',
    effectiveReasoning: 'none',
    compatNotes: [
      'Requested reasoning_effort=low REJECTED by API with tools on chat.completions',
      'Minimal compat: reasoning_effort=none + max_completion_tokens (no temperature)',
    ],
    priceInPerM: 10,
    priceOutPerM: 30,
  },
]

type UsageAcc = {
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  requestCount: number
  rateLimitRetries: number
  transportRetries: number
}

function makeCompatFetch(
  model: BakeModel,
  usage: UsageAcc,
): typeof fetch {
  return async (input, init) => {
    let nextInit = init
    if (init?.body && typeof init.body === 'string') {
      const body = JSON.parse(init.body) as Record<string, unknown>
      body.model = model.id
      if (model.id.startsWith('gpt-5')) {
        delete body.temperature
        delete body.max_tokens
        body.max_completion_tokens = 1200
        if (model.effectiveReasoning != null) {
          body.reasoning_effort = model.effectiveReasoning
        }
      }
      nextInit = { ...init, body: JSON.stringify(body) }
    }

    // Outer rate-limit / transport retry (in addition to V7 loop's internal 4 attempts)
    let lastRes: Response | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      lastRes = await fetch(input, nextInit)
      const clone = lastRes.clone()
      let json: {
        error?: { message?: string }
        usage?: {
          prompt_tokens?: number
          completion_tokens?: number
          completion_tokens_details?: { reasoning_tokens?: number }
        }
      } = {}
      try {
        json = (await clone.json()) as typeof json
      } catch {
        json = {}
      }

      const errMsg = json.error?.message ?? ''
      if (
        lastRes.status === 429 ||
        /rate limit/i.test(errMsg)
      ) {
        usage.rateLimitRetries += 1
        await new Promise((r) =>
          setTimeout(r, 1200 * (attempt + 1) + Math.random() * 500),
        )
        continue
      }
      if (lastRes.status >= 500) {
        usage.transportRetries += 1
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
        continue
      }

      if (json.usage) {
        usage.inputTokens += json.usage.prompt_tokens ?? 0
        usage.outputTokens += json.usage.completion_tokens ?? 0
        usage.reasoningTokens +=
          json.usage.completion_tokens_details?.reasoning_tokens ?? 0
        usage.requestCount += 1
      }
      return lastRes
    }
    return lastRes!
  }
}

type TurnRow = {
  conversationId: string
  turnIndex: number
  user: string
  supportedUnambiguous: boolean
  correct: boolean | null
  harnessFailureClass?: string
  generalFailureClass?: V7GeneralFailureClass
  answer: string
  tools: string[]
  latencyMs: number
  firstModelMs: number | null
  finalResponseMs: number | null
  providerError: boolean
  excludedTransportCorruption: boolean
}

async function runOneModel(model: BakeModel, apiKey: string) {
  const corpusInfo = summarizeCorpus()
  const safety = emptyHardSafety()
  const usage: UsageAcc = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    requestCount: 0,
    rateLimitRetries: 0,
    transportRetries: 0,
  }
  const fetchImpl = makeCompatFetch(model, usage)
  const scores: TurnRow[] = []
  const latencies: number[] = []
  const firstModelMs: number[] = []
  const finalMs: number[] = []
  let toolCallsTotal = 0
  const ownerTurns: Array<{
    user: string
    answer: string
    tools: string[]
    ok: boolean
  }> = []

  console.log(`\n######## MODEL ${model.id} (${model.label}) ########`)
  console.log('compat', model.compatNotes.join(' | '))

  for (const convo of V7_FALSIFICATION_CORPUS) {
    const store = new V7ResourceSetStore({
      sessionId: `v7-bake-${model.id}-${convo.id}-${Date.now()}`,
      tenantKey: 'fixture-tenant',
    })
    const session: V7AgentSession = {
      store,
      binding: store.binding,
      deps: buildV7FixtureDeps(),
      history: [],
      model: model.id,
      apiKey,
      todayKey: '2026-09-15',
      fetchImpl,
    }

    console.log(`\n=== [${model.id}] ${convo.id} ===`)
    for (let i = 0; i < convo.turns.length; i++) {
      const turn = convo.turns[i]!
      const result: V7TurnResult = await runV7Turn(session, turn.user)
      toolCallsTotal += result.toolCallCount
      latencies.push(result.latency.totalMs)
      if (result.latency.firstModelMs != null) {
        firstModelMs.push(result.latency.firstModelMs)
      }
      if (result.latency.finalResponseMs != null) {
        finalMs.push(result.latency.finalResponseMs)
      }

      const providerError = result.stoppedReason === 'provider_error'
      // If still failing after retries, exclude from semantic denominator
      const excludedTransportCorruption = providerError

      let scored = scoreV7Turn(turn.expect, result, safety)
      if (excludedTransportCorruption) {
        scored = { correct: null, failureClass: 'transport_excluded' }
      }

      if (convo.id === 'owner-failure-exact') {
        if (!excludedTransportCorruption && i === 2) {
          const agg = result.toolCalls.find(
            (t) => t.name === 'aggregate_resources',
          )
          const val = (agg?.result as { value?: number })?.value
          if (
            typeof val === 'number' &&
            val !== V7_FIXTURE_YEAR_END_REMAINING_SUM
          ) {
            safety.wrongFinanceSemantics += 1
            scored.correct = false
            scored.failureClass = 'wrong_finance_semantics'
          }
        }
        ownerTurns.push({
          user: turn.user,
          answer: result.userText,
          tools: result.toolCalls.map((t) => t.name),
          ok: scored.correct === true,
        })
      }

      // total-paid scope widening signal (quality; also bump hard metric)
      if (
        convo.id === 'total-paid' &&
        scored.correct === false &&
        /19\s*500|19500/.test(result.userText)
      ) {
        safety.scopeWidening += 1
      }

      const general =
        scored.correct === false
          ? classifyGeneralFailure({
              conversationId: convo.id,
              user: turn.user,
              failureClass: scored.failureClass,
              tools: result.toolCalls.map((t) => t.name),
              answer: result.userText,
              providerError,
            })
          : undefined

      scores.push({
        conversationId: convo.id,
        turnIndex: i,
        user: turn.user,
        supportedUnambiguous: turn.expect.supportedUnambiguous,
        correct: scored.correct,
        harnessFailureClass: scored.failureClass,
        generalFailureClass: general,
        answer: result.userText,
        tools: result.toolCalls.map((t) => t.name),
        latencyMs: result.latency.totalMs,
        firstModelMs: result.latency.firstModelMs,
        finalResponseMs: result.latency.finalResponseMs,
        providerError,
        excludedTransportCorruption,
      })

      const mark =
        scored.correct === true
          ? 'OK'
          : scored.correct === false
            ? 'FAIL'
            : 'N/A'
      console.log(
        `T${i + 1} [${mark}] ${turn.user.slice(0, 60)} → ${result.userText.slice(0, 100)}`,
      )
      if (general) console.log(`   !! ${general} (${scored.failureClass})`)
    }

    store.close()
    await new Promise((r) => setTimeout(r, 3000))
  }

  const supported = scores.filter(
    (s) => s.supportedUnambiguous && !s.excludedTransportCorruption,
  )
  const correctSupported = supported.filter((s) => s.correct === true)
  const successPct =
    supported.length === 0
      ? 0
      : (100 * correctSupported.length) / supported.length

  const failureClasses: Record<string, number> = {}
  for (const s of scores) {
    if (s.correct !== false || !s.generalFailureClass) continue
    failureClasses[s.generalFailureClass] =
      (failureClasses[s.generalFailureClass] ?? 0) + 1
  }

  const ownerPass =
    ownerTurns.length === 5 && ownerTurns.every((t) => t.ok)

  const estCost =
    (usage.inputTokens / 1_000_000) * model.priceInPerM +
    (usage.outputTokens / 1_000_000) * model.priceOutPerM

  return {
    model: model.id,
    label: model.label,
    requestedReasoning: model.requestedReasoning,
    effectiveReasoning: model.effectiveReasoning,
    compatNotes: model.compatNotes,
    corpus: corpusInfo,
    supportedUnambiguousScored: supported.length,
    supportedUnambiguousExcludedTransport: scores.filter(
      (s) => s.supportedUnambiguous && s.excludedTransportCorruption,
    ).length,
    correct: correctSupported.length,
    successPct: Number(successPct.toFixed(2)),
    safety,
    hardSafetyZero: Object.values(safety).every((n) => n === 0),
    latency: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      firstModelP50: percentile(firstModelMs, 50),
      finalP50: percentile(finalMs, 50),
      n: latencies.length,
    },
    usage: {
      ...usage,
      estimatedCorpusCostUsd: Number(estCost.toFixed(4)),
      priceAssumptions: {
        inPerM: model.priceInPerM,
        outPerM: model.priceOutPerM,
        note: 'Provisional list prices; Luna/Terra/Sol not confirmed in-repo',
      },
    },
    toolCallsTotal,
    failureClasses,
    ownerFiveTurn: { pass: ownerPass, turns: ownerTurns },
    failures: scores.filter((s) => s.correct === false),
    scores,
  }
}

function decideVerdict(
  results: Array<{ successPct: number; hardSafetyZero: boolean; model: string }>,
): {
  verdict: string
  best: string
  cheapestAt95: string | null
} {
  const passing = results.filter(
    (r) => r.successPct >= 95 && r.hardSafetyZero,
  )
  const best = [...results].sort((a, b) => b.successPct - a.successPct)[0]!
  if (passing.length > 0) {
    // cheapest among passers by provisional price order: luna < 4.1 < terra < sol
    const order = ['gpt-5.6-luna', 'gpt-4.1', 'gpt-5.6-terra', 'gpt-5.6-sol']
    const cheapest =
      order.find((id) => passing.some((p) => p.model === id)) ??
      passing[0]!.model
    return {
      verdict: 'MODEL PATH PASS',
      best: best.model,
      cheapestAt95: cheapest,
    }
  }
  if (best.successPct >= 90 && best.hardSafetyZero) {
    return {
      verdict: 'MODEL HELPS — GENERAL GAP REMAINS',
      best: best.model,
      cheapestAt95: null,
    }
  }
  // Overlap analysis done in main for CASE 3 vs 4
  return {
    verdict: 'PENDING_OVERLAP',
    best: best.model,
    cheapestAt95: null,
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY required')

  const only = process.env.V7_BAKE_ONLY?.trim()
  const models = only
    ? BAKE_MODELS.filter((m) => m.id === only)
    : BAKE_MODELS

  console.log('V7 FROZEN MODEL BAKE-OFF', {
    models: models.map((m) => m.id),
    corpus: summarizeCorpus(),
  })

  const results: Array<Awaited<ReturnType<typeof runOneModel>>> = []
  for (const m of models) {
    const r = await runOneModel(m, apiKey)
    results.push(r)
    // Cool TPM between models
    await new Promise((x) => setTimeout(x, 8000))
  }

  let decision = decideVerdict(results)
  if (decision.verdict === 'PENDING_OVERLAP') {
    // Shared failure classes across best 2+ models
    const sorted = [...results].sort((a, b) => b.successPct - a.successPct)
    const top = sorted.slice(0, Math.min(3, sorted.length))
    const classSets = top.map(
      (r) => new Set(Object.keys(r.failureClasses)),
    )
    const shared = [...classSets[0]!].filter((c) =>
      classSets.every((s) => s.has(c)),
    )
    const bestPct = sorted[0]!.successPct
    if (bestPct < 90 && shared.length >= 2) {
      decision = {
        verdict: 'ARCHITECTURE-CONTEXT BOTTLENECK',
        best: sorted[0]!.model,
        cheapestAt95: null,
      }
    } else {
      decision = {
        verdict: 'MODEL CAPABILITY BOTTLENECK',
        best: sorted[0]!.model,
        cheapestAt95: null,
      }
    }
  }

  // Shared vs model-specific failure classes
  const allClasses = new Set<string>()
  for (const r of results) {
    for (const c of Object.keys(r.failureClasses)) allClasses.add(c)
  }
  const sharedFailures = [...allClasses].filter((c) =>
    results.every((r) => (r.failureClasses[c] ?? 0) > 0),
  )
  const modelSpecific: Record<string, string[]> = {}
  for (const r of results) {
    modelSpecific[r.model] = Object.keys(r.failureClasses).filter(
      (c) => !sharedFailures.includes(c),
    )
  }

  const report = {
    experiment: 'V7_FROZEN_MODEL_BAKE_OFF',
    v7RuntimeChanged: false,
    transportCompatOnly: true,
    decision,
    corpus: summarizeCorpus(),
    models: results.map((r) => ({
      model: r.model,
      label: r.label,
      requestedReasoning: r.requestedReasoning,
      effectiveReasoning: r.effectiveReasoning,
      compatNotes: r.compatNotes,
      correct: r.correct,
      supported: r.supportedUnambiguousScored,
      excludedTransport: r.supportedUnambiguousExcludedTransport,
      successPct: r.successPct,
      hardSafetyZero: r.hardSafetyZero,
      safety: r.safety,
      latency: r.latency,
      usage: r.usage,
      toolCallsTotal: r.toolCallsTotal,
      failureClasses: r.failureClasses,
      ownerFiveTurnPass: r.ownerFiveTurn.pass,
    })),
    sharedFailureClasses: sharedFailures,
    modelSpecificFailureClasses: modelSpecific,
    ownerFiveTurnDetail: Object.fromEntries(
      results.map((r) => [r.model, r.ownerFiveTurn]),
    ),
    failuresByModel: Object.fromEntries(
      results.map((r) => [
        r.model,
        r.failures.map((f) => ({
          id: f.conversationId,
          t: f.turnIndex,
          general: f.generalFailureClass,
          harness: f.harnessFailureClass,
          user: f.user,
          answer: f.answer.slice(0, 200),
          tools: f.tools,
        })),
      ]),
    ),
  }

  const outPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../v4/benchmark/artifacts/phase-v7-model-bakeoff.json',
  )
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log('\n==== V7 MODEL BAKE-OFF REPORT ====')
  console.log(JSON.stringify({ decision, models: report.models, outPath }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
