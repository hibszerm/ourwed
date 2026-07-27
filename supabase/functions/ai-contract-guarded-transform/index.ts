import {
  GUARDED_AI_JSON_SCHEMA,
  GUARDED_AI_PROMPT_VERSION,
  GUARDED_AI_RESPONSE_VERSION,
  SYSTEM_PROMPT,
  buildUserPayload,
  computeMaxOutputTokens,
  resolveModel,
  shouldRetryIncomplete,
} from './prompt.ts'
import {
  MODEL_SCHEMA_VERSION,
  PARSE_RETRY_HINT,
  parseSparseV2FromResponse,
  shouldRetryParseFailure,
} from '../_shared/parseSparseV2Response.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
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

function readUsage(body: unknown): {
  inputTokens?: number
  outputTokens?: number
} {
  if (!body || typeof body !== 'object') return {}
  const usage = (body as Record<string, unknown>).usage
  if (!usage || typeof usage !== 'object') return {}
  const u = usage as Record<string, unknown>
  return {
    inputTokens:
      typeof u.input_tokens === 'number'
        ? u.input_tokens
        : typeof u.prompt_tokens === 'number'
          ? u.prompt_tokens
          : undefined,
    outputTokens:
      typeof u.output_tokens === 'number'
        ? u.output_tokens
        : typeof u.completion_tokens === 'number'
          ? u.completion_tokens
          : undefined,
  }
}

function responseId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const id = (body as Record<string, unknown>).id
  return typeof id === 'string' ? id : null
}

function responseStatus(body: unknown): string {
  if (!body || typeof body !== 'object') return 'unknown'
  return String((body as Record<string, unknown>).status ?? 'unknown')
}

function extractionDiagnostics(
  parse: ReturnType<typeof parseSparseV2FromResponse>,
) {
  const e = parse.extraction
  return {
    outputItemCount: e.outputItemCount,
    outputItemTypes: e.outputItemTypes,
    messageItemCount: e.messageItemCount,
    outputTextItemCount: e.outputTextItemCount,
    extractedCharacterCount: e.extractedCharacterCount,
    usedOutputTextConvenienceProperty: e.usedOutputTextConvenienceProperty,
    refusalDetected: e.refusalDetected,
    recoveredFromMarkdownFence: parse.ok
      ? parse.recoveredFromMarkdownFence
      : Boolean(parse.recoveredFromMarkdownFence),
    parseFailureKind: parse.ok ? null : parse.code,
    modelSchemaVersion: parse.ok ? parse.modelSchemaVersion : MODEL_SCHEMA_VERSION,
    applicationResponseVersion: parse.ok
      ? parse.applicationResponseVersion
      : null,
    ...(parse.ok
      ? { changedBlockCount: parse.changedBlocks.length }
      : parse.parseDiagnostics
        ? { parseDiagnostics: parse.parseDiagnostics }
        : {}),
  }
}

