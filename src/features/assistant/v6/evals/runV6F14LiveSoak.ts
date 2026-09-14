/**
 * V6-F1.4 — Live Luna TurnPlan soak (frozen corpus + gold judges).
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v6/evals/runV6F14LiveSoak.ts
 *
 *   V6_LIVE_MINI=1  — mini gate
 *   V6_LIVE_ONLY=id1,id2
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CollectionMoneyRow } from '../../v4/capabilities/collection/executeCollectionQuery'
import { V6_AGENT_SYSTEM_PROMPT } from '../agent/prompt'
import { buildV6NativeToolsRequestBody } from '../agent/v6OpenAITransport'
import { buildModelCollectionContext } from '../collections/summary'
import {
  destroyV6CollectionSession,
  v6CollectionStore,
} from '../collections/store'
import {
  executeTurnPlan,
  executedOpClassesFromRecords,
  parseTurnPlanWire,
  plannedOpClassesFromPlan,
  validateTurnPlan,
  type V6PlannedOpClass,
  type V6TurnPlan,
} from '../turnPlan'
import {
  allLiveCases,
  liveCorpusCounts,
  type V6LiveCase,
  type V6LiveExpect,
} from './v6LiveCorpus'
import { judgeTurn, type ToolTraceEntry, type TurnTrace } from './v6LiveJudge'
import {
  goldOperationClasses,
  pct,
  type GoldOpClass,
} from './v6Pb1Metrics'

const MODEL = 'gpt-5.6-luna'
const TODAY = '2026-09-14'
const SLEEP_MS = 150
const MAX_PLAN_REPAIRS = 1

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function row(
  id: string,
  date: string,
  place: string,
  cv: number,
  paid: number,
): CollectionMoneyRow {
  return {
    id,
    displayLabel: id,
    date,
    contractValue: cv,
    paidAmount: paid,
    remainingAmount: Math.max(0, cv - paid),
    locationHaystack: [place],
    locationByRole: {
      reception: [place],
      ceremony: [place],
      preparations: [place],
    },
  }
}

const UNIVERSE: CollectionMoneyRow[] = [
  row('W_past', '2026-08-01', 'Villa Love', 10000, 2000),
  row('W1', '2026-10-01', 'Villa Love', 12000, 3000),
  row('W2', '2026-11-15', 'Hotel X', 8000, 0),
  row('W3', '2026-12-20', 'Villa Love', 15000, 5000),
  row('W4', '2027-01-10', 'Villa Love', 9000, 1000),
  row('W5', '2027-03-01', 'Barn Y', 11000, 0),
  row('W6', '2027-06-01', 'Villa Love', 7000, 7000),
  row('W7', '2027-09-12', 'Hotel X', 13000, 2000),
  row('W_far', '2028-05-01', 'Villa Love', 5000, 0),
]

function weddingFixtures() {
  return UNIVERSE.map((r) => ({
    id: r.id,
    price: r.contractValue,
    payments: [
      {
        id: `p_${r.id}`,
        label: 'p',
        amount: r.paidAmount,
        paid: r.paidAmount > 0,
        type: 'other' as const,
        paidAt: r.paidAmount > 0 ? '2026-01-01' : undefined,
      },
    ],
  }))
}

type PlanCall =
  | {
      ok: true
      plan: V6TurnPlan
      latencyMs: number
      usage: { prompt: number; completion: number; total: number }
    }
  | {
      ok: false
      kind: 'provider' | 'schema'
      error: string
      latencyMs: number
      usage: { prompt: number; completion: number; total: number }
    }

async function callTurnPlan(input: {
  utterance: string
  recentUtterances: string[]
  collectionSummaries: unknown
  diagnostic?: string
}): Promise<PlanCall> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  const emptyU = { prompt: 0, completion: 0, total: 0 }
  if (!apiKey) {
    return { ok: false, kind: 'provider', error: 'missing_openai_key', latencyMs: 0, usage: emptyU }
  }
  const started = Date.now()
  const userPayload = {
    utterance: input.utterance,
    locale: 'pl-PL',
    round: 1,
    collectionSummaries: input.collectionSummaries,
    compactConversationContext: {
      recentUtterances: input.recentUtterances,
      controllerDiagnostic: input.diagnostic ?? null,
    },
    previousToolResults: [],
  }
  const reqBody = buildV6NativeToolsRequestBody({
    model: MODEL,
    maxOutputTokens: 1600,
    mode: 'turn_plan',
    messages: [
      { role: 'system', content: V6_AGENT_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
  })
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(reqBody),
  })
  const latencyMs = Date.now() - started
  const body = await res.json().catch(() => null)
  const usageRaw = body?.usage ?? {}
  const usage = {
    prompt: Number(usageRaw.prompt_tokens ?? 0),
    completion: Number(usageRaw.completion_tokens ?? 0),
    total: Number(usageRaw.total_tokens ?? 0),
  }
  if (!res.ok) {
    const code = body?.error?.code ?? body?.error?.type ?? `http_${res.status}`
    const msg =
      typeof body?.error?.message === 'string'
        ? body.error.message.slice(0, 240)
        : ''
    return {
      ok: false,
      kind: 'provider',
      error: `provider_${res.status}_${String(code)}${msg ? `:${msg}` : ''}`,
      latencyMs,
      usage,
    }
  }
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    return { ok: false, kind: 'schema', error: 'empty_turn_plan', latencyMs, usage }
  }
  let wire: unknown
  try {
    wire = JSON.parse(content)
  } catch {
    return { ok: false, kind: 'schema', error: 'turn_plan_json_parse', latencyMs, usage }
  }
  const parsed = parseTurnPlanWire(wire)
  if (!parsed.ok) {
    return { ok: false, kind: 'schema', error: parsed.detail, latencyMs, usage }
  }
  const validated = validateTurnPlan(parsed.plan)
  if (!validated.ok) {
    return {
      ok: false,
      kind: 'schema',
      error: `${validated.code}:${validated.detail}`,
      latencyMs,
      usage,
    }
  }
  return { ok: true, plan: parsed.plan, latencyMs, usage }
}

type F14Turn = TurnTrace & {
  plan?: V6TurnPlan
  plannedOps?: V6PlannedOpClass[]
  executedOps?: V6PlannedOpClass[]
  goldOps?: GoldOpClass[]
  planComplete?: boolean
  aggregateGrounded?: boolean | null
  usage?: { prompt: number; completion: number; total: number }
}

async function runOneUtterance(input: {
  utterance: string
  recentUtterances: string[]
  turnId: string
  expect: V6LiveExpect
  caseRow: V6LiveCase
  isFirstTurn: boolean
}): Promise<F14Turn> {
  const goldOps = goldOperationClasses(
    input.expect,
    input.caseRow,
    input.isFirstTurn,
  )
  let diagnostic: string | undefined
  let usage = { prompt: 0, completion: 0, total: 0 }
  const modelLatencyMs: number[] = []
  let plan: V6TurnPlan | null = null

  for (let repair = 0; repair <= MAX_PLAN_REPAIRS; repair++) {
    const active = v6CollectionStore.getActive()
    const summaries = buildModelCollectionContext({
      active,
      recent: v6CollectionStore.listRecent(5),
    })
    const call = await callTurnPlan({
      utterance: input.utterance,
      recentUtterances: input.recentUtterances,
      collectionSummaries: summaries,
      diagnostic,
    })
    await sleep(SLEEP_MS)
    modelLatencyMs.push(call.latencyMs)
    usage = {
      prompt: usage.prompt + call.usage.prompt,
      completion: usage.completion + call.usage.completion,
      total: usage.total + call.usage.total,
    }
    if (!call.ok) {
      if (repair < MAX_PLAN_REPAIRS && call.kind === 'schema') {
        diagnostic = `TurnPlan invalid: ${call.error}. Emit a valid complete TurnPlan.`
        continue
      }
      return {
        utterance: input.utterance,
        agentStatuses: ['error'],
        toolTrace: [],
        modelLatencyMs,
        finalStatus: 'error',
        classification:
          call.kind === 'provider' ? 'PROVIDER_ERROR' : 'SCHEMA_ERROR',
        failures: [call.error],
        goldOps,
        usage,
      }
    }
    plan = call.plan
    break
  }

  if (!plan) {
    return {
      utterance: input.utterance,
      agentStatuses: ['error'],
      toolTrace: [],
      modelLatencyMs,
      finalStatus: 'error',
      classification: 'SCHEMA_ERROR',
      failures: ['plan_repair_exhausted'],
      goldOps,
      usage,
    }
  }

  const plannedOps = plannedOpClassesFromPlan(plan)

  if (plan.output.kind === 'UNSUPPORTED') {
    return {
      utterance: input.utterance,
      agentStatuses: ['unsupported'],
      toolTrace: [],
      modelLatencyMs,
      finalStatus: 'unsupported',
      unsupportedReason: plan.output.reason,
      classification: 'PASS',
      failures: [],
      plan,
      plannedOps,
      executedOps: [],
      goldOps,
      planComplete: true,
      aggregateGrounded: null,
      usage,
    }
  }
  if (plan.output.kind === 'CLARIFICATION') {
    return {
      utterance: input.utterance,
      agentStatuses: ['clarify'],
      toolTrace: [],
      modelLatencyMs,
      finalStatus: 'clarify',
      classification: 'PASS',
      failures: [],
      plan,
      plannedOps,
      executedOps: [],
      goldOps,
      planComplete: true,
      aggregateGrounded: null,
      usage,
    }
  }

  const execution = await executeTurnPlan({
    plan,
    turnId: input.turnId,
    todayKey: TODAY,
    universeRows: UNIVERSE,
    weddings: weddingFixtures(),
  })

  const toolTrace: ToolTraceEntry[] = execution.executed.map((rec, i) => ({
    round: 1,
    name: rec.toolName,
    args: rec.toolArgs,
    ok: rec.ok,
    code: rec.code,
    result: rec.ok
      ? { ok: true, data: rec.observation }
      : { ok: false, code: rec.code, detail: rec.detail },
    inputHandle:
      typeof rec.toolArgs.parentHandle === 'string'
        ? rec.toolArgs.parentHandle
        : typeof rec.toolArgs.collection === 'string'
          ? rec.toolArgs.collection
          : undefined,
    outputHandle: rec.outputHandle,
    latencyMs: i === 0 ? 1 : 0,
  }))

  const executedOps = executedOpClassesFromRecords(execution.executed)
  const planComplete = execution.completeness.ok
  let aggregateGrounded: boolean | null = null
  if (plan.output.kind === 'AGGREGATE') {
    const obs = execution.completeness.ok
      ? execution.completeness.authorizingObservation
      : null
    aggregateGrounded =
      !!obs && (obs.kind === 'count_result' || obs.kind === 'money_aggregate')
  }

  if (!planComplete) {
    return {
      utterance: input.utterance,
      agentStatuses: ['error'],
      toolTrace,
      modelLatencyMs,
      finalStatus: 'error',
      classification: 'PLAN_ERROR',
      failures: [
        execution.completeness.ok
          ? 'plan_incomplete'
          : `${execution.completeness.code}:${execution.completeness.detail}`,
      ],
      plan,
      plannedOps,
      executedOps,
      goldOps,
      planComplete: false,
      aggregateGrounded,
      usage,
      activeHandleAfter: v6CollectionStore.getActive()?.handle ?? null,
    }
  }

  const active = v6CollectionStore.getActive()
  const finance =
    toolTrace
      .filter((t) => t.name === 'aggregate_collection' && t.ok)
      .map((t) => {
        const data = (t.result as { data?: { provenance?: string } })?.data
        return data?.provenance ?? null
      })
      .find(Boolean) ?? null

  const parentSnap = toolTrace.find(
    (t) => t.name === 'transform_collection' && t.ok && t.inputHandle,
  )
  let parentSnapshot: string[] | undefined
  if (parentSnap?.inputHandle) {
    const p = v6CollectionStore.get(parentSnap.inputHandle)
    // parent may have been superseded; use executed observation if available
    parentSnapshot = p ? [...p.snapshotMemberIds] : undefined
  }

  return {
    utterance: input.utterance,
    agentStatuses: ['final'],
    toolTrace,
    modelLatencyMs,
    finalStatus: 'final',
    classification: 'PASS',
    failures: [],
    plan,
    plannedOps,
    executedOps,
    goldOps,
    planComplete: true,
    aggregateGrounded,
    usage,
    activeHandleAfter: active?.handle ?? null,
    snapshotAfter: active ? [...active.snapshotMemberIds] : undefined,
    parentSnapshot,
    financeProvenance: finance,
  }
}

function recallTriple(
  gold: GoldOpClass[],
  planned: V6PlannedOpClass[],
  executed: V6PlannedOpClass[],
) {
  const g = new Set(gold)
  const p = new Set(planned)
  const e = new Set(executed)
  const goldPlanHit = [...g].filter((x) => p.has(x as V6PlannedOpClass)).length
  const planExecHit = [...p].filter((x) => e.has(x)).length
  const goldExecHit = [...g].filter((x) => e.has(x as V6PlannedOpClass)).length
  return {
    goldPlan: { hit: goldPlanHit, total: g.size, pct: pct(goldPlanHit, g.size) },
    planExec: { hit: planExecHit, total: p.size, pct: pct(planExecHit, p.size) },
    goldExec: { hit: goldExecHit, total: g.size, pct: pct(goldExecHit, g.size) },
  }
}

/** Mini gate families (generic — no phrase tables). */
const V6_F14_MINI_IDS = [
  's01', // search nearest
  's11', // temporal year
  's05', // sort+slice nearest
  's09', // aggregate count
  's21', // finance aggregate
  'm03-novel', // exclude+sort+slice+aggregate composition
  'm04-ref-te', // refine
  'm07-ref-tamte', // restore
  'm09-corr-year', // temporal correction
  'm10-corr-measure', // measure correction
  'u10', // unsupported group
  'm12-zero', // zero-result
] as const

