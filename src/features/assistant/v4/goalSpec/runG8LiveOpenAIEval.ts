/**
 * G8.1 — Live gpt-4.1 GoalSpec quality gate (local OpenAI; no Edge deploy).
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v4/goalSpec/runG8LiveOpenAIEval.ts
 *
 * Never prints/logs the API key. Synthetic utterances only.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { ASSISTANT_V5_GOALSPEC_JSON_SCHEMA } from './goalSpecSchema'
import { V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT } from './goalSpecInterpreterPrompt'
import { parseFlatGoalSpecPayload } from './goalSpecSchema'
import { normalizeGoalSpecTemporal } from './normalizeGoalSpecTemporal'
import {
  G8_LIVE_EVAL_CORPUS,
  g8LiveCorpusStats,
  type G8LiveEvalCase,
} from './g8LiveEvalCorpus'
import {
  G8_FOCUSED_EVAL_CORPUS,
  g8FocusedCorpusStats,
} from './g8FocusedEvalCorpus'
import { runG8GoalSpecBenchmark, type G8CaseResult } from './runG8Benchmark'
import { normalizeGoalSpecSemantics } from './compareGoalSpecSemantics'
import type { GoalSpec } from './goalSpec'

type Usage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  prompt_tokens_details?: {
    cached_tokens?: number
    cache_write_tokens?: number
  }
  completion_tokens_details?: {
    reasoning_tokens?: number
  }
}

type LiveCallResult =
  | { ok: true; goalSpec: GoalSpec; usage: Usage | null; error?: undefined }
  | {
      ok: false
      error: string
      kind: 'provider' | 'schema'
      usage: Usage | null
    }

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function resolveEvalModel(): {
  model: string
  requestParams: Record<string, unknown>
  notes: string[]
} {
  const model = (process.env.G8_MODEL ?? 'gpt-4.1').trim()
  if (model === 'gpt-5.6-luna') {
    return {
      model,
      // Luna: max_tokens unsupported; temperature must be default (1).
      requestParams: { max_completion_tokens: 900 },
      notes: [
        'gpt-5.6-luna uses max_completion_tokens (not max_tokens)',
        'gpt-5.6-luna rejects temperature=0; API default temperature=1 used',
      ],
    }
  }
  return {
    model,
    requestParams: { temperature: 0, max_tokens: 900 },
    notes: ['gpt-4.1 uses temperature=0 and max_tokens=900'],
  }
}

async function callOpenAIGoalSpecOnce(
  utterance: string,
  semanticContext: unknown,
  modelCfg: ReturnType<typeof resolveEvalModel>,
): Promise<LiveCallResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return { ok: false, error: 'missing_openai_key', kind: 'provider', usage: null }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelCfg.model,
      ...modelCfg.requestParams,
      messages: [
        { role: 'system', content: V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            utterance,
            semanticContextSummary: semanticContext,
            locale: 'pl-PL',
          }),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'assistant_v5_goal_spec',
          strict: true,
          schema: ASSISTANT_V5_GOALSPEC_JSON_SCHEMA,
        },
      },
    }),
  })
  const body = await res.json().catch(() => null)
  const usage = (body?.usage as Usage | undefined) ?? null
  if (!res.ok) {
    const code = body?.error?.code ?? body?.error?.type ?? `http_${res.status}`
    return {
      ok: false,
      error: `provider_${res.status}_${String(code)}`,
      kind: 'provider',
      usage,
    }
  }
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    return { ok: false, error: 'empty_content', kind: 'provider', usage }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { ok: false, error: 'json_parse', kind: 'schema', usage }
  }
  const goal = parseFlatGoalSpecPayload(parsed)
  if (!goal) {
    return { ok: false, error: 'schema_error', kind: 'schema', usage }
  }
  return {
    ok: true,
    goalSpec: normalizeGoalSpecTemporal(goal, '2026-09-13'),
    usage,
  }
}

/** Harness-only: retry transient provider failures for valid measurement. */
async function callOpenAIGoalSpec(
  utterance: string,
  semanticContext: unknown,
  modelCfg: ReturnType<typeof resolveEvalModel>,
): Promise<LiveCallResult> {
  let last: LiveCallResult | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    last = await callOpenAIGoalSpecOnce(utterance, semanticContext, modelCfg)
    if (last.ok) return last
    if (last.kind === 'schema') return last
    const transient =
      last.error.includes('429') ||
      last.error.includes('rate') ||
      last.error.includes('500') ||
      last.error.includes('502') ||
      last.error.includes('503') ||
      last.error.includes('empty_content')
    if (!transient || attempt === 3) return last
    await sleep(800 * Math.pow(2, attempt))
  }
  return last!
}

type FailClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

function classifyFailure(
  caseDef: G8LiveEvalCase,
  result: G8CaseResult,
): FailClass {
  if (result.providerError || result.status === 'provider_error') return 'G'
  if (result.status === 'schema_error') return 'G'
  if (!result.score || !result.goalSpec) return 'G'

  const dims = result.failDims
  if (
    dims.includes('domainQuery') &&
    !dims.some((d) =>
      [
        'requestKind',
        'aggregation',
        'measure',
        'temporal',
        'relation',
        'ellipsis',
      ].includes(d),
    )
  ) {
    return 'E'
  }

  const a = normalizeGoalSpecSemantics(result.goalSpec)
  if (
    dims.includes('temporal') &&
    caseDef.expect.temporalContains &&
    a.temporalExpression &&
    a.temporalExpression
      .toLowerCase()
      .includes(caseDef.expect.temporalContains.toLowerCase()) &&
    !a.temporalFrom
  ) {
    return 'D'
  }

  if (dims.length === 1 && dims[0] === 'ambiguity') return 'F'

  if (
    dims.includes('correction') &&
    caseDef.expect.placeName &&
    a.placeName &&
    (a.placeName.includes(caseDef.expect.placeName) ||
      caseDef.expect.placeName.includes(a.placeName)) &&
    dims.every((d) => d === 'correction' || d === 'domainQuery')
  ) {
    return 'C'
  }

  return 'A'
}

function requestFamilyPct(
  results: G8CaseResult[],
  cases: G8LiveEvalCase[],
): number {
  const fam = new Set([
    'product_help',
    'goal_plan',
    'prepare_action',
    'unsupported',
  ])
  const subset = cases
    .map((c, i) => ({ c, r: results[i] }))
    .filter(({ c }) => fam.has(c.expect.requestKind))
  if (subset.length === 0) return 100
  const ok = subset.filter(
    ({ c, r }) =>
      r.status !== 'provider_error' &&
      r.status !== 'schema_error' &&
      r.goalSpec?.requestKind === c.expect.requestKind,
  ).length
  return (100 * ok) / subset.length
}

function chainSummary(
  cases: G8LiveEvalCase[],
  results: G8CaseResult[],
): Array<{
  chainId: string
  turns: number
  passed: boolean
  failedIds: string[]
}> {
  const byChain = new Map<string, { ids: string[]; idxs: number[] }>()
  cases.forEach((c, i) => {
    if (!c.chainId) return
    const cur = byChain.get(c.chainId) ?? { ids: [], idxs: [] }
    cur.ids.push(c.id)
    cur.idxs.push(i)
    byChain.set(c.chainId, cur)
  })
  return [...byChain.entries()].map(([chainId, { ids, idxs }]) => {
    const failedIds = idxs
      .filter((i) => results[i]?.status !== 'success')
      .map((i) => cases[i].id)
    return {
      chainId,
      turns: ids.length,
      passed: failedIds.length === 0,
      failedIds,
    }
  })
}