async function callOpenAi(input: {
  apiKey: string
  model: string
  maxOutputTokens: number
  userPayload: string
  extraUserHint?: string
}): Promise<{ ok: true; body: unknown } | { ok: false; httpStatus: number; body: unknown }> {
  const userContent = input.extraUserHint
    ? `${input.userPayload}\n\n${input.extraUserHint}`
    : input.userPayload
  const openaiRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      max_output_tokens: input.maxOutputTokens,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: GUARDED_AI_JSON_SCHEMA.name,
          strict: true,
          schema: GUARDED_AI_JSON_SCHEMA.schema,
        },
      },
    }),
  })
  const body = await openaiRes.json()
  if (!openaiRes.ok) return { ok: false, httpStatus: openaiRes.status, body }
  return { ok: true, body }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse(
      { ok: false, error: { code: 'method_not_allowed', message: 'POST only' } },
      405,
    )
  }

  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return jsonResponse(
      { ok: false, error: { code: 'unauthorized', message: 'Missing Authorization' } },
      401,
    )
  }

  const apiKey = resolveApiKey()
  if (!apiKey) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'provider_api_error',
          message: 'OPENAI_API_KEY not configured',
          retryable: false,
        },
      },
      500,
    )
  }

  let payload: Record<string, unknown>
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    return jsonResponse(
      { ok: false, error: { code: 'invalid_request', message: 'Invalid JSON body' } },
      400,
    )
  }

  const runId = typeof payload.runId === 'string' ? payload.runId : 'unknown'
  const documentBlocks = Array.isArray(payload.documentBlocks)
    ? (payload.documentBlocks as Array<{ blockId: string; text: string }>)
    : null
  if (!documentBlocks || documentBlocks.length === 0) {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'invalid_request', message: 'documentBlocks required' },
      },
      400,
    )
  }

  const model = resolveModel()
  const slim = documentBlocks.map((b) => ({
    blockId: String(b.blockId),
    text: String(b.text ?? ''),
  }))
  const userPayload = buildUserPayload({
    documentBlocks: slim,
    transformationDataset: payload.transformationDataset ?? {},
    protectedDataSummary:
      payload.protectedDataSummary &&
      typeof payload.protectedDataSummary === 'object'
        ? (payload.protectedDataSummary as {
            exactCount: number
            patternCount: number
          })
        : { exactCount: 0, patternCount: 0 },
    requiredReplacements: payload.requiredReplacements ?? [],
  })
  const sourceCharacterCount = slim.reduce((n, b) => n + b.text.length, 0)
  const started = Date.now()
  let attemptCount = 1
  let configuredMaxOutputTokens = computeMaxOutputTokens({
    blockCount: slim.length,
    characterCount: sourceCharacterCount,
    attempt: 1,
  })
  let parseAttemptCount = 1

  console.info('[ai-contract-guarded-transform]', {
    runId,
    mode: 'guarded_ai_transform',
    model,
    promptVersion: GUARDED_AI_PROMPT_VERSION,
    blockCount: slim.length,
    characterCount: sourceCharacterCount,
    maxOutputTokens: configuredMaxOutputTokens,
    attempt: 1,
  })

  let openaiBody: unknown
  try {
    const first = await callOpenAi({
      apiKey,
      model,
      maxOutputTokens: configuredMaxOutputTokens,
      userPayload,
    })
    if (!first.ok) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: 'provider_api_error',
            message: 'OpenAI request failed',
            retryable: first.httpStatus >= 500,
          },
          diagnostics: {
            attemptCount,
            parseAttemptCount,
            configuredMaxOutputTokens,
            sourceBlockCount: slim.length,
            sourceCharacterCount,
            responseStatus: 'request_failed',
          },
        },
        502,
      )
    }
    openaiBody = first.body

    let parse = parseSparseV2FromResponse({
      body: openaiBody,
      applicationResponseVersion: GUARDED_AI_RESPONSE_VERSION,
    })
    const status = responseStatus(openaiBody)
    const incompleteReason =
      !parse.ok && parse.code === 'incomplete_response'
        ? parse.incompleteReason
        : undefined

    if (
      !parse.ok &&
      status === 'incomplete' &&
      shouldRetryIncomplete({
        attempt: 1,
        incompleteReason: incompleteReason ?? null,
      })
    ) {
      attemptCount = 2
      configuredMaxOutputTokens = computeMaxOutputTokens({
        blockCount: slim.length,
        characterCount: sourceCharacterCount,
        attempt: 2,
      })
      console.info('[ai-contract-guarded-transform]', {
        runId,
        model,
        retry: true,
        reason: 'max_output_tokens',
        maxOutputTokens: configuredMaxOutputTokens,
        attempt: 2,
      })
      const second = await callOpenAi({
        apiKey,
        model,
        maxOutputTokens: configuredMaxOutputTokens,
        userPayload,
      })
      if (!second.ok) {
        return jsonResponse(
          {
            ok: false,
            error: {
              code: 'provider_api_error',
              message: 'OpenAI request failed on retry',
              retryable: second.httpStatus >= 500,
            },
            diagnostics: {
              attemptCount,
              parseAttemptCount,
              configuredMaxOutputTokens,
              sourceBlockCount: slim.length,
              sourceCharacterCount,
              responseStatus: 'request_failed',
              incompleteReason,
            },
          },
          502,
        )
      }
      openaiBody = second.body
      parse = parseSparseV2FromResponse({
        body: openaiBody,
        applicationResponseVersion: GUARDED_AI_RESPONSE_VERSION,
      })
    } else if (
      shouldRetryParseFailure({
        attempt: 1,
        status,
        parse,
      })
    ) {
      parseAttemptCount = 2
      console.info('[ai-contract-guarded-transform]', {
        runId,
        model,
        retry: true,
        reason: 'parse_failure',
        parseFailureKind: !parse.ok ? parse.code : null,
        attempt: 1,
        parseAttempt: 2,
      })
      const second = await callOpenAi({
        apiKey,
        model,
        maxOutputTokens: configuredMaxOutputTokens,
        userPayload,
        extraUserHint: PARSE_RETRY_HINT,
      })
      if (!second.ok) {
        return jsonResponse(
          {
            ok: false,
            error: {
              code: 'provider_api_error',
              message: 'OpenAI request failed on parse retry',
              retryable: second.httpStatus >= 500,
            },
            diagnostics: {
              attemptCount,
              parseAttemptCount,
              configuredMaxOutputTokens,
              sourceBlockCount: slim.length,
              sourceCharacterCount,
              responseStatus: 'request_failed',
              ...extractionDiagnostics(parse),
            },
          },
          502,
        )
      }
      openaiBody = second.body
      parse = parseSparseV2FromResponse({
        body: openaiBody,
        applicationResponseVersion: GUARDED_AI_RESPONSE_VERSION,
      })
    }

    const usage = readUsage(openaiBody)
    const finalStatus = responseStatus(openaiBody)

    if (!parse.ok) {
      const failCode =
        parse.code === 'incomplete_response'
          ? 'incomplete_response'
          : parse.code
      console.info('[ai-contract-guarded-transform]', {
        runId,
        model,
        duration: Date.now() - started,
        responseStatus: finalStatus,
        parseFailureKind: parse.code,
        attemptCount,
        parseAttemptCount,
        configuredMaxOutputTokens,
        responseId: responseId(openaiBody),
        ...extractionDiagnostics(parse),
        ...usage,
      })
      return jsonResponse(
        {
          ok: false,
          error: {
            code: failCode,
            message: parse.message,
            retryable: parse.retryable,
            reason: parse.incompleteReason,
            configuredMaxOutputTokens,
          },
          diagnostics: {
            attemptCount,
            parseAttemptCount,
            configuredMaxOutputTokens,
            sourceBlockCount: slim.length,
            sourceCharacterCount,
            changedBlockCount: null,
            responseStatus: finalStatus,
            incompleteReason: parse.incompleteReason ?? null,
            responseId: responseId(openaiBody),
            ...extractionDiagnostics(parse),
            ...usage,
          },
        },
        422,
      )
    }

    console.info('[ai-contract-guarded-transform]', {
      runId,
      model,
      promptVersion: GUARDED_AI_PROMPT_VERSION,
      duration: Date.now() - started,
      responseStatus: finalStatus || 'completed',
      blockCount: slim.length,
      changedBlockCount: parse.changedBlocks.length,
      attemptCount,
      parseAttemptCount,
      configuredMaxOutputTokens,
      responseId: responseId(openaiBody),
      ...extractionDiagnostics(parse),
      ...usage,
    })

    return jsonResponse({
      ok: true,
      changedBlocks: parse.changedBlocks,
      model,
      promptVersion: GUARDED_AI_PROMPT_VERSION,
      responseVersion: GUARDED_AI_RESPONSE_VERSION,
      diagnostics: {
        attemptCount,
        parseAttemptCount,
        configuredMaxOutputTokens,
        sourceBlockCount: slim.length,
        sourceCharacterCount,
        changedBlockCount: parse.changedBlocks.length,
        responseStatus: finalStatus || 'completed',
        incompleteReason: null,
        responseId: responseId(openaiBody),
        ...extractionDiagnostics(parse),
        ...usage,
      },
    })
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'provider_api_error',
          message: 'OpenAI network error',
          retryable: true,
        },
      },
      502,
    )
  }
})
