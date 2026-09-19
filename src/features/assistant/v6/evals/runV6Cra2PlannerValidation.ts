/**
 * V6-CRA2 — Bounded natural-language planner validation (~24 semantic classes).
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v6/evals/runV6Cra2PlannerValidation.ts
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

type Cra2Case = {
  id: string
  domain: string
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
    totalCount: partial.totalCount ?? 3,
    ordering: partial.ordering ?? null,
    parentHandle: partial.parentHandle ?? null,
    temporalSummary: partial.temporalSummary ?? null,
    placeSummary: partial.placeSummary ?? null,
    excludePlaceSummary: partial.excludePlaceSummary ?? null,
    sliceSummary: partial.sliceSummary ?? null,
    preview: partial.preview ?? [],
    lineageDepth: partial.lineageDepth ?? 0,
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function hasConceptFilter(plan: V6TurnPlan, concept: string): boolean {
  for (const step of plan.steps) {
    if (step.kind === 'SEARCH_COLLECTION') {
      if (step.search.conceptFilters?.some((p) => p.concept === concept)) {
        return true
      }
    }
    if (step.kind === 'TRANSFORM_COLLECTION') {
      if (
        step.ops.some(
          (op) => op.op === 'ConceptFilter' && op.predicate.concept === concept,
        )
      ) {
        return true
      }
    }
  }
  return false
}

function inspectConcepts(plan: V6TurnPlan): string[] {
  const out: string[] = []
  for (const step of plan.steps) {
    if (step.kind === 'INSPECT_RESOURCE') out.push(...step.concepts)
    if (step.kind === 'INSPECT_WEDDING') {
      out.push(`DR1:${step.detailSelector}`)
    }
  }
  return out
}

function hasRelation(plan: V6TurnPlan, relation: string): boolean {
  return plan.steps.some(
    (s) => s.kind === 'LIST_RELATED' && s.relation === relation,
  )
}

function usesHandle(plan: V6TurnPlan, handle: string): boolean {
  return plan.steps.some((s) => {
    if (
      s.kind === 'TRANSFORM_COLLECTION' ||
      s.kind === 'AGGREGATE_COLLECTION' ||
      s.kind === 'INSPECT_RESOURCE' ||
      s.kind === 'INSPECT_WEDDING' ||
      s.kind === 'LIST_RELATED'
    ) {
      return s.inputHandle === handle
    }
    if (s.kind === 'RESTORE_COLLECTION') return s.inputHandle === handle
    return false
  })
}

const nearestOne = summary({
  handle: 'col_near',
  totalCount: 1,
  temporalSummary: 'future_from_now',
  sliceSummary: 'limit:1',
  preview: [{ ordinal: 1, displayName: 'Anna & Piotr', date: '2026-10-12' }],
})

const futureThree = summary({
  handle: 'col_f3',
  totalCount: 3,
  temporalSummary: 'future_from_now',
  sliceSummary: 'limit:3',
  preview: [
    { ordinal: 1, displayName: 'A', date: '2026-10-01' },
    { ordinal: 2, displayName: 'B', date: '2026-11-01' },
    { ordinal: 3, displayName: 'C', date: '2026-12-01' },
  ],
})

const CASES: Cra2Case[] = [
  {
    id: 'cra2-nl-01-unsigned',
    domain: 'contract',
    utterance: 'Z tych trzech pokaż tylko te bez podpisanej umowy.',
    priorUtterances: ['Pokaż mi trzy najbliższe śluby.'],
    collectionSummaries: [futureThree],
    judge: (plan) => {
      const ok =
        usesHandle(plan, 'col_f3') &&
        hasConceptFilter(plan, 'CONTRACT.SIGNED') &&
        plan.output.kind === 'COLLECTION'
      return {
        pass: ok,
        detail: ok ? 'refine+CONTRACT.SIGNED' : 'missing signed filter/refine',
      }
    },
  },
  {
    id: 'cra2-nl-02-deposit',
    domain: 'finance',
    utterance: 'A które z nich nie mają jeszcze opłaconego zadatku?',
    priorUtterances: ['Pokaż nadchodzące śluby.', 'Zostaw tylko bez umowy.'],
    collectionSummaries: [
      summary({ handle: 'col_u', totalCount: 2, parentHandle: 'col_f3' }),
    ],
    judge: (plan) => {
      const ok =
        usesHandle(plan, 'col_u') && hasConceptFilter(plan, 'FIN.DEPOSIT_PAID')
      return {
        pass: ok,
        detail: ok ? 'DEPOSIT_PAID filter' : 'missing deposit filter',
      }
    },
  },
  {
    id: 'cra2-nl-03-open-tasks',
    domain: 'tasks',
    utterance: 'Z tego zbioru zostaw te, które mają jeszcze otwarte zadania.',
    priorUtterances: ['Nadchodzące bez zadatku.'],
    collectionSummaries: [summary({ handle: 'col_d', totalCount: 2 })],
    judge: (plan) => {
      const ok =
        usesHandle(plan, 'col_d') && hasConceptFilter(plan, 'TASK.HAS_OPEN')
      return { pass: ok, detail: ok ? 'HAS_OPEN' : 'missing task filter' }
    },
  },
  {
    id: 'cra2-nl-04-remaining-sum',
    domain: 'finance',
    utterance: 'Ile łącznie jeszcze jest do zapłaty na tych ślubach?',
    priorUtterances: ['Zostaw te z otwartymi zadaniami.'],
    collectionSummaries: [summary({ handle: 'col_t', totalCount: 2 })],
    judge: (plan) => {
      const agg = plan.steps.find((s) => s.kind === 'AGGREGATE_COLLECTION')
      const ok =
        plan.output.kind === 'AGGREGATE' &&
        !!agg &&
        agg.kind === 'AGGREGATE_COLLECTION' &&
        agg.aggregation === 'sum' &&
        (agg.measure === 'remaining_amount' ||
          agg.measure === 'FIN.REMAINING_TO_PAY') &&
        usesHandle(plan, 'col_t')
      return {
        pass: ok,
        detail: ok ? 'sum remaining' : 'missing remaining aggregate',
      }
    },
  },
  {
    id: 'cra2-nl-05-bride-phone',
    domain: 'contact',
    utterance: 'Jaki mam numer telefonu do panny młodej przy najbliższym ślubie?',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const concepts = inspectConcepts(plan)
      const ok =
        plan.output.kind === 'DETAIL' &&
        (concepts.includes('CONTACT.BRIDE_PHONE') ||
          concepts.some((c) => c.includes('bride') && c.includes('phone')))
      return {
        pass: ok,
        detail: ok ? 'bride phone inspect' : `got ${concepts.join(',')}`,
      }
    },
  },
  {
    id: 'cra2-nl-06-groom-prep',
    domain: 'places',
    utterance: 'Gdzie przygotowuje się pan młody na moim najbliższym ślubie?',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const concepts = inspectConcepts(plan)
      const ok =
        plan.output.kind === 'DETAIL' &&
        (concepts.includes('PLACE.GROOM_PREP_PLACE') ||
          concepts.includes('DR1:groom_preparation_place'))
      return {
        pass: ok,
        detail: ok ? 'groom prep' : `got ${concepts.join(',')}`,
      }
    },
  },
  {
    id: 'cra2-nl-07-bride-followup',
    domain: 'places',
    utterance: 'A panna młoda?',
    priorUtterances: [
      'Gdzie przygotowuje się pan młody na najbliższym ślubie?',
    ],
    collectionSummaries: [nearestOne],
    judge: (plan) => {
      const concepts = inspectConcepts(plan)
      const ok =
        usesHandle(plan, 'col_near') &&
        plan.output.kind === 'DETAIL' &&
        (concepts.includes('PLACE.BRIDE_PREP_PLACE') ||
          concepts.includes('DR1:bride_preparation_place'))
      return {
        pass: ok,
        detail: ok ? 'bride prep follow-up' : `got ${concepts.join(',')}`,
      }
    },
  },
  {
    id: 'cra2-nl-08-multi-inspect',
    domain: 'ops',
    utterance: 'Podaj adres ceremonii i godzinę ceremonii.',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [nearestOne],
    judge: (plan) => {
      const concepts = inspectConcepts(plan)
      const hasAddr =
        concepts.includes('PLACE.CEREMONY_ADDRESS') ||
        concepts.includes('DR1:ceremony_address')
      const hasTime = concepts.includes('OPS.CEREMONY_TIME')
      const ok =
        usesHandle(plan, 'col_near') &&
        plan.output.kind === 'DETAIL' &&
        hasAddr &&
        hasTime
      return {
        pass: ok,
        detail: ok ? 'address+time' : `got ${concepts.join(',')}`,
      }
    },
  },
  {
    id: 'cra2-nl-09-month-unpaid',
    domain: 'finance',
    utterance:
      'Pokaż śluby w przyszłym miesiącu, na których zadatek nie jest jeszcze opłacony.',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const ok =
        plan.output.kind === 'COLLECTION' &&
        hasConceptFilter(plan, 'FIN.DEPOSIT_PAID') &&
        plan.steps.some((s) => s.kind === 'SEARCH_COLLECTION')
      return {
        pass: ok,
        detail: ok ? 'month+deposit' : 'missing search/deposit',
      }
    },
  },
  {
    id: 'cra2-nl-10-most-remaining',
    domain: 'finance',
    utterance: 'Który ślub ma najwięcej do dopłaty?',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const hasSort = plan.steps.some((s) => {
        if (s.kind === 'SEARCH_COLLECTION') {
          return (
            s.search.sort?.field === 'remaining_amount' ||
            s.search.sort?.field === 'FIN.REMAINING_TO_PAY'
          )
        }
        if (s.kind === 'TRANSFORM_COLLECTION') {
          return s.ops.some(
            (op) =>
              op.op === 'Sort' &&
              (op.sort.field === 'remaining_amount' ||
                op.sort.field === 'FIN.REMAINING_TO_PAY'),
          )
        }
        return false
      })
      const hasSlice = plan.steps.some((s) => {
        if (s.kind === 'SEARCH_COLLECTION') return s.search.slice?.limit === 1
        if (s.kind === 'TRANSFORM_COLLECTION') {
          return s.ops.some((op) => op.op === 'Slice' && op.slice.limit === 1)
        }
        return false
      })
      return {
        pass: hasSort && hasSlice,
        detail:
          hasSort && hasSlice ? 'sort+slice1' : `sort=${hasSort} slice=${hasSlice}`,
      }
    },
  },
  {
    id: 'cra2-nl-11-tasks-list',
    domain: 'tasks',
    utterance: 'Jakie otwarte zadania ma ten ślub?',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [nearestOne],
    judge: (plan) => {
      const ok =
        usesHandle(plan, 'col_near') && hasRelation(plan, 'TASKS_OPEN')
      return { pass: ok, detail: ok ? 'TASKS_OPEN' : 'missing list related' }
    },
  },
  {
    id: 'cra2-nl-12-payments',
    domain: 'finance',
    utterance: 'Pokaż harmonogram płatności dla tego zlecenia.',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [nearestOne],
    judge: (plan) => {
      const ok = usesHandle(plan, 'col_near') && hasRelation(plan, 'PAYMENTS')
      return { pass: ok, detail: ok ? 'PAYMENTS' : 'missing payments list' }
    },
  },
  {
    id: 'cra2-nl-13-sessions',
    domain: 'sessions',
    utterance: 'Jakie sesje są powiązane z tym ślubem?',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [nearestOne],
    judge: (plan) => {
      const ok = usesHandle(plan, 'col_near') && hasRelation(plan, 'SESSIONS')
      return { pass: ok, detail: ok ? 'SESSIONS' : 'missing sessions list' }
    },
  },
  {
    id: 'cra2-nl-14-extras',
    domain: 'package',
    utterance: 'Jakie dodatki mają wykupione?',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [nearestOne],
    judge: (plan) => {
      const concepts = inspectConcepts(plan)
      const ok =
        usesHandle(plan, 'col_near') &&
        (hasRelation(plan, 'EXTRAS') || concepts.includes('PKG.EXTRAS'))
      return { pass: ok, detail: ok ? 'EXTRAS' : 'missing extras' }
    },
  },
  {
    id: 'cra2-nl-15-package-name',
    domain: 'package',
    utterance: 'Jaki pakiet wybrali?',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [nearestOne],
    judge: (plan) => {
      const concepts = inspectConcepts(plan)
      const ok =
        usesHandle(plan, 'col_near') && concepts.includes('PKG.NAME')
      return { pass: ok, detail: ok ? 'PKG.NAME' : `got ${concepts.join(',')}` }
    },
  },
  {
    id: 'cra2-nl-16-q-prewedding',
    domain: 'questionnaire',
    utterance: 'Czy wypełnili ankietę przedślubną?',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [nearestOne],
    judge: (plan) => {
      const concepts = inspectConcepts(plan)
      const ok =
        usesHandle(plan, 'col_near') &&
        (concepts.includes('Q.PREWEDDING_COMPLETED') ||
          concepts.includes('Q.PREWEDDING_STATUS'))
      return {
        pass: ok,
        detail: ok ? 'prewedding Q' : `got ${concepts.join(',')}`,
      }
    },
  },
  {
    id: 'cra2-nl-17-travel-fee',
    domain: 'travel',
    utterance: 'Jaka jest efektywna opłata za dojazd przy tym ślubie?',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [nearestOne],
    judge: (plan) => {
      const concepts = inspectConcepts(plan)
      const ok =
        usesHandle(plan, 'col_near') &&
        concepts.includes('TRAVEL.EFFECTIVE_FEE')
      return {
        pass: ok,
        detail: ok ? 'travel fee' : `got ${concepts.join(',')}`,
      }
    },
  },
  {
    id: 'cra2-nl-18-contract-value',
    domain: 'finance',
    utterance: 'Jaka jest wartość umowy?',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [nearestOne],
    judge: (plan) => {
      const concepts = inspectConcepts(plan)
      const inspectOk =
        usesHandle(plan, 'col_near') &&
        concepts.includes('FIN.CONTRACT_VALUE')
      const agg = plan.steps.find((s) => s.kind === 'AGGREGATE_COLLECTION')
      const aggregateOk =
        plan.output.kind === 'AGGREGATE' &&
        !!agg &&
        agg.kind === 'AGGREGATE_COLLECTION' &&
        agg.aggregation === 'sum' &&
        (agg.measure === 'contract_value' ||
          agg.measure === 'FIN.CONTRACT_VALUE') &&
        usesHandle(plan, 'col_near')
      const ok = inspectOk || aggregateOk
      return {
        pass: ok,
        detail: ok
          ? inspectOk
            ? 'contract value inspect'
            : 'contract value aggregate'
          : `got ${concepts.join(',')}`,
      }
    },
  },
  {
    id: 'cra2-nl-19-delivery',
    domain: 'delivery',
    utterance: 'Jaki mają termin oddania materiałów?',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [nearestOne],
    judge: (plan) => {
      const concepts = inspectConcepts(plan)
      const ok =
        usesHandle(plan, 'col_near') &&
        (concepts.includes('DELIVERY.DUE_DATE') ||
          concepts.includes('DELIVERY.STATE'))
      return {
        pass: ok,
        detail: ok ? 'delivery' : `got ${concepts.join(',')}`,
      }
    },
  },
  {
    id: 'cra2-nl-20-workflow-inspect',
    domain: 'workflow',
    utterance: 'Na jakim etapie workflow jest to zlecenie?',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [nearestOne],
    judge: (plan) => {
      const concepts = inspectConcepts(plan)
      const ok =
        usesHandle(plan, 'col_near') &&
        (concepts.includes('WORKFLOW.STAGE') ||
          concepts.includes('WORKFLOW.STAGE_LABEL'))
      return {
        pass: ok,
        detail: ok ? 'workflow inspect' : `got ${concepts.join(',')}`,
      }
    },
  },
  {
    id: 'cra2-nl-21-notes-unsupported',
    domain: 'unsupported',
    utterance: 'Przeczytaj mi treść notatek z tego ślubu.',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [nearestOne],
    judge: (plan) => {
      const ok = plan.output.kind === 'UNSUPPORTED'
      return {
        pass: ok,
        detail: ok ? 'unsupported notes' : `output=${plan.output.kind}`,
      }
    },
  },
  {
    id: 'cra2-nl-22-contract-body-unsupported',
    domain: 'unsupported',
    utterance: 'Wklej treść umowy PDF do czatu.',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [nearestOne],
    judge: (plan) => {
      const ok = plan.output.kind === 'UNSUPPORTED'
      return {
        pass: ok,
        detail: ok ? 'unsupported body' : `output=${plan.output.kind}`,
      }
    },
  },
  {
    id: 'cra2-nl-23-agreed-deposit',
    domain: 'finance',
    utterance: 'Jaki zadatek był uzgodniony w umowie?',
    priorUtterances: ['Najbliższy ślub.'],
    collectionSummaries: [nearestOne],
    judge: (plan) => {
      const concepts = inspectConcepts(plan)
      const ok =
        usesHandle(plan, 'col_near') &&
        concepts.includes('FIN.AGREED_DEPOSIT')
      return {
        pass: ok,
        detail: ok ? 'agreed deposit' : `got ${concepts.join(',')}`,
      }
    },
  },
  {
    id: 'cra2-nl-24-cross-domain-root',
    domain: 'cross',
    utterance:
      'Pokaż nadchodzące śluby bez podpisanej umowy i bez opłaconego zadatku.',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const ok =
        plan.output.kind === 'COLLECTION' &&
        hasConceptFilter(plan, 'CONTRACT.SIGNED') &&
        hasConceptFilter(plan, 'FIN.DEPOSIT_PAID')
      return {
        pass: ok,
        detail: ok ? 'signed+deposit' : 'missing cross-domain filters',
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
  if (!apiKey) {
    return { ok: false, error: 'missing_openai_key', latencyMs: 0 }
  }
  const started = Date.now()
  const userPayload = {
    utterance: input.utterance,
    locale: 'pl-PL',
    round: 1,
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
  const only = process.env.V6_CRA2_ONLY?.split(',').map((s) => s.trim()).filter(Boolean)
  const selected = only?.length ? CASES.filter((c) => only.includes(c.id)) : CASES
  const results: Array<{
    id: string
    domain: string
    pass: boolean
    detail: string
    latencyMs: number
    capability?: string
    error?: string
  }> = []

  console.log('V6-CRA2 planner NL validation', {
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
        domain: c.domain,
        pass: false,
        detail: call.error,
        latencyMs: call.latencyMs,
        error: call.error,
      })
      console.log(`FAIL ${c.id} [${c.domain}] ${call.error}`)
      await sleep(SLEEP_MS)
      continue
    }
    const cap = checkTurnPlanCapability(call.plan)
    const judged = c.judge(call.plan)
    const expectsUnsupported = call.plan.output.kind === 'UNSUPPORTED'
    const pass =
      judged.pass &&
      (expectsUnsupported
        ? cap.verdict === 'UNSUPPORTED'
        : cap.verdict === 'SUPPORTED')
    results.push({
      id: c.id,
      domain: c.domain,
      pass,
      detail: judged.pass
        ? judged.detail
        : `${judged.detail}; cap=${cap.verdict}:${cap.code}`,
      latencyMs: call.latencyMs,
      capability: `${cap.verdict}:${cap.code}`,
    })
    console.log(
      `${pass ? 'PASS' : 'FAIL'} ${c.id} [${c.domain}] ${judged.detail} (${call.latencyMs}ms)`,
    )
    await sleep(SLEEP_MS)
  }

  const passed = results.filter((r) => r.pass).length
  const rate = passed / results.length
  const outDir = resolve(
    'src/features/assistant/v4/benchmark/artifacts',
  )
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'phase-v6-cra2-planner-nl.json')
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        model: MODEL,
        passed,
        total: results.length,
        selected: selected.map((c) => c.id),
        rate,
        results,
      },
      null,
      2,
    ),
  )
  console.log(
    `CRA2 NL planner: ${passed}/${results.length} (${(rate * 100).toFixed(1)}%) → ${outPath}`,
  )
  if (rate < 0.95) process.exitCode = 2
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
