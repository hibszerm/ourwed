/**
 * V6-CRA2.1 — Fresh paraphrased NL validation for the three hardening classes.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v6/evals/runV6Cra21PlannerValidation.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { V6_AGENT_SYSTEM_PROMPT } from '../agent/prompt'
import { buildV6NativeToolsRequestBody } from '../agent/v6OpenAITransport'
import { checkTurnPlanCapability } from '../capability/checkTurnPlanCapability'
import type { V6CollectionSummary } from '../collections/summary'
import { parseTurnPlanWire } from '../turnPlan/parse'
import { validateTurnPlan } from '../turnPlan/validate'
import type { V6TurnPlan } from '../turnPlan/types'

const MODEL = 'gpt-5.6-luna'
const SLEEP_MS = 150

type Case = {
  id: string
  class: 'month' | 'ranking' | 'inspect_list' | 'aggregate'
  utterance: string
  priorUtterances: string[]
  collectionSummaries: V6CollectionSummary[]
  judge: (plan: V6TurnPlan) => { pass: boolean; detail: string }
}

function summary(
  partial: Partial<V6CollectionSummary> & { handle: string },
): V6CollectionSummary {
  return {
    handle: partial.handle,
    active: partial.active ?? true,
    source: partial.source ?? 'wedding',
    totalCount: partial.totalCount ?? 1,
    ordering: partial.ordering ?? null,
    parentHandle: partial.parentHandle ?? null,
    temporalSummary: partial.temporalSummary ?? null,
    placeSummary: partial.placeSummary ?? null,
    excludePlaceSummary: partial.excludePlaceSummary ?? null,
    sliceSummary: partial.sliceSummary ?? null,
    preview: partial.preview ?? [
      { ordinal: 1, displayName: 'Anna & Piotr', date: '2026-10-12' },
    ],
    lineageDepth: partial.lineageDepth ?? 0,
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function hasClosedMonth(plan: V6TurnPlan): boolean {
  for (const step of plan.steps) {
    if (step.kind === 'SEARCH_COLLECTION') {
      const t = step.search.relativeTemporal
      if (t?.kind === 'closed_calendar_month' && t.month >= 1 && t.month <= 12) {
        return true
      }
    }
    if (step.kind === 'TRANSFORM_COLLECTION') {
      for (const op of step.ops) {
        if (
          op.op === 'RelativeTemporal' &&
          op.temporal.kind === 'closed_calendar_month' &&
          op.temporal.month >= 1 &&
          op.temporal.month <= 12
        ) {
          return true
        }
      }
    }
  }
  return false
}

function hasSortSlice(
  plan: V6TurnPlan,
  field: string,
  direction: 'asc' | 'desc',
  limit: number,
): boolean {
  for (const step of plan.steps) {
    if (step.kind === 'SEARCH_COLLECTION') {
      const sortOk =
        step.search.sort?.field === field &&
        step.search.sort.direction === direction
      const sliceOk = step.search.slice?.limit === limit
      if (sortOk && sliceOk) return true
    }
    if (step.kind === 'TRANSFORM_COLLECTION') {
      const sortOk = step.ops.some(
        (op) =>
          op.op === 'Sort' &&
          op.sort.field === field &&
          op.sort.direction === direction,
      )
      const sliceOk = step.ops.some(
        (op) => op.op === 'Slice' && op.slice.limit === limit,
      )
      if (sortOk && sliceOk) return true
    }
  }
  return false
}

function inspectHas(plan: V6TurnPlan, concept: string): boolean {
  return plan.steps.some(
    (s) => s.kind === 'INSPECT_RESOURCE' && s.concepts.includes(concept as never),
  )
}

function relatedHas(plan: V6TurnPlan, relation: string): boolean {
  return plan.steps.some(
    (s) => s.kind === 'LIST_RELATED' && s.relation === relation,
  )
}

const near = summary({ handle: 'col_near', totalCount: 1 })

const CASES: Case[] = [
  {
    id: 'cra21-m1',
    class: 'month',
    utterance:
      'Pokaż śluby zaplanowane na październik 2026, na których zadatek nie jest jeszcze opłacony.',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const ok =
        plan.output.kind === 'COLLECTION' &&
        hasClosedMonth(plan) &&
        plan.steps.some((s) => {
          if (s.kind === 'SEARCH_COLLECTION') {
            return s.search.conceptFilters?.some(
              (p) => p.concept === 'FIN.DEPOSIT_PAID',
            )
          }
          if (s.kind === 'TRANSFORM_COLLECTION') {
            return s.ops.some(
              (op) =>
                op.op === 'ConceptFilter' &&
                op.predicate.concept === 'FIN.DEPOSIT_PAID',
            )
          }
          return false
        })
      return { pass: ok, detail: ok ? 'month+deposit' : 'missing month/deposit' }
    },
  },
  {
    id: 'cra21-m2',
    class: 'month',
    utterance: 'Jakie mam śluby w następnym miesiącu kalendarzowym?',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const ok = plan.output.kind === 'COLLECTION' && hasClosedMonth(plan)
      return { pass: ok, detail: ok ? 'next-month closed' : 'no closed month' }
    },
  },
  {
    id: 'cra21-m3',
    class: 'month',
    utterance: 'Wylistuj zlecenia z listopada 2026.',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const ok = plan.output.kind === 'COLLECTION' && hasClosedMonth(plan)
      return { pass: ok, detail: ok ? 'nov2026' : 'no closed month' }
    },
  },
  {
    id: 'cra21-m4',
    class: 'month',
    utterance: 'Pokaż tylko śluby z marca 2027.',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const ok = plan.output.kind === 'COLLECTION' && hasClosedMonth(plan)
      return { pass: ok, detail: ok ? 'mar2027' : 'no closed month' }
    },
  },
  {
    id: 'cra21-r1',
    class: 'ranking',
    utterance: 'Który ślub ma największą pozostałą kwotę do zapłaty?',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const ok =
        plan.output.kind === 'COLLECTION' &&
        (hasSortSlice(plan, 'FIN.REMAINING_TO_PAY', 'desc', 1) ||
          hasSortSlice(plan, 'remaining_amount', 'desc', 1))
      return {
        pass: ok,
        detail: ok ? 'remaining desc1' : 'missing sort+slice remaining',
      }
    },
  },
  {
    id: 'cra21-r2',
    class: 'ranking',
    utterance: 'Wskaż zlecenie z najmniejszą kwotą pozostałą do zapłaty.',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const ok =
        plan.output.kind === 'COLLECTION' &&
        (hasSortSlice(plan, 'FIN.REMAINING_TO_PAY', 'asc', 1) ||
          hasSortSlice(plan, 'remaining_amount', 'asc', 1))
      return { pass: ok, detail: ok ? 'remaining asc1' : 'missing asc sort' }
    },
  },
  {
    id: 'cra21-r3',
    class: 'ranking',
    utterance: 'Pokaż trzy śluby o najwyższej wartości umowy.',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const ok =
        plan.output.kind === 'COLLECTION' &&
        (hasSortSlice(plan, 'FIN.CONTRACT_VALUE', 'desc', 3) ||
          hasSortSlice(plan, 'contract_value', 'desc', 3))
      return { pass: ok, detail: ok ? 'cv top3' : 'missing cv sort+slice' }
    },
  },
  {
    id: 'cra21-r4',
    class: 'ranking',
    utterance: 'Które zlecenie ma najwyższą łączną wpłaconą kwotę?',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const ok =
        plan.output.kind === 'COLLECTION' &&
        (hasSortSlice(plan, 'FIN.TOTAL_PAID', 'desc', 1) ||
          hasSortSlice(plan, 'paid_amount', 'desc', 1))
      return {
        pass: ok,
        detail: ok ? 'total paid rank' : 'missing paid sort+slice',
      }
    },
  },
  {
    id: 'cra21-r5',
    class: 'ranking',
    utterance: 'Znajdź ślub z największym uzgodnionym zadatkiem.',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const ok =
        plan.output.kind === 'COLLECTION' &&
        hasSortSlice(plan, 'FIN.AGREED_DEPOSIT', 'desc', 1)
      return {
        pass: ok,
        detail: ok ? 'deposit rank' : 'missing deposit sort+slice',
      }
    },
  },
  {
    id: 'cra21-a1',
    class: 'aggregate',
    utterance: 'Ile łącznie pozostało do zapłaty na nadchodzących ślubach?',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const agg = plan.steps.find((s) => s.kind === 'AGGREGATE_COLLECTION')
      const hasRank = plan.steps.some((s) => {
        if (s.kind === 'SEARCH_COLLECTION') {
          return s.search.sort != null && s.search.slice != null
        }
        return false
      })
      const ok =
        plan.output.kind === 'AGGREGATE' &&
        !!agg &&
        agg.kind === 'AGGREGATE_COLLECTION' &&
        agg.aggregation === 'sum' &&
        (agg.measure === 'FIN.REMAINING_TO_PAY' ||
          agg.measure === 'remaining_amount') &&
        !hasRank
      return {
        pass: ok,
        detail: ok ? 'pure sum remaining' : 'expected aggregate without ranking',
      }
    },
  },
  {
    id: 'cra21-a2',
    class: 'aggregate',
    utterance: 'Policz ile mam nadchodzących ślubów.',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const agg = plan.steps.find((s) => s.kind === 'AGGREGATE_COLLECTION')
      const ok =
        plan.output.kind === 'AGGREGATE' &&
        !!agg &&
        agg.kind === 'AGGREGATE_COLLECTION' &&
        agg.aggregation === 'count'
      return { pass: ok, detail: ok ? 'count' : 'expected count aggregate' }
    },
  },
  {
    id: 'cra21-l1',
    class: 'inspect_list',
    utterance: 'Jaki pakiet mają wybrany?',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [near],
    judge: (plan) => {
      const ok =
        plan.output.kind === 'DETAIL' &&
        inspectHas(plan, 'PKG.NAME') &&
        !relatedHas(plan, 'EXTRAS') &&
        !relatedHas(plan, 'PACKAGE_ITEMS')
      return { pass: ok, detail: ok ? 'PKG.NAME inspect' : 'expected inspect name' }
    },
  },
  {
    id: 'cra21-l2',
    class: 'inspect_list',
    utterance: 'Wymień dodatki do pakietu przy tym zleceniu.',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [near],
    judge: (plan) => {
      const ok = plan.output.kind === 'DETAIL' && relatedHas(plan, 'EXTRAS')
      return { pass: ok, detail: ok ? 'EXTRAS list' : 'expected LIST EXTRAS' }
    },
  },
  {
    id: 'cra21-l3',
    class: 'inspect_list',
    utterance: 'Pokaż pozycje wchodzące w skład pakietu.',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [near],
    judge: (plan) => {
      const ok =
        plan.output.kind === 'DETAIL' && relatedHas(plan, 'PACKAGE_ITEMS')
      return {
        pass: ok,
        detail: ok ? 'PACKAGE_ITEMS' : 'expected PACKAGE_ITEMS',
      }
    },
  },
  {
    id: 'cra21-l4',
    class: 'inspect_list',
    utterance: 'Jaki jest status umowy dla tego ślubu?',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [near],
    judge: (plan) => {
      const ok =
        plan.output.kind === 'DETAIL' && inspectHas(plan, 'CONTRACT.STATUS')
      return {
        pass: ok,
        detail: ok ? 'CONTRACT.STATUS' : 'expected inspect status',
      }
    },
  },
]

async function callTurnPlan(input: {
  utterance: string
  recentUtterances: string[]
  collectionSummaries: unknown
}): Promise<
  | { ok: true; plan: V6TurnPlan; latencyMs: number }
  | { ok: false; error: string; latencyMs: number }
> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return { ok: false, error: 'missing_openai_key', latencyMs: 0 }
  const started = Date.now()
  const userPayload = {
    utterance: input.utterance,
    locale: 'pl-PL',
    round: 1,
    todayKey: '2026-09-15',
    collectionSummaries: input.collectionSummaries,
    compactConversationContext: {
      recentUtterances: input.recentUtterances,
      controllerDiagnostic: null,
    },
    previousToolResults: [],
  }
  const reqBody = buildV6NativeToolsRequestBody({
    model: MODEL,
    maxOutputTokens: 1800,
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
  if (!res.ok) {
    return {
      ok: false,
      error: `provider_${res.status}:${String(body?.error?.message ?? '').slice(0, 160)}`,
      latencyMs,
    }
  }
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    return { ok: false, error: 'empty_content', latencyMs }
  }
  let wire: unknown
  try {
    wire = JSON.parse(content)
  } catch {
    return { ok: false, error: 'json_parse', latencyMs }
  }
  const parsed = parseTurnPlanWire(wire)
  if (!parsed.ok) return { ok: false, error: parsed.detail, latencyMs }
  const validated = validateTurnPlan(parsed.plan)
  if (!validated.ok) {
    return { ok: false, error: `${validated.code}:${validated.detail}`, latencyMs }
  }
  return { ok: true, plan: parsed.plan, latencyMs }
}

async function main() {
  const only = process.env.V6_CRA21_ONLY?.split(',').map((s) => s.trim()).filter(Boolean)
  const selected = only?.length ? CASES.filter((c) => only.includes(c.id)) : CASES
  const results: Array<{
    id: string
    class: string
    pass: boolean
    detail: string
    latencyMs: number
  }> = []

  console.log('V6-CRA2.1 planner NL validation', {
    model: MODEL,
    n: selected.length,
  })

  for (const c of selected) {
    const call = await callTurnPlan({
      utterance: c.utterance,
      recentUtterances: c.priorUtterances,
      collectionSummaries: c.collectionSummaries,
    })
    if (!call.ok) {
      results.push({
        id: c.id,
        class: c.class,
        pass: false,
        detail: call.error,
        latencyMs: call.latencyMs,
      })
      console.log(`FAIL ${c.id} [${c.class}] ${call.error}`)
      await sleep(SLEEP_MS)
      continue
    }
    const cap = checkTurnPlanCapability(call.plan)
    const judged = c.judge(call.plan)
    const pass = judged.pass && cap.verdict === 'SUPPORTED'
    results.push({
      id: c.id,
      class: c.class,
      pass,
      detail: judged.pass
        ? judged.detail
        : `${judged.detail}; cap=${cap.verdict}:${cap.code}`,
      latencyMs: call.latencyMs,
    })
    console.log(
      `${pass ? 'PASS' : 'FAIL'} ${c.id} [${c.class}] ${judged.detail} (${call.latencyMs}ms)`,
    )
    await sleep(SLEEP_MS)
  }

  const byClass = (cls: Case['class']) =>
    results.filter((r) => r.class === cls)
  const rate = (rows: typeof results) =>
    rows.length ? rows.filter((r) => r.pass).length / rows.length : 1
  const passed = results.filter((r) => r.pass).length
  const out = {
    model: MODEL,
    passed,
    total: results.length,
    rate: passed / results.length,
    month: {
      passed: byClass('month').filter((r) => r.pass).length,
      total: byClass('month').length,
      rate: rate(byClass('month')),
    },
    ranking: {
      passed: byClass('ranking').filter((r) => r.pass).length,
      total: byClass('ranking').length,
      rate: rate(byClass('ranking')),
    },
    inspect_list: {
      passed: byClass('inspect_list').filter((r) => r.pass).length,
      total: byClass('inspect_list').length,
      rate: rate(byClass('inspect_list')),
    },
    aggregate: {
      passed: byClass('aggregate').filter((r) => r.pass).length,
      total: byClass('aggregate').length,
      rate: rate(byClass('aggregate')),
    },
    results,
  }
  const outDir = resolve('src/features/assistant/v4/benchmark/artifacts')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'phase-v6-cra21-planner-nl.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(
    `CRA2.1 NL: ${passed}/${results.length} (${(out.rate * 100).toFixed(1)}%) → ${outPath}`,
  )
  const targetClassesOk =
    out.month.rate === 1 &&
    out.ranking.rate === 1 &&
    out.inspect_list.rate === 1 &&
    out.aggregate.rate === 1
  if (!targetClassesOk) process.exitCode = 2
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
