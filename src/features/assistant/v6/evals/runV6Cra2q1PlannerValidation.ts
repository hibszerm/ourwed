/**
 * V6-CRA2Q1 — Bounded planner NL validation (~12 cases).
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v6/evals/runV6Cra2q1PlannerValidation.ts
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
const SLEEP_MS = 200

type Case = {
  id: string
  class:
    | 'multi_turn'
    | 'ranking'
    | 'tasks'
    | 'extras'
    | 'questionnaire'
    | 'contact_filter'
    | 'negative'
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
      { ordinal: 1, displayName: 'Martyna Napieralska i Damian Urbański', date: '2026-09-20' },
    ],
    lineageDepth: partial.lineageDepth ?? 0,
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function bindsHandle(plan: V6TurnPlan, handle: string): boolean {
  return plan.steps.some((s) => {
    if ('inputHandle' in s && s.inputHandle === handle) return true
    return false
  })
}

function conceptFilterCmp(plan: V6TurnPlan, concept: string): string | null {
  for (const step of plan.steps) {
    if (step.kind === 'SEARCH_COLLECTION') {
      const hit = step.search.conceptFilters?.find((p) => p.concept === concept)
      if (hit) return hit.cmp
    }
    if (step.kind === 'TRANSFORM_COLLECTION') {
      for (const op of step.ops) {
        if (op.op === 'ConceptFilter' && op.predicate.concept === concept) {
          return op.predicate.cmp
        }
      }
    }
  }
  return null
}

const COL = 'col_active'
const PRIOR = [
  'Pokaż ślub Martyna Napieralska i Damian Urbański',
]
const SUMMARIES = [
  summary({
    handle: COL,
    active: true,
    totalCount: 1,
    temporalSummary: 'future_from_now',
    sliceSummary: 'offset:0,limit:1',
  }),
]

const CASES: Case[] = [
  {
    id: 'q1-mt-phone',
    class: 'multi_turn',
    utterance: 'A telefon pana młodego?',
    priorUtterances: PRIOR,
    collectionSummaries: SUMMARIES,
    judge: (plan) => {
      const step = plan.steps.find((s) => s.kind === 'INSPECT_RESOURCE')
      const ok =
        !!step &&
        step.kind === 'INSPECT_RESOURCE' &&
        step.concepts.includes('CONTACT.GROOM_PHONE') &&
        bindsHandle(plan, COL)
      return {
        pass: ok,
        detail: ok ? 'inspect phone+handle' : 'missing inspect/handle',
      }
    },
  },
  {
    id: 'q1-mt-tasks',
    class: 'tasks',
    utterance: 'Jakie ma otwarte zadania?',
    priorUtterances: PRIOR,
    collectionSummaries: SUMMARIES,
    judge: (plan) => {
      const step = plan.steps.find((s) => s.kind === 'LIST_RELATED')
      const ok =
        !!step &&
        step.kind === 'LIST_RELATED' &&
        step.relation === 'TASKS_OPEN' &&
        bindsHandle(plan, COL)
      return {
        pass: ok,
        detail: ok ? 'list tasks+handle' : 'missing list/handle',
      }
    },
  },
  {
    id: 'q1-mt-extras',
    class: 'extras',
    utterance: 'Jakie ma dodatki do pakietu?',
    priorUtterances: PRIOR,
    collectionSummaries: SUMMARIES,
    judge: (plan) => {
      const step = plan.steps.find((s) => s.kind === 'LIST_RELATED')
      const ok =
        !!step &&
        step.kind === 'LIST_RELATED' &&
        step.relation === 'EXTRAS' &&
        bindsHandle(plan, COL)
      return {
        pass: ok,
        detail: ok ? 'extras+handle' : 'missing extras/handle',
      }
    },
  },
  {
    id: 'q1-mt-questionnaire',
    class: 'questionnaire',
    utterance: 'Jaki jest status ankiety przedślubnej?',
    priorUtterances: PRIOR,
    collectionSummaries: SUMMARIES,
    judge: (plan) => {
      const step = plan.steps.find((s) => s.kind === 'INSPECT_RESOURCE')
      const ok =
        !!step &&
        step.kind === 'INSPECT_RESOURCE' &&
        step.concepts.includes('Q.PREWEDDING_STATUS') &&
        bindsHandle(plan, COL)
      return {
        pass: ok,
        detail: ok ? 'q status+handle' : 'missing q/handle',
      }
    },
  },
  {
    id: 'q1-mt-ranking',
    class: 'ranking',
    utterance: 'Które z tych ma najwyższą pozostałą kwotę do zapłaty?',
    priorUtterances: ['Pokaż nadchodzące wesela'],
    collectionSummaries: [
      summary({
        handle: COL,
        active: true,
        totalCount: 5,
        temporalSummary: 'future_from_now',
        preview: [
          { ordinal: 1, displayName: 'A & B', date: '2026-10-01' },
          { ordinal: 2, displayName: 'C & D', date: '2026-11-01' },
        ],
      }),
    ],
    judge: (plan) => {
      const step = plan.steps.find((s) => s.kind === 'TRANSFORM_COLLECTION')
      if (!step || step.kind !== 'TRANSFORM_COLLECTION') {
        return { pass: false, detail: 'expected TRANSFORM on prior' }
      }
      const sortOk = step.ops.some(
        (op) =>
          op.op === 'Sort' &&
          op.sort.field === 'FIN.REMAINING_TO_PAY' &&
          op.sort.direction === 'desc',
      )
      const sliceOk = step.ops.some(
        (op) => op.op === 'Slice' && op.slice.limit === 1,
      )
      const ok = bindsHandle(plan, COL) && sortOk && sliceOk
      return {
        pass: ok,
        detail: ok ? 'rank sort+slice on handle' : 'bad ranking plan',
      }
    },
  },
  {
    id: 'q1-contact-contains-1',
    class: 'contact_filter',
    utterance: 'Znajdź ślub panny młodej Karolina',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const cmp = conceptFilterCmp(plan, 'CONTACT.BRIDE_NAME')
      const ok = cmp === 'contains'
      return {
        pass: ok,
        detail: ok ? 'contains' : `cmp=${cmp ?? 'none'}`,
      }
    },
  },
  {
    id: 'q1-contact-contains-2',
    class: 'contact_filter',
    utterance: 'Pokaż wesela gdzie panna młoda to Anna',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const cmp = conceptFilterCmp(plan, 'CONTACT.BRIDE_NAME')
      const ok = cmp === 'contains'
      return {
        pass: ok,
        detail: ok ? 'contains' : `cmp=${cmp ?? 'none'}`,
      }
    },
  },
  {
    id: 'q1-contact-groom-contains',
    class: 'contact_filter',
    utterance: 'Śluby pana młodego Damian',
    priorUtterances: [],
    collectionSummaries: [],
    judge: (plan) => {
      const cmp = conceptFilterCmp(plan, 'CONTACT.GROOM_NAME')
      const ok = cmp === 'contains'
      return {
        pass: ok,
        detail: ok ? 'contains' : `cmp=${cmp ?? 'none'}`,
      }
    },
  },
  {
    id: 'q1-neg-those-root',
    class: 'negative',
    utterance: 'Policz ile ich jest',
    priorUtterances: ['Pokaż nadchodzące wesela'],
    collectionSummaries: [
      summary({
        handle: COL,
        active: true,
        totalCount: 4,
        temporalSummary: 'future_from_now',
      }),
    ],
    judge: (plan) => {
      // Should aggregate/refine prior handle — NOT invent unconstrained root search alone.
      const lost =
        plan.steps.some((s) => s.kind === 'SEARCH_COLLECTION') &&
        !bindsHandle(plan, COL)
      return {
        pass: !lost && bindsHandle(plan, COL),
        detail: !lost && bindsHandle(plan, COL) ? 'kept handle' : 'lost prior set',
      }
    },
  },
  {
    id: 'q1-neg-write',
    class: 'negative',
    utterance: 'Oznacz zadatek jako opłacony',
    priorUtterances: PRIOR,
    collectionSummaries: SUMMARIES,
    judge: (plan) => {
      const ok = plan.output.kind === 'UNSUPPORTED'
      return { pass: ok, detail: ok ? 'unsupported write' : plan.output.kind }
    },
  },
  {
    id: 'q1-package-name',
    class: 'multi_turn',
    utterance: 'Jak nazywa się pakiet?',
    priorUtterances: PRIOR,
    collectionSummaries: SUMMARIES,
    judge: (plan) => {
      const step = plan.steps.find((s) => s.kind === 'INSPECT_RESOURCE')
      const ok =
        !!step &&
        step.kind === 'INSPECT_RESOURCE' &&
        step.concepts.includes('PKG.NAME') &&
        bindsHandle(plan, COL)
      return { pass: ok, detail: ok ? 'pkg+handle' : 'missing pkg/handle' }
    },
  },
  {
    id: 'q1-ceremony-addr',
    class: 'multi_turn',
    utterance: 'Jaki jest adres ceremonii?',
    priorUtterances: PRIOR,
    collectionSummaries: SUMMARIES,
    judge: (plan) => {
      const inspect = plan.steps.find(
        (s) =>
          (s.kind === 'INSPECT_RESOURCE' &&
            s.concepts.includes('PLACE.CEREMONY_ADDRESS')) ||
          (s.kind === 'INSPECT_WEDDING' &&
            s.detailSelector === 'ceremony_address'),
      )
      const ok = !!inspect && bindsHandle(plan, COL)
      return {
        pass: ok,
        detail: ok ? 'ceremony address+handle' : 'missing address/handle',
      }
    },
  },
]

async function callPlanner(c: Case): Promise<V6TurnPlan> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY required')

  const userPayload = {
    utterance: c.utterance,
    locale: 'pl-PL',
    round: 1,
    todayKey: '2026-09-15',
    collectionSummaries: c.collectionSummaries,
    compactConversationContext: {
      recentUtterances: c.priorUtterances,
      controllerDiagnostic: null,
    },
    previousToolResults: [],
  }

  const body = buildV6NativeToolsRequestBody({
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
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
  }
  if (!res.ok) throw new Error(json.error?.message ?? `http_${res.status}`)

  const content = json.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('empty_content')
  }
  let wire: unknown
  try {
    wire = JSON.parse(content)
  } catch {
    throw new Error('json_parse')
  }
  const parsed = parseTurnPlanWire(wire)
  if (!parsed.ok) throw new Error(parsed.detail)
  const validated = validateTurnPlan(parsed.plan)
  if (!validated.ok) throw new Error(`${validated.code}:${validated.detail}`)
  return parsed.plan
}

async function main() {
  const rows: Array<Record<string, unknown>> = []
  let pass = 0
  for (const c of CASES) {
    try {
      const plan = await callPlanner(c)
      const cap = checkTurnPlanCapability(plan)
      const judged = c.judge(plan)
      const ok =
        judged.pass &&
        (plan.output.kind === 'UNSUPPORTED' || cap.verdict === 'SUPPORTED')
      if (ok) pass += 1
      rows.push({
        id: c.id,
        class: c.class,
        ok,
        detail: judged.detail,
        capability: cap.verdict,
        output: plan.output.kind,
        steps: plan.steps.map((s) => s.kind),
      })
      console.log(`${ok ? 'OK' : 'FAIL'} ${c.id} — ${judged.detail}`)
    } catch (e) {
      rows.push({
        id: c.id,
        class: c.class,
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      })
      console.log(`FAIL ${c.id} — ${e instanceof Error ? e.message : e}`)
    }
    await sleep(SLEEP_MS)
  }

  const outDir = resolve(
    'src/features/assistant/v4/benchmark/artifacts',
  )
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'phase-v6-cra2q1-nl.json')
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        model: MODEL,
        pass,
        total: CASES.length,
        rate: pass / CASES.length,
        rows,
      },
      null,
      2,
    ),
  )
  console.log(`\nCRA2Q1 NL ${pass}/${CASES.length} → ${outPath}`)
  if (pass < CASES.length) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
