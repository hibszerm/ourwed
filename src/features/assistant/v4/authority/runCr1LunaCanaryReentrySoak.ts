/**
 * CR1 — Live Luna canary re-entry soak (shadow contract; no mode change).
 *
 *   G8_MODEL=gpt-5.6-luna npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v4/authority/runCr1LunaCanaryReentrySoak.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyDomainQuery, type DomainQuery } from '../domainQuery/domainQuery'
import { bindGoalSpec, makeGoalBinderContext } from '../goalSpec/bindGoalSpec'
import { compileBoundGoalToDomainQuery } from '../goalSpec/compileBoundGoalToDomainQuery'
import type { GoalSpec } from '../goalSpec/goalSpec'
import { V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT } from '../goalSpec/goalSpecInterpreterPrompt'
import {
  ASSISTANT_V5_GOALSPEC_JSON_SCHEMA,
  parseFlatGoalSpecPayload,
} from '../goalSpec/goalSpecSchema'
import { normalizeGoalSpecTemporal } from '../goalSpec/normalizeGoalSpecTemporal'
import {
  assessCanaryReentryEligibility,
  isCanaryReentryEligible,
} from './canaryReentryEligibility'
import {
  CR1_CANARY_REENTRY_CORPUS,
  cr1CorpusStats,
  type Cr1Case,
} from './cr1CanaryReentryCorpus'

const MODEL = 'gpt-5.6-luna'
const TODAY = '2026-09-14'
const SLEEP_MS = 120

type LiveCall =
  | { ok: true; goal: GoalSpec; latencyMs: number }
  | { ok: false; kind: 'provider' | 'schema'; error: string; latencyMs: number }

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

function activeFromContext(semanticContext: unknown): DomainQuery | null {
  const summary =
    semanticContext &&
    typeof semanticContext === 'object' &&
    'previousGoalSummary' in (semanticContext as object)
      ? (
          semanticContext as {
            previousGoalSummary?: {
              aggregation?: string
              measure?: string
              placeName?: string
              temporalExpression?: string
            }
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
    measure: (summary.measure as 'wedding.paid_amount' | null) ?? null,
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

function isSilentSimplification(c: Cr1Case, goal: GoalSpec): boolean {
  if (!c.richSimplificationSensitive) return false
  if (goal.requestKind === 'unsupported') return false
  if (
    goal.requestKind === 'goal_plan' ||
    goal.requestKind === 'product_help' ||
    goal.requestKind === 'prepare_action'
  ) {
    return false
  }
  const richOps =
    goal.groupBy.length > 0 ||
    goal.orderBy.length > 0 ||
    goal.limit != null ||
    goal.aggregation === 'rank' ||
    goal.aggregation === 'group' ||
    goal.aggregation === 'avg' ||
    goal.aggregation === 'min' ||
    goal.aggregation === 'max'
  if (richOps) return false

  // Remainder family: temporal expression required (not unrestricted count)
  if (
    c.id.includes('remaining') ||
    c.id.includes('from-now') ||
    c.id.includes('rest-month') ||
    c.id.includes('after-today') ||
    c.id.includes('before-oct')
  ) {
    const expr = goal.temporal?.expression?.trim()
    return goal.aggregation === 'count' && !expr
  }

  // Other rich: plain count/list/sum without group/order/limit/named constraint
  if (goal.targets.some((t) => t.kind === 'named')) return false
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

function evaluateGoal(c: Cr1Case, goal: GoalSpec) {
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
    console.error(`CR1 requires model ${MODEL}`)
    process.exit(2)
  }
  const stats = cr1CorpusStats()
  console.log(`CR1 Luna soak — model=${MODEL} cases=${stats.total}`)

  const results: Array<Record<string, unknown>> = []
  let falseAuthority = 0
  let silentSimpl = 0
  let providerErrors = 0
  let schemaErrors = 0
  let eligibleExpected = 0
  let eligiblePass = 0

  for (const c of CR1_CANARY_REENTRY_CORPUS) {
    const live = await callLuna(c.utterance, c.semanticContext)
    if (!live.ok) {
      if (live.kind === 'provider') providerErrors++
      else schemaErrors++
      results.push({
        id: c.id,
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
    const falseAuth = !c.expectEligible && eligible
    const missElig = c.expectEligible && !eligible
    const simpl = isSilentSimplification(c, live.goal)
    if (falseAuth) falseAuthority++
    if (simpl) silentSimpl++
    if (c.expectEligible) {
      eligibleExpected++
      if (eligible) eligiblePass++
    }

    const pass = !falseAuth && !simpl && !missElig
    results.push({
      id: c.id,
      class: c.class,
      expectEligible: c.expectEligible,
      eligible,
      pass,
      falseAuthority: falseAuth,
      silentSimplification: simpl,
      boundStatus,
      reentryStatus: reentry.status,
      reasons:
        reentry.status === 'ineligible' ? reentry.reasonCodes : undefined,
      snap: {
        requestKind: live.goal.requestKind,
        aggregation: live.goal.aggregation,
        groupBy: live.goal.groupBy,
        orderBy: live.goal.orderBy.length,
        limit: live.goal.limit,
        temporal: live.goal.temporal?.expression ?? null,
        resolved: live.goal.temporal?.resolvedRange ?? null,
        dqAgg: query?.aggregate ?? null,
        dqFrom: query?.dateBinding?.range.from ?? null,
      },
      latencyMs: live.latencyMs,
    })
    console.log(
      `  [${pass ? 'PASS' : 'FAIL'}] ${c.id} elig=${eligible} expect=${c.expectEligible} bound=${boundStatus}` +
        ` agg=${live.goal.aggregation} temp=${live.goal.temporal?.expression ?? '-'}`,
    )
    await sleep(SLEEP_MS)
  }

  const supportedIc1Rate =
    eligibleExpected === 0 ? 1 : eligiblePass / eligibleExpected
  const gates = {
    falseAuthority0: falseAuthority === 0,
    silentSimplification0: silentSimpl === 0,
    supportedIc1Eligibility98: supportedIc1Rate >= 0.98,
    providerError0: providerErrors === 0,
    schemaError0: schemaErrors === 0,
  }
  const allGates = Object.values(gates).every(Boolean)

  const summary = {
    model: MODEL,
    corpusSize: stats.total,
    falseAuthorityEligibility: falseAuthority,
    silentSemanticSimplification: silentSimpl,
    supportedIc1EligibilityRate: supportedIc1Rate,
    providerErrors,
    schemaErrors,
    gates,
    allGates,
    critical: Object.fromEntries(
      results
        .filter((r) => String(r.id).startsWith('cr1-crit'))
        .map((r) => [r.id, r]),
    ),
    failures: results.filter((r) => r.pass === false),
  }

  const outDir = resolve(
    process.cwd(),
    'src/features/assistant/v4/benchmark/artifacts',
  )
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'phase-cr1-luna-canary-reentry-soak.json')
  writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2))
  console.log('\n=== CR1 SOAK SUMMARY ===')
  console.log(JSON.stringify(summary, null, 2))
  console.log(`Wrote ${outPath}`)
  process.exit(allGates ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
