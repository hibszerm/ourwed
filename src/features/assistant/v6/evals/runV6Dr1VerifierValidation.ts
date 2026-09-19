/**
 * V6-DR1 — Targeted semantic verifier validation (≤8 cases).
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v6/evals/runV6Dr1VerifierValidation.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  V6_SEMANTIC_VERIFIER_JSON_SCHEMA,
  V6_SEMANTIC_VERIFIER_MODEL,
  V6_SEMANTIC_VERIFIER_REASONING,
  V6_SEMANTIC_VERIFIER_SYSTEM_PROMPT,
  parseSemanticVerifierWire,
} from '../verification/semanticVerifier'
import { DR1_VERIFIER_CASES } from './dr1/dr1Corpus'

const ART = resolve(
  process.cwd(),
  'src/features/assistant/v4/benchmark/artifacts',
)

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function callVerifier(c: (typeof DR1_VERIFIER_CASES)[number]) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return { ok: false as const, error: 'missing_key', latencyMs: 0 }
  const started = Date.now()
  const user = JSON.stringify({
    task: 'Semantic-only: does draft_turn_plan faithfully represent user meaning?',
    utterance: c.utterance,
    prior_utterances: c.priorUtterances,
    collection_summaries: [
      {
        handle: 'col_active',
        active: true,
        source: 'wedding',
        totalCount: 1,
        temporalSummary: 'future_from_now',
        sliceSummary: 'limit:1',
        preview: [
          { displayName: 'Martyna & Tomasz', date: '2026-09-17', ordinal: 1 },
        ],
      },
    ],
    draft_turn_plan: c.draftPlan,
  })
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: V6_SEMANTIC_VERIFIER_MODEL,
      max_completion_tokens: 1400,
      reasoning_effort: V6_SEMANTIC_VERIFIER_REASONING,
      messages: [
        { role: 'system', content: V6_SEMANTIC_VERIFIER_SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'v6_semantic_verifier',
          strict: true,
          schema: V6_SEMANTIC_VERIFIER_JSON_SCHEMA,
        },
      },
    }),
  })
  const latencyMs = Date.now() - started
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    return {
      ok: false as const,
      error: `provider_${res.status}`,
      latencyMs,
    }
  }
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    return { ok: false as const, error: 'empty', latencyMs }
  }
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    return { ok: false as const, error: 'json', latencyMs }
  }
  const parsed = parseSemanticVerifierWire(raw)
  if (!parsed.ok) {
    return { ok: false as const, error: parsed.detail, latencyMs }
  }
  return { ok: true as const, result: parsed.value, latencyMs }
}

async function main() {
  const rows = []
  let correct = 0
  for (const c of DR1_VERIFIER_CASES) {
    const call = await callVerifier(c)
    await sleep(120)
    if (!call.ok) {
      rows.push({ id: c.id, ok: false, error: call.error, latencyMs: call.latencyMs })
      continue
    }
    const pass = call.result.verdict === c.gold
    if (pass) correct += 1
    rows.push({
      id: c.id,
      ok: pass,
      gold: c.gold,
      verdict: call.result.verdict,
      latencyMs: call.latencyMs,
    })
  }
  const out = {
    phase: 'V6-DR1-verifier',
    model: V6_SEMANTIC_VERIFIER_MODEL,
    correct,
    total: DR1_VERIFIER_CASES.length,
    rows,
  }
  mkdirSync(ART, { recursive: true })
  const path = resolve(ART, 'phase-v6-dr1-verifier.json')
  writeFileSync(path, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
  console.log(`wrote ${path}`)
  if (correct < DR1_VERIFIER_CASES.length) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
