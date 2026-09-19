/**
 * K3.1 live mixed entity-resolution eval (fixture couples only).
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v7/evals/k31/runK31EntityResolutionEval.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { V7ResourceSetStore } from '@/features/assistant/v7/resourceSet/store'
import {
  runV7Turn,
  V7_DEFAULT_MODEL,
  type V7AgentSession,
  type V7TurnResult,
} from '@/features/assistant/v7/agent/loop'
import { buildV7FixtureDeps } from '@/features/assistant/v7/evals/v7FixtureUniverse'

const HERE = dirname(fileURLToPath(import.meta.url))
const ARTIFACT = join(
  HERE,
  '../../benchmark/artifacts/phase-k31-entity-resolution.json',
)

const CRM_TOOLS = new Set([
  'search_resources',
  'refine_resources',
  'inspect_resource',
  'select_nearest_assignments',
  'list_related',
  'describe_resource_set',
])

function newSession(model: string, apiKey: string): V7AgentSession {
  const store = new V7ResourceSetStore({
    sessionId: `k31-ent-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    tenantKey: 'fixture-tenant',
  })
  return {
    store,
    binding: store.binding,
    deps: buildV7FixtureDeps(),
    history: [],
    model,
    apiKey,
    todayKey: '2026-09-15',
  }
}

function score(id: string, result: V7TurnResult) {
  const tools = result.toolCalls.map((c) => c.name)
  const notFound =
    /nie (znalaz|mam zapisan|mogę znaleźć)|brak (takiego )?zlecenia/i.test(
      result.userText,
    )
  return {
    id,
    tools,
    hasCrm: tools.some((t) => CRM_TOOLS.has(t)),
    hasKnow: tools.includes('search_product_knowledge'),
    notFound,
    answer: result.userText.slice(0, 480),
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    console.error('OPENAI_API_KEY required')
    process.exit(1)
  }
  const model = process.env.V7_MODEL?.trim() || V7_DEFAULT_MODEL
  const rows: ReturnType<typeof score>[] = []

  // Multi-turn: named travel → named payments → pronoun
  {
    const s = newSession(model, apiKey)
    rows.push(
      score(
        't1-travel-named',
        await runV7Turn(
          s,
          'Jak zmienić koszt dojazdu dla Anny Wiśniewskiej i Piotra Zielińskiego?',
        ),
      ),
    )
    rows.push(
      score(
        't2-payments-named',
        await runV7Turn(
          s,
          'Gdzie sprawdzę płatności dla Anny Wiśniewskiej i Piotra Zielińskiego?',
        ),
      ),
    )
    rows.push(
      score(
        't3-payments-pronoun',
        await runV7Turn(s, 'Gdzie sprawdzę płatności dla nich?'),
      ),
    )
  }

  // Isolated genitive-inflected dual-name payments question
  {
    const s = newSession(model, apiKey)
    rows.push(
      score(
        'payments-genitive-inflected',
        await runV7Turn(
          s,
          'Gdzie sprawdzę płatności dla Anny Wiśniewskiej i Piotra Zielińskiego?',
        ),
      ),
    )
  }

  // True Polish genitive first names + surnames (Anny / Piotra)
  {
    const s = newSession(model, apiKey)
    rows.push(
      score(
        'payments-genitive-anny-piotra',
        await runV7Turn(
          s,
          'Gdzie sprawdzę płatności dla Anny Wiśniewskiej i Piotra Zielińskiego?',
        ),
      ),
    )
  }

  for (const row of rows) {
    console.log(
      `[${row.id}] notFound=${row.notFound} crm=${row.hasCrm} know=${row.hasKnow} tools=${row.tools.join(',') || '-'}`,
    )
  }

  const failed = rows.filter((r) => r.notFound)
  const report = {
    phase: 'k31-correctness-followup',
    model,
    rows,
    passGates: {
      noNotFound: failed.length === 0,
      multiTurnPronounOk: !rows.find((r) => r.id === 't3-payments-pronoun')
        ?.notFound,
    },
    pass: failed.length === 0,
  }
  mkdirSync(dirname(ARTIFACT), { recursive: true })
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2))
  console.log('wrote', ARTIFACT)
  if (!report.pass) {
    console.error('K31_ENTITY_EVAL_FAIL')
    process.exit(2)
  }
  console.log('K31_ENTITY_EVAL_PASS')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