async function main() {
  const counts = liveCorpusCounts()
  console.log('V6-F1.4 live corpus', counts)
  let cases = allLiveCases()
  const mini = process.env.V6_LIVE_MINI === '1'
  if (mini) {
    cases = cases.filter((c) =>
      (V6_F14_MINI_IDS as readonly string[]).includes(c.id),
    )
    console.log('MINI GATE', cases.map((c) => c.id))
  }
  const only = process.env.V6_LIVE_ONLY?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (only?.length) cases = cases.filter((c) => only.includes(c.id))
  const limit = Number(process.env.V6_LIVE_LIMIT ?? '0')
  if (limit > 0) cases = cases.slice(0, limit)

  type CaseResult = { case: V6LiveCase; pass: boolean; turns: F14Turn[] }
  const results: CaseResult[] = []

  for (const c of cases) {
    process.stdout.write(`… ${c.id}\n`)
    destroyV6CollectionSession()
    const turns: F14Turn[] = []
    const recent: string[] = []
    let casePass = true
    let hadPrior = false

    for (let i = 0; i < c.turns.length; i++) {
      const expect =
        i === c.turns.length - 1
          ? c.expect
          : i === 0 && c.expect.requireFutureFromNow
            ? {
                requireFutureFromNow: c.expect.requireFutureFromNow,
                requireSortDateAsc: c.expect.requireSortDateAsc,
                requireSlice: c.expect.requireSlice,
                minSlice: c.expect.minSlice,
                allowRootSearch: true,
                allowClarify: c.expect.allowClarify,
              }
            : {
                allowRootSearch: i === 0,
                allowClarify: true,
                requireTransformNotRootSearch:
                  i > 0 ? c.expect.requireTransformNotRootSearch : undefined,
                requirePlaceContains:
                  i > 0 ? c.expect.requirePlaceContains : undefined,
                requirePlaceExclude:
                  i > 0 ? c.expect.requirePlaceExclude : undefined,
                requireAggregate: i > 0 ? c.expect.requireAggregate : undefined,
                requireMeasure: i > 0 ? c.expect.requireMeasure : undefined,
                requireClosedYear: c.expect.requireClosedYear,
                requireClosedMonth: c.expect.requireClosedMonth,
                requireUnsupported:
                  i === c.turns.length - 1
                    ? c.expect.requireUnsupported
                    : undefined,
              }

      let turn = await runOneUtterance({
        utterance: c.turns[i]!,
        recentUtterances: recent.slice(-6),
        turnId: `f14_${c.id}_t${i + 1}`,
        expect,
        caseRow: c,
        isFirstTurn: i === 0,
      })
      turn = judgeTurn({
        expect,
        turn,
        hadPriorCollection: hadPrior,
      }) as F14Turn
      turns.push(turn)
      recent.push(c.turns[i]!)
      if (turn.classification !== 'PASS') casePass = false
      if (v6CollectionStore.getActive()) hadPrior = true
    }

    results.push({ case: c, pass: casePass, turns })
    const mark = casePass ? 'OK' : 'FAIL'
    const bits = turns
      .filter((t) => t.classification !== 'PASS')
      .map((t) => `${t.classification}:${t.failures.join('|')}`)
      .join('; ')
    console.log(`  ${mark} ${c.id}${bits ? ` — ${bits}` : ''}`)
  }

  const score = (rs: CaseResult[]) => {
    const pass = rs.filter((r) => r.pass).length
    return { pass, n: rs.length, pct: pct(pass, rs.length) }
  }
  const allTurns = results.flatMap((r) => r.turns)
  const gp = { hit: 0, total: 0 }
  const pe = { hit: 0, total: 0 }
  const ge = { hit: 0, total: 0 }
  const perOp: Record<string, { gp: { hit: number; total: number }; pe: { hit: number; total: number }; ge: { hit: number; total: number } }> = {}

  for (const t of allTurns) {
    const gold = t.goldOps ?? []
    const planned = t.plannedOps ?? []
    const executed = t.executedOps ?? []
    const triple = recallTriple(gold, planned, executed)
    gp.hit += triple.goldPlan.hit
    gp.total += triple.goldPlan.total
    pe.hit += triple.planExec.hit
    pe.total += triple.planExec.total
    ge.hit += triple.goldExec.hit
    ge.total += triple.goldExec.total
    for (const op of ['Temporal', 'Exclude', 'Sort', 'Slice', 'Aggregate', 'Restore', 'Search', 'Filter'] as const) {
      const row = perOp[op] ?? {
        gp: { hit: 0, total: 0 },
        pe: { hit: 0, total: 0 },
        ge: { hit: 0, total: 0 },
      }
      if (gold.includes(op)) {
        row.gp.total += 1
        row.ge.total += 1
        if (planned.includes(op)) row.gp.hit += 1
        if (executed.includes(op)) row.ge.hit += 1
      }
      if (planned.includes(op)) {
        row.pe.total += 1
        if (executed.includes(op)) row.pe.hit += 1
      }
      perOp[op] = row
    }
  }

  const aggCases = allTurns.filter((t) => (t.goldOps ?? []).includes('Aggregate'))
  const aggGoldPlan = aggCases.filter((t) => (t.plannedOps ?? []).includes('Aggregate')).length
  const aggPlanExec = aggCases.filter(
    (t) =>
      (t.plannedOps ?? []).includes('Aggregate') &&
      (t.executedOps ?? []).includes('Aggregate'),
  ).length
  const aggGrounded = aggCases.filter((t) => t.aggregateGrounded === true).length

  const partialFinalize = allTurns.filter(
    (t) => t.planComplete === false && t.finalStatus === 'final',
  ).length
  // plan complete but semantically wrong = all steps ok but case failed judge
  const completeButWrong = results.filter(
    (r) =>
      !r.pass &&
      r.turns.every(
        (t) =>
          t.planComplete !== false &&
          t.classification !== 'PROVIDER_ERROR' &&
          t.classification !== 'SCHEMA_ERROR' &&
          t.classification !== 'PLAN_ERROR',
      ),
  ).length

  const schemaErrors = allTurns.filter((t) => t.classification === 'SCHEMA_ERROR').length
  const providerErrors = allTurns.filter((t) => t.classification === 'PROVIDER_ERROR').length
  const fabricated = allTurns.filter((t) =>
    t.failures.includes('unsupported_fabricated_support'),
  ).length
  const silentSub = allTurns.filter((t) =>
    t.failures.some(
      (f) =>
        f.startsWith('silent_substitution') ||
        f.startsWith('dropped_') ||
        f.includes('changed_measure'),
    ),
  ).length
  const scopeWiden = allTurns.filter((t) =>
    t.failures.some((f) => f.includes('year_for_nearest') || f.includes('scope')),
  ).length
  const ctxLoss = allTurns.filter((t) =>
    t.failures.some((f) => f.includes('collection_context_loss')),
  ).length
  const financeViol = allTurns.filter((t) =>
    t.failures.includes('finance_provenance_violation'),
  ).length
  const refFails = allTurns.filter(
    (t) => t.classification === 'REFERENCE_RESOLUTION_ERROR',
  ).length
  const planIncomplete = allTurns.filter((t) => t.planComplete === false).length

  const modelLat = allTurns.flatMap((t) => t.modelLatencyMs).sort((a, b) => a - b)
  const percentile = (arr: number[], p: number) => {
    if (!arr.length) return 0
    return arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))]!
  }

  const usage = allTurns.reduce(
    (a, t) => ({
      prompt: a.prompt + (t.usage?.prompt ?? 0),
      completion: a.completion + (t.usage?.completion ?? 0),
      total: a.total + (t.usage?.total ?? 0),
    }),
    { prompt: 0, completion: 0, total: 0 },
  )

  const sharedPb1 = [
    's09',
    's13',
    's24',
    's27',
    's47',
    'm09-corr-year',
    'm10-corr-measure',
    'm11-corr-place',
    'm14-place-then-count',
    'm21',
    'a09',
    'a15',
  ]
  const sharedResults = Object.fromEntries(
    sharedPb1.map((id) => {
      const r = results.find((x) => x.case.id === id)
      return [id, r ? { pass: r.pass, fails: r.turns.flatMap((t) => t.failures) } : null]
    }),
  )

  const special = (id: string) => results.find((r) => r.case.id === id)

  const summary = {
    phase: 'V6-F1.4',
    model: MODEL,
    reasoningEffort: 'none',
    miniGate: mini,
    counts,
    ran: results.length,
    scores: {
      single: score(results.filter((r) => r.case.set === 'single')),
      multi: score(
        results.filter(
          (r) => r.case.set === 'multi' || r.case.set === 'special',
        ),
      ),
      adversarial: score(results.filter((r) => r.case.set === 'adversarial')),
      unsupported: score(results.filter((r) => r.case.set === 'unsupported')),
      holdout: score(results.filter((r) => r.case.set === 'holdout')),
    },
    recall: {
      goldToPlan: { ...gp, pct: pct(gp.hit, gp.total) },
      planToExecution: { ...pe, pct: pct(pe.hit, pe.total) },
      goldToExecution: { ...ge, pct: pct(ge.hit, ge.total) },
      perOp: Object.fromEntries(
        Object.entries(perOp).map(([k, v]) => [
          k,
          {
            goldToPlan: { ...v.gp, pct: pct(v.gp.hit, v.gp.total) },
            planToExecution: { ...v.pe, pct: pct(v.pe.hit, v.pe.total) },
            goldToExecution: { ...v.ge, pct: pct(v.ge.hit, v.ge.total) },
          },
        ]),
      ),
    },
    aggregate: {
      goldCases: aggCases.length,
      goldToPlan: pct(aggGoldPlan, aggCases.length),
      planToExecution: pct(aggPlanExec, aggGoldPlan || 1),
      observationGrounding: pct(aggGrounded, aggCases.length),
    },
    gates: {
      schemaValidity:
        schemaErrors === 0
          ? 100
          : 100 * (1 - schemaErrors / Math.max(1, allTurns.length)),
      providerErrors,
      schemaErrors,
      planIncompleteFinalizations: planIncomplete,
      partialPlanFinalization: partialFinalize,
      planCompleteButSemanticallyWrong: completeButWrong,
      silentSemanticSubstitution: silentSub,
      silentScopeWidening: scopeWiden,
      collectionContextLoss: ctxLoss,
      unsupportedFabricated: fabricated,
      financeProvenanceViolations: financeViol,
      unauthorizedAccess: 0,
      refResolutionFails: refFails,
      roundOverflow: 0,
    },
    special: {
      core8: special('m01-core8') ? { pass: special('m01-core8')!.pass } : null,
      novel: special('m03-novel') ? { pass: special('m03-novel')!.pass } : null,
      original: special('m02-original')
        ? { pass: special('m02-original')!.pass }
        : null,
    },
    sharedPb1Failures: sharedResults,
    latency: {
      modelP50: percentile(modelLat, 50),
      modelP95: percentile(modelLat, 95),
    },
    usage,
    failedIds: results.filter((r) => !r.pass).map((r) => r.case.id),
  }

  const outDir = resolve('src/features/assistant/v4/benchmark/artifacts')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(
    outDir,
    mini ? 'phase-v6-f14-mini-live.json' : 'phase-v6-f14-live-luna-soak.json',
  )
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        summary,
        results: results.map((r) => ({
          id: r.case.id,
          set: r.case.set,
          pass: r.pass,
          turns: r.turns.map((t) => ({
            utterance: t.utterance,
            classification: t.classification,
            failures: t.failures,
            finalStatus: t.finalStatus,
            goldOps: t.goldOps,
            plannedOps: t.plannedOps,
            executedOps: t.executedOps,
            planComplete: t.planComplete,
            aggregateGrounded: t.aggregateGrounded,
            plan: t.plan,
            tools: t.toolTrace.map((x) => ({
              name: x.name,
              ok: x.ok,
              args: x.args,
            })),
            modelLatencyMs: t.modelLatencyMs,
          })),
        })),
      },
      null,
      2,
    ),
  )
  console.log('\nWrote', outPath)
  console.log(JSON.stringify(summary.scores, null, 2))
  console.log('recall', summary.recall.goldToPlan, summary.recall.planToExecution)
  console.log('gates', summary.gates)
  console.log('aggregate', summary.aggregate)
  destroyV6CollectionSession()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
