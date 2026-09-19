/**
 * V6-DR1 — Targeted Luna planner validation (≤8 cases).
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v6/evals/runV6Dr1PlannerValidation.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { V6_AGENT_SYSTEM_PROMPT } from '../agent/prompt'
import { buildV6NativeToolsRequestBody } from '../agent/v6OpenAITransport'
import { parseTurnPlanWire } from '../turnPlan/parse'
import { validateTurnPlan } from '../turnPlan/validate'
import type { V6TurnPlan } from '../turnPlan/types'
import { DR1_PLANNER_CASES, type Dr1PlannerCase } from './dr1/dr1Corpus'

const MODEL = 'gpt-5.6-luna'
const ART = resolve(
  process.cwd(),
  'src/features/assistant/v4/benchmark/artifacts',
)

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function scorePlan(c: Dr1PlannerCase, plan: V6TurnPlan): boolean {
  if (c.expect.outputKind && plan.output.kind !== c.expect.outputKind) {
    // p5 may also clarify
    if (
      c.id === 'p5-multi-wedding-ambiguity' &&
      (plan.output.kind === 'CLARIFICATION' || plan.output.kind === 'DETAIL')
    ) {
      return true
    }
    return false
  }
  if (c.expect.stepKind) {
    const hit = plan.steps.some((s) => s.kind === c.expect.stepKind)
    if (!hit) return false
  }
  if (c.expect.detailSelector) {
    const insp = plan.steps.find((s) => s.kind === 'INSPECT_WEDDING')
    if (!insp || insp.kind !== 'INSPECT_WEDDING') return false
    if (insp.detailSelector !== c.expect.detailSelector) return false
  }
  return true
}

async function callTurnPlan(input: {
  utterance: string
  recentUtterances: string[]
}): Promise<
  | { ok: true; plan: V6TurnPlan; latencyMs: number }
  | { ok: false; error: string; latencyMs: number }
> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return { ok: false, error: 'missing_openai_key', latencyMs: 0 }
  const started = Date.now()
  const activeHandle =
    input.recentUtterances.length > 0 ? 'col_active' : null
  const userPayload = {
    utterance: input.utterance,
    locale: 'pl-PL',
    round: 1,
    collectionSummaries: activeHandle
      ? [
          {
            handle: activeHandle,
            active: true,
            source: 'wedding',
            totalCount: input.recentUtterances[0]?.includes('trzy') ? 3 : 1,
            ordering: { field: 'wedding.date', direction: 'asc' },
            parentHandle: null,
            temporalSummary: 'future_from_now',
            placeSummary: null,
            excludePlaceSummary: null,
            sliceSummary:
              input.recentUtterances[0]?.includes('trzy') ? 'limit:3' : 'limit:1',
            preview: [{ displayName: 'Martyna & Tomasz', date: '2026-09-17', ordinal: 1 }],
            lineageDepth: 1,
          },
        ]
      : [],
    compactConversationContext: {
      recentUtterances: input.recentUtterances,
      controllerDiagnostic: null,
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
  const rows = []
  let correct = 0
  for (const c of DR1_PLANNER_CASES) {
    const call = await callTurnPlan({
      utterance: c.utterance,
      recentUtterances: c.priorUtterances,
    })
    await sleep(120)
    if (!call.ok) {
      rows.push({ id: c.id, ok: false, error: call.error, latencyMs: call.latencyMs })
      continue
    }
    const pass = scorePlan(c, call.plan)
    if (pass) correct += 1
    rows.push({
      id: c.id,
      ok: pass,
      latencyMs: call.latencyMs,
      outputKind: call.plan.output.kind,
      steps: call.plan.steps.map((s) =>
        s.kind === 'INSPECT_WEDDING'
          ? `${s.kind}:${s.detailSelector}`
          : s.kind,
      ),
    })
  }
  const out = {
    phase: 'V6-DR1-planner',
    model: MODEL,
    correct,
    total: DR1_PLANNER_CASES.length,
    rows,
  }
  mkdirSync(ART, { recursive: true })
  const path = resolve(ART, 'phase-v6-dr1-planner.json')
  writeFileSync(path, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
  console.log(`wrote ${path}`)
  if (correct < DR1_PLANNER_CASES.length) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
