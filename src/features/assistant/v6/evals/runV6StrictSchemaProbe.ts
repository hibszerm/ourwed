/**
 * V6-F1.1A — Live OpenAI strict:true schema compatibility probe.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v6/evals/runV6StrictSchemaProbe.ts
 */

import { V6_AGENT_SYSTEM_PROMPT } from '../agent/prompt'
import {
  ASSISTANT_V6_AGENT_STEP_JSON_SCHEMA,
  parseV6AgentStepPayload,
} from '../agent/schema'

const MODEL = 'gpt-5.6-luna'

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    console.error('BLOCKED: missing OPENAI_API_KEY')
    process.exit(2)
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_completion_tokens: 800,
      messages: [
        { role: 'system', content: V6_AGENT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            utterance: 'Pokaż 3 najbliższe wesela.',
            locale: 'pl-PL',
            round: 1,
            collectionSummaries: [],
            compactConversationContext: { recentUtterances: [] },
            previousToolResults: [],
          }),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'assistant_v6_agent_step',
          strict: true,
          schema: ASSISTANT_V6_AGENT_STEP_JSON_SCHEMA,
        },
      },
    }),
  })

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    console.error('PROVIDER_SCHEMA_COMPATIBILITY FAIL', {
      status: res.status,
      error: body?.error,
    })
    process.exit(1)
  }

  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    console.error('PROVIDER_SCHEMA_COMPATIBILITY FAIL empty_content')
    process.exit(1)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    console.error('PROVIDER_SCHEMA_COMPATIBILITY FAIL json_parse')
    process.exit(1)
  }

  const checked = parseV6AgentStepPayload(parsed)
  if (!checked.ok) {
    console.error('PROVIDER_SCHEMA_COMPATIBILITY FAIL parse', checked.reason)
    console.error('raw', content.slice(0, 800))
    process.exit(1)
  }

  console.log(
    JSON.stringify(
      {
        providerSchemaCompatibility: 'PASS',
        status: checked.value.status,
        toolNames: checked.value.toolCalls?.map((c) => c.name) ?? [],
        model: MODEL,
      },
      null,
      2,
    ),
  )
}

main()
