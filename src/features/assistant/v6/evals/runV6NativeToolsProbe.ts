/**
 * V6-F1.2 — Live provider probe for native strict function calling.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v6/evals/runV6NativeToolsProbe.ts
 */

import { V6_AGENT_SYSTEM_PROMPT } from '../agent/prompt'
import { buildV6NativeToolsRequestBody } from '../agent/v6OpenAITransport'
import { parseV6NativeChatMessage } from '../agent/parseNativeStep'
import { V6_NATIVE_OPENAI_TOOLS } from '../agent/nativeTools'

const MODEL = 'gpt-5.6-luna'

async function call(utterance: string, ctx: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('missing_openai_key')
  const body = buildV6NativeToolsRequestBody({
    model: MODEL,
    maxOutputTokens: 900,
    messages: [
      { role: 'system', content: V6_AGENT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          utterance,
          locale: 'pl-PL',
          round: 1,
          ...ctx,
        }),
      },
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
  const json = await res.json()
  return { status: res.status, json }
}

async function main() {
  // 0) Schema acceptance — any 400 on tools means STOP
  const smoke = await call('Pokaż 3 najbliższe wesela.', {
    collectionSummaries: [],
    compactConversationContext: { recentUtterances: [] },
    previousToolResults: [],
  })
  if (smoke.status !== 200) {
    console.error('PROVIDER_SCHEMA_COMPATIBILITY FAIL', {
      status: smoke.status,
      error: smoke.json?.error,
      toolCount: V6_NATIVE_OPENAI_TOOLS.length,
    })
    process.exit(1)
  }

  const msg = smoke.json?.choices?.[0]?.message
  const parsed = parseV6NativeChatMessage(msg ?? {})
  if (!parsed.ok) {
    console.error('PROBE_PARSE_FAIL', parsed.reason, msg)
    process.exit(1)
  }
  console.log(
    'probe1_query',
    parsed.response.status === 'tool_calls'
      ? parsed.response.toolCalls.map((t) => ({
          name: t.name,
          keys: Object.keys(t.arguments),
        }))
      : parsed.response,
  )

  if (
    parsed.response.status !== 'tool_calls' ||
    parsed.response.toolCalls[0]?.name !== 'query_collection'
  ) {
    console.error('PROBE1_EXPECTED_query_collection')
    process.exit(1)
  }
  const qArgs = parsed.response.toolCalls[0]!.arguments as Record<string, unknown>
  for (const bad of ['metric', 'operation', 'operations', 'handle', 'search']) {
    if (bad in qArgs) {
      console.error('INVENTED_VOCAB', bad)
      process.exit(1)
    }
  }

  // 2) transform with prior handle in context
  const t2 = await call('A które z nich mam w Villa Love?', {
    collectionSummaries: [
      {
        handle: 'col_abc',
        active: true,
        source: 'wedding',
        totalCount: 3,
        ordering: { field: 'wedding.date', direction: 'asc' },
        parentHandle: null,
        temporalSummary: 'future_from_now',
        placeSummary: null,
        excludePlaceSummary: null,
        sliceSummary: 'offset:0,limit:3',
        preview: [],
        lineageDepth: 0,
      },
    ],
    compactConversationContext: {
      recentUtterances: ['Pokaż 3 najbliższe wesela.'],
    },
    previousToolResults: [
      {
        toolCallId: 'q1',
        name: 'query_collection',
        result: { ok: true, data: { handle: 'col_abc', totalCount: 3 } },
      },
    ],
  })
  if (t2.status !== 200) {
    console.error('PROBE2_PROVIDER_FAIL', t2.json?.error)
    process.exit(1)
  }
  const p2 = parseV6NativeChatMessage(t2.json?.choices?.[0]?.message ?? {})
  if (!p2.ok) {
    console.error('PROBE2_PARSE_FAIL', p2.reason)
    process.exit(1)
  }
  console.log(
    'probe2_transform',
    p2.response.status === 'tool_calls'
      ? p2.response.toolCalls.map((t) => ({
          name: t.name,
          keys: Object.keys(t.arguments),
        }))
      : p2.response,
  )

  // 3) aggregate
  const t3 = await call('Ile są warte?', {
    collectionSummaries: [
      {
        handle: 'col_abc',
        active: true,
        source: 'wedding',
        totalCount: 2,
        ordering: { field: 'wedding.date', direction: 'asc' },
        parentHandle: null,
        temporalSummary: null,
        placeSummary: 'contains:Villa Love',
        excludePlaceSummary: null,
        sliceSummary: null,
        preview: [],
        lineageDepth: 1,
      },
    ],
    compactConversationContext: {
      recentUtterances: ['Pokaż 3 najbliższe wesela.', 'Villa Love'],
    },
    previousToolResults: [],
  })
  if (t3.status !== 200) {
    console.error('PROBE3_PROVIDER_FAIL', t3.json?.error)
    process.exit(1)
  }
  const p3 = parseV6NativeChatMessage(t3.json?.choices?.[0]?.message ?? {})
  if (!p3.ok) {
    console.error('PROBE3_PARSE_FAIL', p3.reason)
    process.exit(1)
  }
  console.log(
    'probe3_aggregate',
    p3.response.status === 'tool_calls'
      ? p3.response.toolCalls.map((t) => ({
          name: t.name,
          args: t.arguments,
        }))
      : p3.response,
  )

  console.log(
    JSON.stringify(
      {
        providerSchemaCompatibility: 'PASS',
        nativeTools: V6_NATIVE_OPENAI_TOOLS.map(
          (t) => (t as { function: { name: string } }).function.name,
        ),
        model: MODEL,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
