/**
 * TR1 — Live Luna temporal semantic preservation soak (SHADOW only).
 *
 *   G8_MODEL=gpt-5.6-luna npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v4/goalSpec/runTr1LunaTemporalSoak.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyDomainQuery, type DomainQuery } from '../domainQuery/domainQuery'
import { bindGoalSpec, makeGoalBinderContext } from './bindGoalSpec'
import { compileBoundGoalToDomainQuery } from './compileBoundGoalToDomainQuery'
import type { GoalSpec } from './goalSpec'
import { V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT } from './goalSpecInterpreterPrompt'
import {
  ASSISTANT_V5_GOALSPEC_JSON_SCHEMA,
  parseFlatGoalSpecPayload,
} from './goalSpecSchema'
import { normalizeGoalSpecTemporal } from './normalizeGoalSpecTemporal'
import {
  assessCanaryReentryEligibility,
  isCanaryReentryEligible,
} from '../authority/canaryReentryEligibility'
import {
  TR1_TEMPORAL_CORPUS,
  tr1CorpusStats,
  type Tr1Case,
} from './tr1TemporalCorpus'

const MODEL = 'gpt-5.6-luna'
const TODAY = '2026-09-14'
const SLEEP_MS = 120

type LiveCall =
  | { ok: true; goal: GoalSpec; latencyMs: number }
  | { ok: false; kind: 'provider' | 'schema'; error: string; latencyMs: number }

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function isFullCalendarMonth(from: string, to: string): boolean {
  const y = Number(from.slice(0, 4))
  const m = Number(from.slice(5, 7))
  if (from.slice(8, 10) !== '01') return false
  if (Number(to.slice(0, 4)) !== y || Number(to.slice(5, 7)) !== m) return false
  const last = new Date(y, m, 0).getDate()
  return Number(to.slice(8, 10)) === last
}

function isFullCalendarYear(from: string, to: string): boolean {
  return from.endsWith('-01-01') && to.endsWith('-12-31') && from.slice(0, 4) === to.slice(0, 4)
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
            semanticContextSummary: semanticContext ?? {
              previousGoalSummary: null,
            },
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

function activeFromContext(semanticContext: unknown): DomainQuery | null {
  const summary =
    semanticContext &&
    typeof semanticContext === 'object' &&
    'previousGoalSummary' in (semanticContext as object)
      ? (
          semanticContext as {
            previousGoalSummary?: {
              aggregation?: string
              temporalExpression?: string
              placeName?: string
            } | null
          }
        ).previousGoalSummary
      : null
  if (!summary) return null
  const rawAgg = summary.aggregation
  const aggregate =
    rawAgg === 'sum' || rawAgg === 'count'
      ? rawAgg
      : rawAgg === 'list'
        ? null
        : null
  return emptyDomainQuery({
    source: 'wedding',
    aggregate,
    measure: null,
    dateBinding:
      summary.temporalExpression === 'sierpień'
        ? {
            dimension: 'wedding.date',
            range: { from: '2026-08-01', to: '2026-08-31' },
          }
        : summary.temporalExpression === '2028'
          ? {
              dimension: 'wedding.date',
              range: { from: '2028-01-01', to: '2028-12-31' },
            }
          : summary.temporalExpression === '2027'
            ? {
                dimension: 'wedding.date',
                range: { from: '2027-01-01', to: '2027-12-31' },
              }
            : null,
    relations: summary.placeName
      ? [
          {
            relation: 'place',
            field: 'place.name',
            op: 'eq',
            value: summary.placeName,
          },
        ]
      : [],
  })
}

function isSemanticWidening(c: Tr1Case, goal: GoalSpec): boolean {
  if (!c.openOrPartial) return false
  const range = goal.temporal?.resolvedRange
  if (!range) return false
  // Open/remainder/from-now intent must not collapse to a full month/year.
  return (
    isFullCalendarYear(range.from, range.to) ||
    isFullCalendarMonth(range.from, range.to)
  )
}

function evaluateGoal(c: Tr1Case, goal: GoalSpec) {
  const bound = bindGoalSpec(
    goal,
    makeGoalBinderContext({
      activeCollectionQuery: activeFromContext(c.semanticContext),
    }),
  )

  if (bound.status === 'needs_clarification') {
    const reentry = assessCanaryReentryEligibility({
      goalSpec: goal,
      interpreterStatus: 'ok',
      resolverOutcome: 'needs_clarification',
      clarificationSlot:
        bound.clarification.ambiguousSlots[0] ??
        bound.clarification.missingSlots[0] ??
        'other',
    })
    return { boundStatus: bound.status as string, reentry, query: null }
  }
  if (bound.status === 'unsupported') {
    const reentry = assessCanaryReentryEligibility({
      goalSpec: goal,
      interpreterStatus:
        goal.requestKind === 'unsupported' ? 'unsupported' : 'ok',
      resolverOutcome: 'unsupported',
    })
    return { boundStatus: bound.status as string, reentry, query: null }
  }
  const compiled = compileBoundGoalToDomainQuery(bound.goal)
  const query = compiled.status === 'success' ? compiled.query : null
  const reentry = assessCanaryReentryEligibility({
    goalSpec: goal,
    boundGoal: bound.goal,
    domainQuery: query,
    interpreterStatus: 'ok',
    resolverOutcome: 'bound',
    domainQueryStatus: query ? undefined : 'invalid',
  })
  return { boundStatus: bound.status as string, reentry, query }
}

async function main() {
  if ((process.env.G8_MODEL ?? MODEL).trim() !== MODEL) {
    console.error(`TR1 requires model ${MODEL}`)
    process.exit(2)
  }
  const stats = tr1CorpusStats()
  console.log(`TR1 Luna temporal soak — model=${MODEL} cases=${stats.total}`)

  const results: Array<Record<string, unknown>> = []
  let falseTemporalAuthority = 0
  let semanticWidening = 0
  let providerErrors = 0
  let schemaErrors = 0
  let closedExpected = 0
  let closedPass = 0

  for (const c of TR1_TEMPORAL_CORPUS) {
    const live = await callLuna(c.utterance, c.semanticContext)
    if (!live.ok) {
      if (live.kind === 'provider') providerErrors++
      else schemaErrors++
      results.push({
        id: c.id,
        family: c.family,
        pass: false,
        error: live.error,
        kind: live.kind,
      })
      console.log(`  [FAIL] ${c.id} ${live.kind} ${live.error}`)
      await sleep(SLEEP_MS)
      continue
    }

    const { boundStatus, reentry, query } = evaluateGoal(c, live.goal)
    const eligible = isCanaryReentryEligible(reentry)
    const widening = isSemanticWidening(c, live.goal)
    const falseAuth = c.openOrPartial && eligible
    if (falseAuth) falseTemporalAuthority++
    if (widening) semanticWidening++
    if (c.expectClosedEligible) {
      closedExpected++
      if (eligible) closedPass++
    }

    const pass =
      !falseAuth &&
      !widening &&
      (!c.expectClosedEligible || eligible) &&
      true

    results.push({
      id: c.id,
      family: c.family,
      utterance: c.utterance,
      pass,
      eligible,
      expectClosedEligible: c.expectClosedEligible,
      openOrPartial: c.openOrPartial,
      falseAuth,
      widening,
      boundStatus,
      expression: live.goal.temporal?.expression ?? null,
      resolvedRange: live.goal.temporal?.resolvedRange ?? null,
      aggregation: live.goal.aggregation,
      reentryStatus: reentry.status,
      queryRange: query?.dateBinding?.range ?? null,
      latencyMs: live.latencyMs,
    })

    const tag = pass ? 'OK' : 'FAIL'
    console.log(
      `  [${tag}] ${c.id} eligible=${eligible} expr=${JSON.stringify(live.goal.temporal?.expression)} range=${JSON.stringify(live.goal.temporal?.resolvedRange)}`,
    )
    await sleep(SLEEP_MS)
  }

  const closedRate =
    closedExpected === 0 ? 1 : closedPass / closedExpected
  const gates = {
    falseTemporalAuthorityEligibility: falseTemporalAuthority,
    semanticWidening,
    supportedClosedRangeEligibility: closedRate,
    providerErrors,
    schemaErrors,
    caseCount: stats.total,
  }

  const verdict =
    falseTemporalAuthority === 0 &&
    semanticWidening === 0 &&
    closedRate >= 0.98 &&
    providerErrors === 0
      ? 'TEMPORAL_SOAK_PASS'
      : 'TEMPORAL_SOAK_FAIL'

  const outDir = resolve(
    process.cwd(),
    'src/features/assistant/v4/benchmark/artifacts',
  )
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'phase-tr1-luna-temporal-soak.json')
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        verdict,
        model: MODEL,
        today: TODAY,
        gates,
        corpus: stats,
        results,
      },
      null,
      2,
    ),
  )

  console.log('\nTR1 temporal soak gates:')
  console.log(`  falseTemporalAuthorityEligibility=${falseTemporalAuthority}`)
  console.log(`  semanticWidening=${semanticWidening}`)
  console.log(
    `  supportedClosedRangeEligibility=${(closedRate * 100).toFixed(1)}% (${closedPass}/${closedExpected})`,
  )
  console.log(`  providerErrors=${providerErrors}`)
  console.log(`  schemaErrors=${schemaErrors}`)
  console.log(`  caseCount=${stats.total}`)
  console.log(`  verdict=${verdict}`)
  console.log(`  artifact=${outPath}`)

  if (verdict !== 'TEMPORAL_SOAK_PASS') process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