function ambiguityFalseConfident(
  cases: G8LiveEvalCase[],
  results: G8CaseResult[],
): Array<{ id: string; utterance: string; detail: string }> {
  const out: Array<{ id: string; utterance: string; detail: string }> = []
  cases.forEach((c, i) => {
    if (c.category !== 'ambiguity') return
    const r = results[i]
    if (!r?.goalSpec) return
    const a = normalizeGoalSpecSemantics(r.goalSpec)
    if (c.expect.measure === null && a.measure != null) {
      out.push({
        id: c.id,
        utterance: c.utterance,
        detail: `guessed measure=${a.measure}`,
      })
    }
    if (
      c.expect.ambiguitySlots &&
      c.expect.ambiguitySlots.length > 0 &&
      a.ambiguitySlots.length === 0
    ) {
      out.push({
        id: c.id,
        utterance: c.utterance,
        detail: 'no ambiguity slots; confident fill',
      })
    }
  })
  return out
}

function failureDetail(
  caseDef: G8LiveEvalCase,
  result: G8CaseResult,
): { expected: string; actual: string } {
  const exp = caseDef.expect
  const a = result.goalSpec
    ? normalizeGoalSpecSemantics(result.goalSpec)
    : null
  const expected = [
    `kind=${exp.requestKind}`,
    exp.aggregation != null ? `agg=${exp.aggregation}` : null,
    exp.measure !== undefined ? `measure=${exp.measure}` : null,
    exp.placeName !== undefined ? `place=${exp.placeName}` : null,
    exp.temporalContains ? `temporal~${exp.temporalContains}` : null,
    exp.inheritActiveCollection != null
      ? `inherit=${exp.inheritActiveCollection}`
      : null,
    exp.correctionTarget ? `corr=${exp.correctionTarget}` : null,
    exp.ambiguitySlots ? `amb=[${exp.ambiguitySlots.join(',')}]` : null,
  ]
    .filter(Boolean)
    .join(' ')
  const actual = a
    ? [
        `kind=${a.requestKind}`,
        `agg=${a.aggregation}`,
        `measure=${a.measure}`,
        `place=${a.placeName}`,
        `temporal=${a.temporalExpression}`,
        `inherit=${a.inheritActiveCollection}`,
        `corr=${a.correctionTarget}`,
        `amb=[${a.ambiguitySlots.join(',')}]`,
        `failDims=${result.failDims.join(',')}`,
      ].join(' ')
    : `status=${result.status}`
  return { expected, actual }
}

