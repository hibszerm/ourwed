/**
 * U4.2 — Minimal Luna transport smoke (max 3 prompts).
 * Uses the same V5 prompt/schema + Luna request body as Edge.
 * Does NOT call deployed Edge. Does NOT deploy.
 *
 * Run:
 * npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/runU42LunaEdgeTransportSmoke.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT } from './goalSpecInterpreterPrompt'
import {
  ASSISTANT_V5_GOALSPEC_JSON_SCHEMA,
  parseFlatGoalSpecPayload,
  validateGoalSpec,
} from './goalSpecSchema'
import { buildV5ChatCompletionRequestBody } from '../../../../../supabase/functions/ai-assistant/v5OpenAITransport'

type Usage = {
  prompt_tokens?: number
  completion_tokens?: number
  completion_tokens_details?: { reasoning_tokens?: number }
}

async function callOnce(
  utterance: string,
  semanticContextSummary: unknown,
): Promise<{
  ok: boolean
  error?: string
  goalSpec?: unknown
  usage: Usage | null
  model: string
}> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return { ok: false, error: 'missing_openai_key', usage: null, model: 'gpt-5.6-luna' }
  }

  const body = buildV5ChatCompletionRequestBody({
    model: 'gpt-5.6-luna',
    maxOutputTokens: 900,
    messages: [
      { role: 'system', content: V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          utterance,
          semanticContextSummary,
          locale: 'pl-PL',
        }),
      },
    ],
    jsonSchemaName: 'assistant_v5_goal_spec',
    jsonSchema: ASSISTANT_V5_GOALSPEC_JSON_SCHEMA,
  })

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  const usage = (json?.usage as Usage | undefined) ?? null
  if (!res.ok) {
    const code = json?.error?.code ?? json?.error?.type ?? `http_${res.status}`
    return {
      ok: false,
      error: `provider_${res.status}_${String(code)}`,
      usage,
      model: 'gpt-5.6-luna',
    }
  }
  const content = json?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    return { ok: false, error: 'empty_content', usage, model: 'gpt-5.6-luna' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { ok: false, error: 'json_parse', usage, model: 'gpt-5.6-luna' }
  }
  const goal = parseFlatGoalSpecPayload(parsed)
  if (!goal || !validateGoalSpec(goal)) {
    return { ok: false, error: 'schema_error', usage, model: 'gpt-5.6-luna' }
  }
  return { ok: true, goalSpec: goal, usage, model: 'gpt-5.6-luna' }
}

async function main() {
  const prompts: Array<{
    id: string
    utterance: string
    semanticContextSummary: unknown
  }> = [
    {
      id: 'u42-1-ambiguous-measure',
      utterance: 'Ile to będzie?',
      semanticContextSummary: null,
    },
    {
      id: 'u42-2-paid-august',
      utterance: 'Ile już wpłynęło z wesel w sierpniu?',
      semanticContextSummary: null,
    },
    {
      id: 'u42-3-ellipsis-next-year',
      utterance: 'a w przyszłym roku?',
      semanticContextSummary: {
        previousGoalSummary: {
          requestKind: 'domain_query',
          source: 'wedding',
          aggregation: 'count',
          measure: null,
          placeName: 'Villa Love',
          temporalExpression: null,
        },
        hasActiveCollection: true,
        pageResourceKind: null,
      },
    },
  ]

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.log('U4.2 Luna smoke SKIPPED — missing OPENAI_API_KEY')
    process.exit(0)
  }

  const results = []
  let promptTokens = 0
  let completionTokens = 0
  let reasoningTokens = 0

  for (const p of prompts) {
    const r = await callOnce(p.utterance, p.semanticContextSummary)
    results.push({
      id: p.id,
      utterance: p.utterance,
      ok: r.ok,
      error: r.error ?? null,
      model: r.model,
      requestKind:
        r.ok && r.goalSpec && typeof r.goalSpec === 'object'
          ? (r.goalSpec as { requestKind?: string }).requestKind
          : null,
      measure:
        r.ok && r.goalSpec && typeof r.goalSpec === 'object'
          ? (r.goalSpec as { measure?: string | null }).measure
          : null,
      aggregation:
        r.ok && r.goalSpec && typeof r.goalSpec === 'object'
          ? (r.goalSpec as { aggregation?: string | null }).aggregation
          : null,
      ambiguities:
        r.ok && r.goalSpec && typeof r.goalSpec === 'object'
          ? (r.goalSpec as { ambiguities?: unknown[] }).ambiguities
          : null,
      usage: r.usage,
    })
    promptTokens += r.usage?.prompt_tokens ?? 0
    completionTokens += r.usage?.completion_tokens ?? 0
    reasoningTokens +=
      r.usage?.completion_tokens_details?.reasoning_tokens ?? 0
    console.log(
      p.id,
      r.ok ? 'OK' : `FAIL ${r.error}`,
      r.ok
        ? `kind=${(r.goalSpec as { requestKind?: string }).requestKind} measure=${(r.goalSpec as { measure?: string | null }).measure}`
        : '',
    )
  }

  const outDir = resolve(
    process.cwd(),
    'src/features/assistant/v4/benchmark/artifacts',
  )
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'phase-u42-luna-edge-transport-smoke.json')
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        phase: 'U4.2',
        model: 'gpt-5.6-luna',
        transport: 'direct_openai_edge_parity_body',
        calls: results.length,
        totals: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          reasoning_tokens: reasoningTokens,
        },
        results,
      },
      null,
      2,
    ),
  )
  console.log('Wrote', outPath)
  console.log(
    `API calls=${results.length} prompt_tokens≈${promptTokens} completion_tokens≈${completionTokens} reasoning_tokens≈${reasoningTokens}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
