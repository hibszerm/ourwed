/**
 * U4 — Small DEV smoke: real NL → Luna GoalSpec → clarification (max 3–5 prompts).
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v4/goalSpec/runU4LunaSmoke.ts
 *
 * Synthetic prompts only. Never prints API key.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { ASSISTANT_V5_GOALSPEC_JSON_SCHEMA } from './goalSpecSchema'
import { V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT } from './goalSpecInterpreterPrompt'
import { parseFlatGoalSpecPayload } from './goalSpecSchema'
import { normalizeGoalSpecTemporal } from './normalizeGoalSpecTemporal'
import {
  clearGoalClarificationSession,
  getPendingGoalClarification,
} from './goalClarificationSession'
import { submitGoalClarificationAnswerWithLabel } from './goalClarificationHostAdapter'
import {
  resetV5GoalShadowSessionForTests,
  runV5GoalSpecShadow,
  setV5GoalShadowSessionOpen,
  type V5GoalShadowResult,
} from './v5GoalSpecShadow'
import type { GoalInterpretResult } from './interpretGoalSpec'

const PROMPTS = [
  { id: 'amb-money', text: 'Ile to będzie?' },
  { id: 'clear-paid', text: 'Ile już wpłynęło z wesel w sierpniu?' },
  { id: 'follow-year', text: 'a w przyszłym roku?' },
] as const

async function lunaInterpret(utterance: string): Promise<GoalInterpretResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return {
      ok: false,
      error: 'missing_openai_key',
      code: 'provider_error',
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
      model: 'gpt-5.6-luna',
      max_completion_tokens: 900,
      messages: [
        { role: 'system', content: V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            utterance,
            semanticContextSummary: null,
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
  const latencyMs = Date.now() - started
  if (!res.ok) {
    return {
      ok: false,
      error: `provider_${res.status}`,
      code: 'provider_error',
      latencyMs,
    }
  }
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    return { ok: false, error: 'empty_content', code: 'provider_error', latencyMs }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { ok: false, error: 'json_parse', code: 'schema_error', latencyMs }
  }
  const goal = parseFlatGoalSpecPayload(parsed)
  if (!goal) {
    return { ok: false, error: 'schema_error', code: 'schema_error', latencyMs }
  }
  return {
    ok: true,
    goalSpec: normalizeGoalSpecTemporal(goal, '2026-09-13'),
    latencyMs,
    model: 'gpt-5.6-luna',
  }
}

function waitShadow(
  turnId: string,
  text: string,
): Promise<V5GoalShadowResult> {
  return new Promise((resolveP) => {
    runV5GoalSpecShadow({
      turnId,
      userText: text,
      force: true,
      interpret: async ({ userText }) => lunaInterpret(userText),
      onResult: resolveP,
    })
  })
}

async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.log('U4 smoke SKIPPED — missing OPENAI_API_KEY')
    return
  }

  resetV5GoalShadowSessionForTests()
  clearGoalClarificationSession()
  setV5GoalShadowSessionOpen(true)

  const rows: Array<Record<string, unknown>> = []
  let apiCalls = 0

  // Turn 1: ambiguous
  {
    apiCalls += 1
    const r = await waitShadow('smoke-1', PROMPTS[0].text)
    rows.push({
      id: PROMPTS[0].id,
      status: r.status,
      slot:
        r.status === 'needs_clarification' ? r.request.slot : null,
      diagnostic: r.diagnostic,
    })
    if (r.status === 'needs_clarification') {
      const answered = submitGoalClarificationAnswerWithLabel({
        clarificationId: r.request.id,
        slot: r.request.slot,
        selectedValue: 'wedding.paid_amount',
        selectedLabel: 'Już wpłacone',
      })
      rows.push({
        id: 'smoke-1-click',
        resume: answered.result.status,
        measure:
          answered.result.status === 'bound'
            ? answered.result.query.measure
            : null,
        secondInterpret: false,
      })
    }
  }

  // Turn 2: clear paid (observe over-clarify)
  {
    apiCalls += 1
    const r = await waitShadow('smoke-2', PROMPTS[1].text)
    rows.push({
      id: PROMPTS[1].id,
      status: r.status,
      measure:
        r.status === 'bound'
          ? r.query.measure
          : r.status === 'needs_clarification'
            ? 'clarified_by_model'
            : null,
      diagnostic: r.diagnostic,
    })
  }

  // Turn 3: follow-up (may inherit if prior active collection set)
  {
    apiCalls += 1
    const r = await waitShadow('smoke-3', PROMPTS[2].text)
    rows.push({
      id: PROMPTS[2].id,
      status: r.status,
      pending: getPendingGoalClarification()?.slot ?? null,
      diagnostic: r.diagnostic,
    })
  }

  const outDir = resolve(
    process.cwd(),
    'src/features/assistant/v4/benchmark/artifacts',
  )
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'phase-u4-luna-smoke.json')
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        phase: 'U4',
        model: 'gpt-5.6-luna',
        apiCalls,
        note: 'synthetic prompts only; Host uses Edge interpret in browser',
        rows,
      },
      null,
      2,
    ),
  )
  console.log('U4 Luna smoke complete')
  console.log(JSON.stringify({ apiCalls, rows }, null, 2))
  console.log(`artifact: ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