async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.log('M1 BLOCKED — missing local OPENAI_API_KEY')
    process.exit(2)
  }

  const focused = process.env.G8_FOCUSED === '1'
  const modelCfg = resolveEvalModel()
  const cases = focused ? G8_FOCUSED_EVAL_CORPUS : G8_LIVE_EVAL_CORPUS
  const stats = focused
    ? { ...g8FocusedCorpusStats(), chainCount: 0 }
    : g8LiveCorpusStats()
  let promptTokens = 0
  let completionTokens = 0
  let totalTokens = 0
  let cachedTokens = 0
  let reasoningTokens = 0
  let modelCalls = 0
  const liveErrors: Array<{ id: string; error: string; kind: string }> = []

  console.log(
    `M1 ${focused ? 'FOCUSED' : 'FULL'} live eval: n=${cases.length} model=${modelCfg.model}`,
  )
  for (const n of modelCfg.notes) console.log(`note: ${n}`)

  const { report, metrics, results } = await runG8GoalSpecBenchmark({
    mode: 'live',
    cases,
    interpretLive: async (c) => {
      // small pacing to reduce rate-limit bursts
      await sleep(150)
      modelCalls += 1
      const r = await callOpenAIGoalSpec(
        c.utterance,
        c.semanticContext ?? null,
        modelCfg,
      )
      if (r.usage) {
        promptTokens += r.usage.prompt_tokens ?? 0
        completionTokens += r.usage.completion_tokens ?? 0
        totalTokens += r.usage.total_tokens ?? 0
        cachedTokens += r.usage.prompt_tokens_details?.cached_tokens ?? 0
        reasoningTokens +=
          r.usage.completion_tokens_details?.reasoning_tokens ?? 0
      }
      if (!r.ok) {
        liveErrors.push({ id: c.id, error: r.error, kind: r.kind })
        return {
          ok: false,
          error: r.error,
          errorKind: r.kind,
        }
      }
      return { ok: true, goalSpec: r.goalSpec }
    },
  })

  const taxonomy: Record<FailClass, number> = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    E: 0,
    F: 0,
    G: 0,
  }
  const failures: Array<{
    id: string
    utterance: string
    class: FailClass
    expected: string
    actual: string
    failDims: string[]
  }> = []

  cases.forEach((c, i) => {
    const r = results[i]
    if (!r || r.status === 'success') return
    const cls = classifyFailure(c, r)
    taxonomy[cls] += 1
    const det = failureDetail(c, r)
    failures.push({
      id: c.id,
      utterance: c.utterance,
      class: cls,
      expected: det.expected,
      actual: det.actual,
      failDims: r.failDims,
    })
  })

  const chains = chainSummary(cases, results)
  const ambReview = ambiguityFalseConfident(cases, results)
  const familyPct = requestFamilyPct(results, cases)

  const dimFailCounts: Record<string, number> = {}
  for (const r of results) {
    for (const d of r.failDims) {
      dimFailCounts[d] = (dimFailCounts[d] ?? 0) + 1
    }
  }

  // Honest schema % over all cases (not only scored)
  const schemaOkCount = results.filter(
    (r) => r.status !== 'schema_error' && r.goalSpec != null,
  ).length
  const schemaValidAllPct = (100 * schemaOkCount) / results.length
  const providerCount = results.filter((r) => r.providerError).length
  const schemaErrCount = results.filter((r) => r.status === 'schema_error').length

  // RAW = GoalSpec dim scores only (ignore BoundGoal/DQ)
  const rawScored = results.filter((r) => r.score)
  const rawPct = (pred: (s: NonNullable<(typeof results)[0]['score']>) => boolean) =>
    rawScored.length === 0
      ? 0
      : (100 * rawScored.filter((r) => pred(r.score!)).length) / rawScored.length

  const rawFailCount = results.filter((r) => {
    if (r.providerError || r.status === 'schema_error') return true
    if (!r.score) return true
    return r.failDims.some((d) => d !== 'domainQuery')
  }).length

  const rawMetrics = {
    schemaValidPct: schemaValidAllPct,
    providerErrorPct: metrics.providerErrorPct,
    requestKindPct: rawPct((s) => s.requestKind),
    aggregationPct: rawPct((s) => s.aggregation),
    measurePct: rawPct((s) => s.measure),
    sourcePct: rawPct((s) => s.source),
    temporalPct: rawPct((s) => s.temporal),
    relationPct: rawPct((s) => s.relation),
    ambiguityPct: rawPct((s) => s.ambiguity),
    correctionPct: rawPct((s) => s.correction),
    ellipsisPct: rawPct((s) => s.ellipsis),
    requestFamilyPct: familyPct,
    failedCount: rawFailCount,
  }

  const boundMetrics = {
    boundGoalAgreePct: metrics.boundGoalAgreePct,
    domainQueryAgreePct: metrics.domainQueryAgreePct,
    chainsPassed: chains.filter((x) => x.passed).length,
    chainsTotal: chains.length,
  }

  const focusedGatesOk =
    schemaValidAllPct === 100 &&
    providerCount === 0 &&
    rawMetrics.aggregationPct >= 98 &&
    rawMetrics.ambiguityPct >= 98 &&
    rawMetrics.ellipsisPct >= 98 &&
    (metrics.boundGoalAgreePct ?? 0) >= 99 &&
    (metrics.domainQueryAgreePct ?? 0) >= 99 &&
    rawMetrics.correctionPct >= 98 &&
    rawMetrics.temporalPct >= 98 &&
    rawMetrics.measurePct >= 98 &&
    rawMetrics.requestKindPct >= 98

  const gates = {
    schema100: schemaValidAllPct === 100 && schemaErrCount === 0,
    provider0: providerCount === 0,
    dq99:
      metrics.domainQueryAgreePct != null && metrics.domainQueryAgreePct >= 99,
    bound99:
      metrics.boundGoalAgreePct != null && metrics.boundGoalAgreePct >= 99,
    requestKind98: rawMetrics.requestKindPct >= 98,
    aggregation98: rawMetrics.aggregationPct >= 98,
    measure98: rawMetrics.measurePct >= 98,
    temporal98: rawMetrics.temporalPct >= 98,
    relation98: rawMetrics.relationPct >= 98,
    correction98: rawMetrics.correctionPct >= 98,
    ellipsis98: rawMetrics.ellipsisPct >= 98,
    ambiguity98: rawMetrics.ambiguityPct >= 98,
    noFalseConfidentAmbiguity: ambReview.length === 0,
    focusedReady: focused ? focusedGatesOk : true,
  }
  const allGates = Object.values(gates).every(Boolean)

  // Behavior diagnostics (reporting only; same goldens)
  let falseMoneyGuesses = 0
  let missingRequiredAmbiguity = 0
  let overAmbiguityOnClearMeasure = 0
  let droppedExplicitOperation = 0
  let entityKindAmbiguityMiss = 0
  let surfaceNameRewrite = 0
  cases.forEach((c, i) => {
    const r = results[i]
    if (!r?.goalSpec) return
    const a = normalizeGoalSpecSemantics(r.goalSpec)
    if (
      c.expect.measure === null &&
      c.expect.ambiguitySlots?.includes('measure') &&
      a.measure != null
    ) {
      falseMoneyGuesses += 1
    }
    if (
      c.expect.ambiguitySlots &&
      c.expect.ambiguitySlots.length > 0 &&
      !c.expect.ambiguitySlots.every((s) =>
        (a.ambiguitySlots as readonly string[]).includes(s),
      )
    ) {
      missingRequiredAmbiguity += 1
      if (c.expect.ambiguitySlots.includes('entity_kind')) {
        entityKindAmbiguityMiss += 1
      }
    }
    if (
      c.expect.measure != null &&
      a.measure == null &&
      a.ambiguitySlots.includes('measure')
    ) {
      overAmbiguityOnClearMeasure += 1
    }
    if (
      c.expect.aggregation != null &&
      a.aggregation == null &&
      (c.expect.inheritActiveCollection === true ||
        c.category === 'ellipsis' ||
        c.category === 'simple')
    ) {
      droppedExplicitOperation += 1
    }
    if (
      c.expect.placeName &&
      a.placeName &&
      c.expect.placeName !== a.placeName &&
      !(
        a.placeName.includes(c.expect.placeName) ||
        c.expect.placeName.includes(a.placeName)
      )
    ) {
      surfaceNameRewrite += 1
    }
  })

  const behavior = {
    falseMoneyGuesses,
    missingRequiredAmbiguity,
    overAmbiguityOnClearMeasure,
    droppedExplicitOperation,
    entityKindAmbiguityMiss,
    surfaceNameRewrite,
  }

  // Cost: gpt-4.1 public approx $2/$8 per 1M. Luna pricing not confirmed in-repo —
  // report provisional estimate with same rates + note.
  const inputRate = 2
  const outputRate = 8
  const estCostUsd =
    (promptTokens / 1_000_000) * inputRate +
    (completionTokens / 1_000_000) * outputRate
  const avgIn = modelCalls ? promptTokens / modelCalls : 0
  const avgOut = modelCalls ? completionTokens / modelCalls : 0
  const estPer1000Usd =
    (avgIn / 1_000_000) * inputRate * 1000 +
    (avgOut / 1_000_000) * outputRate * 1000

  const modelSlug = modelCfg.model.replace(/[^a-zA-Z0-9._-]/g, '_')
  const artifact = {
    phase: focused ? 'M1-focused' : 'M1-full',
    model: modelCfg.model,
    modelNotes: modelCfg.notes,
    requestParams: modelCfg.requestParams,
    temperature:
      modelCfg.model === 'gpt-5.6-luna' ? 'default(1)' : 0,
    runs: 1,
    note: 'M1 frozen-prompt model A/B; no prompt/schema/Binder/DomainQuery/golden edits.',
    frozenContract: true,
    corpus: stats,
    rawMetrics,
    boundMetrics,
    behavior,
    gates,
    allGates,
    focusedGatesOk,
    taxonomy,
    dimFailCounts,
    chains,
    ambiguityFalseConfident: ambReview,
    failures,
    liveErrors,
    usage: {
      modelCalls,
      promptTokens,
      completionTokens,
      totalTokens,
      cachedTokens,
      reasoningTokens,
      estCostUsd: Number(estCostUsd.toFixed(4)),
      estCostAssumption:
        modelCfg.model === 'gpt-5.6-luna'
          ? 'provisional: same $2/$8 per 1M as gpt-4.1 (Luna list price not confirmed in-repo)'
          : 'gpt-4.1 approx $2 input / $8 output per 1M tokens',
      avgPromptTokens: Number(avgIn.toFixed(1)),
      avgCompletionTokens: Number(avgOut.toFixed(1)),
      estCostPer1000CallsUsd: Number(estPer1000Usd.toFixed(4)),
    },
  }

  const outDir = resolve(
    process.cwd(),
    'src/features/assistant/v4/benchmark/artifacts',
  )
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(
    outDir,
    focused
      ? `phase-m1-focused-${modelSlug}.json`
      : `phase-m1-full-${modelSlug}.json`,
  )
  writeFileSync(outPath, JSON.stringify(artifact, null, 2))

  console.log(report)
  console.log('--- RAW ---')
  console.log(JSON.stringify(rawMetrics, null, 2))
  console.log('--- BOUND ---')
  console.log(JSON.stringify(boundMetrics, null, 2))
  console.log('--- BEHAVIOR ---')
  console.log(JSON.stringify(behavior, null, 2))
  console.log(`FOCUSED_GATE ${focusedGatesOk ? 'PASS' : 'FAIL'}`)
  console.log(
    `schemaAll=${schemaValidAllPct.toFixed(1)}% schemaErr=${schemaErrCount} provider=${providerCount}`,
  )
  console.log(`requestFamily=${familyPct.toFixed(1)}%`)
  console.log(
    `chains_passed=${chains.filter((x) => x.passed).length}/${chains.length || 0}`,
  )
  console.log(`taxonomy=${JSON.stringify(taxonomy)}`)
  console.log(
    `usage calls=${modelCalls} prompt=${promptTokens} completion=${completionTokens} cached=${cachedTokens} reasoning=${reasoningTokens} total=${totalTokens} estUSD≈${estCostUsd.toFixed(3)} per1000≈${estPer1000Usd.toFixed(3)}`,
  )
  console.log(`artifact=${outPath}`)
  console.log(`GATES ${allGates ? 'PASS' : 'FAIL'} ${JSON.stringify(gates)}`)
  if (liveErrors.length) {
    console.log('LIVE_ERRORS:')
    for (const e of liveErrors) {
      console.log(`- ${e.id} [${e.kind}] ${e.error}`)
    }
  }
  if (failures.length) {
    console.log('FAILURES:')
    for (const f of failures) {
      console.log(
        `- [${f.class}] ${f.id} | ${f.utterance} | ${f.failDims.join(',')} | exp:{${f.expected}} act:{${f.actual}}`,
      )
    }
  }
  if (ambReview.length) {
    console.log('AMBIGUITY_FALSE_CONFIDENT:')
    for (const a of ambReview) {
      console.log(`- ${a.id} | ${a.utterance} | ${a.detail}`)
    }
  }
}

main().catch((e) => {
  console.error(String(e?.message ?? e))
  process.exit(1)
})
