/**
 * IC2 — Live Luna semantic-completeness eval (local OpenAI; shadow contract).
 *
 *   G8_MODEL=gpt-5.6-luna npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v4/goalSpec/runIc2LunaSemanticCompletenessEval.ts
 *
 * Never prints/logs the API key. Model fixed to gpt-5.6-luna for IC2.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { GoalSpec } from './goalSpec'
import { V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT } from './goalSpecInterpreterPrompt'
import {
  ASSISTANT_V5_GOALSPEC_JSON_SCHEMA,
  parseFlatGoalSpecPayload,
} from './goalSpecSchema'
import { normalizeGoalSpecTemporal } from './normalizeGoalSpecTemporal'
import {
  IC2_SEMANTIC_COMPLETENESS_CORPUS,
  ic2CorpusStats,
  type Ic2Case,
} from './ic2SemanticCompletenessCorpus'
import {
  assessIc2SemanticShape,
  isIc2ShapePass,
  type Ic2EvalOutcome,
} from './ic2SemanticShape'

const MODEL = 'gpt-5.6-luna'
const TODAY = '2026-09-14'
const SLEEP_MS = 120

type LiveCall =
  | { ok: true; goal: GoalSpec; latencyMs: number }
  | {
      ok: false
      kind: 'provider' | 'schema'
      error: string
      latencyMs: number
    }

type CaseResult = {
  id: string
  family: string
  utterance: string
  outcome: Ic2EvalOutcome
  pass: boolean
  missing: string[]
  latencyMs: number
  goalSnap: {
    requestKind: string
    aggregation: string | null
    measure: string | null
    groupBy: string[]
    orderBy: Array<{ field: string; direction: string }>
    limit: number | null
    temporalExpression: string | null
    dialogue: string
    inheritActive: boolean
  } | null
  error?: string
  isCriticalQa?: boolean
  falseSimplification: boolean
  falseConcreteMeasure: boolean
  falsePromotion: boolean
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function callLuna(
  utterance: string,
  semanticContext: unknown,
): Promise<LiveCall> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return {
      ok: false,
      kind: 'provider',
      error: 'missing_openai_key',
      latencyMs: 0,
    }
  }
  const started = Date.now()
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_completion_tokens: 900,
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
  const latencyMs = Date.now() - started
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const code = body?.error?.code ?? body?.error?.type ?? `http_${res.status}`
    return {
      ok: false,
      kind: 'provider',
      error: `provider_${res.status}_${String(code)}`,
      latencyMs,
    }
  }
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    return { ok: false, kind: 'provider', error: 'empty_content', latencyMs }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { ok: false, kind: 'schema', error: 'json_parse', latencyMs }
  }
  const goal = parseFlatGoalSpecPayload(parsed)
  if (!goal) {
    return { ok: false, kind: 'schema', error: 'schema_error', latencyMs }
  }
  return {
    ok: true,
    goal: normalizeGoalSpecTemporal(goal, TODAY),
    latencyMs,
  }
}

function snap(goal: GoalSpec): CaseResult['goalSnap'] {
  return {
    requestKind: goal.requestKind,
    aggregation: goal.aggregation,
    measure: goal.measure,
    groupBy: [...goal.groupBy],
    orderBy: goal.orderBy.map((o) => ({
      field: String(o.field),
      direction: o.direction,
    })),
    limit: goal.limit,
    temporalExpression: goal.temporal?.expression ?? null,
    dialogue: goal.dialogue,
    inheritActive: goal.inheritance?.fromActiveCollection === true,
  }
}

function detectFalseSimplification(c: Ic2Case, goal: GoalSpec): boolean {
  const richFamilies = new Set([
    'group_rank',
    'top_n',
    'comparison',
    'negation',
    'unsupported_rich',
    'critical_qa',
    'avg_min_max',
    'temporal_remainder',
  ])
  if (!richFamilies.has(c.family) && !c.isCriticalQa) return false
  if (c.family === 'critical_qa' && c.id === 'ic2-crit-show-them') return false
  if (goal.requestKind === 'unsupported') return false
  // Non-query families are not false simplification of a query shape.
  if (
    goal.requestKind === 'goal_plan' ||
    goal.requestKind === 'product_help' ||
    goal.requestKind === 'prepare_action'
  ) {
    return false
  }

  if (c.family === 'group_rank' || c.id === 'ic2-crit-month-most') {
    return (
      goal.aggregation === 'count' &&
      goal.groupBy.length === 0 &&
      goal.orderBy.length === 0 &&
      goal.limit == null
    )
  }
  if (
    c.family === 'temporal_remainder' ||
    c.id === 'ic2-crit-remaining-year'
  ) {
    return (
      goal.aggregation === 'count' &&
      !(goal.temporal?.expression && goal.temporal.expression.trim())
    )
  }
  if (c.family === 'top_n' || c.family === 'avg_min_max') {
    return (
      (goal.aggregation === 'count' ||
        goal.aggregation === 'list' ||
        goal.aggregation === 'sum') &&
      goal.groupBy.length === 0 &&
      goal.orderBy.length === 0 &&
      goal.limit == null
    )
  }
  if (
    c.family === 'comparison' ||
    c.family === 'negation' ||
    c.family === 'unsupported_rich'
  ) {
    return (
      goal.requestKind === 'domain_query' &&
      (goal.aggregation === 'count' ||
        goal.aggregation === 'list' ||
        goal.aggregation === 'sum') &&
      goal.groupBy.length === 0 &&
      goal.orderBy.length === 0 &&
      goal.limit == null
    )
  }
  return false
}

function detectFalseConcreteMeasure(c: Ic2Case, goal: GoalSpec): boolean {
  if (!c.falseConcreteMeasureSensitive) return false
  return goal.measure != null && !goal.ambiguities.some((a) => a.slot === 'measure')
}

function detectFalsePromotion(c: Ic2Case, goal: GoalSpec): boolean {
  if (!c.falsePromotionSensitive) return false
  // Analytics-only requests promoted to a concrete simple domain_query count/list/sum.
  return (
    goal.requestKind === 'domain_query' &&
    (goal.aggregation === 'count' ||
      goal.aggregation === 'list' ||
      goal.aggregation === 'sum') &&
    goal.groupBy.length === 0 &&
    goal.orderBy.length === 0 &&
    goal.limit == null
  )
}

async function evaluateCase(c: Ic2Case): Promise<CaseResult> {
  const live = await callLuna(c.utterance, c.semanticContext)
  if (!live.ok) {
    const outcome: Ic2EvalOutcome =
      live.kind === 'schema' ? 'SCHEMA_ERROR' : 'PROVIDER_ERROR'
    return {
      id: c.id,
      family: c.family,
      utterance: c.utterance,
      outcome,
      pass: false,
      missing: [],
      latencyMs: live.latencyMs,
      goalSnap: null,
      error: live.error,
      isCriticalQa: c.isCriticalQa,
      falseSimplification: false,
      falseConcreteMeasure: false,
      falsePromotion: false,
    }
  }
  const assessment = assessIc2SemanticShape(live.goal, c.expectation)
  return {
    id: c.id,
    family: c.family,
    utterance: c.utterance,
    outcome: assessment.outcome,
    pass: isIc2ShapePass(assessment.outcome),
    missing: assessment.missing,
    latencyMs: live.latencyMs,
    goalSnap: snap(live.goal),
    isCriticalQa: c.isCriticalQa,
    falseSimplification: detectFalseSimplification(c, live.goal),
    falseConcreteMeasure: detectFalseConcreteMeasure(c, live.goal),
    falsePromotion: detectFalsePromotion(c, live.goal),
  }
}

function rate(pass: number, total: number): number {
  if (total === 0) return 1
  return pass / total
}

async function main() {
  if ((process.env.G8_MODEL ?? MODEL).trim() !== MODEL) {
    console.error(`IC2 requires model ${MODEL}; refuse other G8_MODEL`)
    process.exit(2)
  }

  const stats = ic2CorpusStats()
  console.log(`IC2 live Luna eval — model=${MODEL} cases=${stats.total}`)

  const results: CaseResult[] = []
  for (const c of IC2_SEMANTIC_COMPLETENESS_CORPUS) {
    const r = await evaluateCase(c)
    results.push(r)
    const mark = r.pass ? 'PASS' : 'FAIL'
    console.log(
      `  [${mark}] ${r.id} ${r.outcome}` +
        (r.goalSnap
          ? ` agg=${r.goalSnap.aggregation} group=${r.goalSnap.groupBy.join('|') || '-'} order=${r.goalSnap.orderBy.length} lim=${r.goalSnap.limit} temp=${r.goalSnap.temporalExpression ?? '-'}`
          : ` err=${r.error}`),
    )
    await sleep(SLEEP_MS)
  }

  const schemaOk = results.filter((r) => r.outcome !== 'SCHEMA_ERROR').length
  const providerErr = results.filter((r) => r.outcome === 'PROVIDER_ERROR').length
  const schemaErr = results.filter((r) => r.outcome === 'SCHEMA_ERROR').length
  const falseSimpl = results.filter((r) => r.falseSimplification).length
  const falseMeasure = results.filter((r) => r.falseConcreteMeasure).length
  const falsePromo = results.filter((r) => r.falsePromotion).length

  const supported = results.filter((r) =>
    IC2_SEMANTIC_COMPLETENESS_CORPUS.find(
      (c) => c.id === r.id && c.isSupportedSimple,
    ),
  )
  const followUps = results.filter((r) =>
    IC2_SEMANTIC_COMPLETENESS_CORPUS.find((c) => c.id === r.id && c.isFollowUp),
  )
  const unsupportedRich = results.filter((r) =>
    IC2_SEMANTIC_COMPLETENESS_CORPUS.find(
      (c) => c.id === r.id && c.isUnsupportedRich,
    ),
  )

  const groupRank = results.filter((r) => r.family === 'group_rank')
  const remainder = results.filter((r) => r.family === 'temporal_remainder')
  const critical = results.filter((r) => r.isCriticalQa)

  const summary = {
    model: MODEL,
    corpusSize: stats.total,
    schemaSuccessRate: rate(schemaOk, results.length),
    schemaErrors: schemaErr,
    providerErrors: providerErr,
    falseSemanticSimplification: falseSimpl,
    falseSemanticSimplificationRate: rate(falseSimpl, results.length),
    falseConcreteMeasureGuess: falseMeasure,
    falseQueryPromotion: falsePromo,
    supportedSimplePassRate: rate(
      supported.filter((r) => r.pass).length,
      supported.length,
    ),
    followUpPassRate: rate(
      followUps.filter((r) => r.pass).length,
      followUps.length,
    ),
    unsupportedRichSafeRate: rate(
      unsupportedRich.filter((r) => r.pass).length,
      unsupportedRich.length,
    ),
    groupRank: {
      n: groupRank.length,
      pass: groupRank.filter((r) => r.pass).length,
      falseSimpl: groupRank.filter((r) => r.falseSimplification).length,
      outcomes: Object.fromEntries(
        groupRank.map((r) => [
          r.id,
          {
            outcome: r.outcome,
            snap: r.goalSnap,
            falseSimplification: r.falseSimplification,
          },
        ]),
      ),
    },
    temporalRemainder: {
      n: remainder.length,
      pass: remainder.filter((r) => r.pass).length,
      falseSimpl: remainder.filter((r) => r.falseSimplification).length,
      outcomes: Object.fromEntries(
        remainder.map((r) => [
          r.id,
          {
            outcome: r.outcome,
            snap: r.goalSnap,
            falseSimplification: r.falseSimplification,
          },
        ]),
      ),
    },
    criticalQa: Object.fromEntries(
      critical.map((r) => [
        r.id,
        {
          utterance: r.utterance,
          outcome: r.outcome,
          pass: r.pass,
          snap: r.goalSnap,
          falseSimplification: r.falseSimplification,
        },
      ]),
    ),
    failures: results
      .filter((r) => !r.pass || r.falseSimplification)
      .map((r) => ({
        id: r.id,
        outcome: r.outcome,
        missing: r.missing,
        snap: r.goalSnap,
        falseSimplification: r.falseSimplification,
      })),
  }

  const gates = {
    schemaSuccess100: summary.schemaSuccessRate === 1,
    providerError0: summary.providerErrors === 0,
    falseSimplification0: summary.falseSemanticSimplification === 0,
    falseConcreteMeasure0: summary.falseConcreteMeasureGuess === 0,
    falsePromotion0: summary.falseQueryPromotion === 0,
    supportedSimple98: summary.supportedSimplePassRate >= 0.98,
    followUp98: summary.followUpPassRate >= 0.98,
    unsupportedRich98: summary.unsupportedRichSafeRate >= 0.98,
    criticalMonthMostOk: (() => {
      const r = critical.find((x) => x.id === 'ic2-crit-month-most')
      return Boolean(r && r.pass && !r.falseSimplification)
    })(),
    criticalRemainingOk: (() => {
      const r = critical.find((x) => x.id === 'ic2-crit-remaining-year')
      return Boolean(r && r.pass && !r.falseSimplification)
    })(),
    criticalShowThemOk: (() => {
      const r = critical.find((x) => x.id === 'ic2-crit-show-them')
      return Boolean(r && r.pass)
    })(),
  }

  const allGates = Object.values(gates).every(Boolean)
  const outDir = resolve(
    process.cwd(),
    'src/features/assistant/v4/benchmark/artifacts',
  )
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'phase-ic2-luna-semantic-completeness.json')
  writeFileSync(
    outPath,
    JSON.stringify({ summary, gates, allGates, results }, null, 2),
  )

  console.log('\n=== IC2 SUMMARY ===')
  console.log(JSON.stringify({ summary: {
    ...summary,
    groupRank: { n: summary.groupRank.n, pass: summary.groupRank.pass, falseSimpl: summary.groupRank.falseSimpl },
    temporalRemainder: {
      n: summary.temporalRemainder.n,
      pass: summary.temporalRemainder.pass,
      falseSimpl: summary.temporalRemainder.falseSimpl,
    },
    criticalQa: summary.criticalQa,
  }, gates, allGates }, null, 2))
  console.log(`Wrote ${outPath}`)

  process.exit(allGates ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
