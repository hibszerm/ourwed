/**
 * Internal benchmark-only Edge Function.
 * Not part of product UI. Uses OPENAI_API_KEY + BENCHMARK_TOKEN.
 * Does not change production recovery model defaults.
 */
import {
  computeMaxOutputTokens,
  shouldAttachLowReasoning,
  WEDDING_CONTRACT_RECOVERY_PROMPT_VERSION,
  WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION,
} from './config.ts'
import { SYSTEM_PROMPT, buildUserPayload } from './prompt.ts'
import { RECOVERY_JSON_SCHEMA } from './schema.ts'
import {
  readRecoveryProviderUsage,
  summarizeExtractionTelemetry,
} from './providerUsage.ts'
import {
  extractOutputText,
  validateRecoveryExtraction,
} from './validate.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-benchmark-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function resolveApiKey(): string | null {
  const raw = Deno.env.get('OPENAI_API_KEY')
  if (!raw) return null
  let key = raw.trim()
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim()
  }
  return key || null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405)

  const expected = Deno.env.get('BENCHMARK_TOKEN')?.trim()
  const provided = req.headers.get('x-benchmark-token')?.trim()
  if (!expected || !provided || provided !== expected) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const plainText = typeof body.plainText === 'string' ? body.plainText : ''
  const fileName = typeof body.fileName === 'string' ? body.fileName : 'fixture.txt'
  const model = typeof body.model === 'string' ? body.model.trim() : ''
  if (!plainText.trim() || !model) {
    return json({ ok: false, error: 'missing_fields' }, 400)
  }

  const apiKey = resolveApiKey()
  if (!apiKey) return json({ ok: false, error: 'no_openai_key' }, 502)

  const totalStarted = Date.now()
  const requestBody: Record<string, unknown> = {
    model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: buildUserPayload({
              plainText,
              fileName,
              mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            }),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'wedding_contract_recovery',
        strict: true,
        schema: RECOVERY_JSON_SCHEMA,
      },
    },
    max_output_tokens: computeMaxOutputTokens(model),
  }
  if (shouldAttachLowReasoning(model) || body.reasoningEffort === 'low') {
    requestBody.reasoning = { effort: 'low' }
  }

  const openAiStarted = Date.now()
  let openAiBody: unknown
  let httpStatus = 0
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
    httpStatus = response.status
    openAiBody = await response.json()
  } catch (err) {
    return json({
      ok: false,
      error: 'provider_fetch_failed',
      detail: err instanceof Error ? err.name : 'error',
      providerDurationMs: Date.now() - openAiStarted,
      totalDurationMs: Date.now() - totalStarted,
    }, 502)
  }
  const providerDurationMs = Date.now() - openAiStarted
  if (httpStatus !== 200) {
    return json({
      ok: false,
      error: 'provider_http_error',
      httpStatus,
      providerDurationMs,
      totalDurationMs: Date.now() - totalStarted,
    }, 502)
  }

  const outputText = extractOutputText(openAiBody)
  let parsed: unknown = null
  let validationPassed = false
  try {
    parsed = JSON.parse(outputText)
    validationPassed = validateRecoveryExtraction(parsed)
  } catch {
    validationPassed = false
  }

  const usage = readRecoveryProviderUsage(openAiBody)
  const extraction = summarizeExtractionTelemetry(parsed)

  return json({
    ok: true,
    httpStatus,
    model,
    providerDurationMs,
    totalDurationMs: Date.now() - totalStarted,
    usage,
    rawResponseCharacterLength: outputText.length,
    validationPassed,
    extraction,
    // Return extraction for quality scoring in the CLI (synthetic fixtures only).
    extractionPayload: parsed,
    promptVersion: WEDDING_CONTRACT_RECOVERY_PROMPT_VERSION,
    responseVersion: WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION,
    serializedSchemaLength: JSON.stringify(RECOVERY_JSON_SCHEMA).length,
  })
})
