import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  RECOVERY_EDGE_CONFIG,
  WEDDING_CONTRACT_RECOVERY_PROMPT_VERSION,
  WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION,
  computeMaxOutputTokens,
  resolveRecoveryModel,
  shouldAttachLowReasoning,
} from './config.ts'
import { SYSTEM_PROMPT, buildUserPayload } from './prompt.ts'
import { RECOVERY_JSON_SCHEMA } from './schema.ts'
import {
  buildRecoveryUsageLogPayload,
  readRecoveryProviderUsage,
  summarizeExtractionTelemetry,
} from './providerUsage.ts'
import { extractOutputText, validateRecoveryExtraction } from './validate.ts'

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

function errorResponse(
  code: string,
  message: string,
  status = 422,
  retryable = false,
): Response {
  return jsonResponse(
    { ok: false, error: { code, message, retryable } },
    status,
  )
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

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt
}

function logTiming(
  stage: string,
  startedAt: number,
  extra?: Record<string, unknown>,
): void {
  console.info('[wedding-contract-recovery-timing]', {
    stage,
    elapsedMs: elapsedMs(startedAt),
    ...extra,
  })
}

Deno.serve(async (req) => {
  const requestStartedAt = Date.now()

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('CONTRACT_RECOVERY_AI_FAILED', 'Method not allowed', 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return errorResponse('CONTRACT_RECOVERY_UNAUTHORIZED', 'Unauthorized', 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return errorResponse('CONTRACT_RECOVERY_UNAUTHORIZED', 'Unauthorized', 401)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return errorResponse('CONTRACT_RECOVERY_AI_FAILED', 'Invalid JSON body', 400)
  }

  const plainText = typeof body.plainText === 'string' ? body.plainText : ''
  const fileName = typeof body.fileName === 'string' ? body.fileName : 'contract'
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'application/pdf'
  const recoveryId = typeof body.recoveryId === 'string' ? body.recoveryId : ''

  if (!plainText.trim()) {
    return errorResponse(
      'CONTRACT_RECOVERY_EMPTY_DOCUMENT_TEXT',
      'Nie udało się odczytać tekstu z tego pliku. Obsługa skanowanych umów zostanie dodana później.',
      422,
    )
  }

  if (plainText.length > RECOVERY_EDGE_CONFIG.maxInputChars) {
    return errorResponse(
      'CONTRACT_RECOVERY_AI_FAILED',
      'Dokument jest zbyt długi do analizy.',
      413,
    )
  }

  if (recoveryId) {
    const { data: recovery, error: recoveryError } = await supabase
      .from('wedding_contract_recoveries')
      .select('id, user_id')
      .eq('id', recoveryId)
      .maybeSingle()
    if (recoveryError || !recovery || recovery.user_id !== userData.user.id) {
      return errorResponse('CONTRACT_RECOVERY_UNAUTHORIZED', 'Unauthorized', 403)
    }
  }

  const apiKey = resolveApiKey()
  if (!apiKey) {
    return errorResponse(
      'CONTRACT_RECOVERY_AI_FAILED',
      'AI provider unavailable',
      502,
      true,
    )
  }

  const model = resolveRecoveryModel()
  const serializedSchemaLength = JSON.stringify(RECOVERY_JSON_SCHEMA).length
  const prepDurationMs = elapsedMs(requestStartedAt)
  logTiming('request_preparation_complete', requestStartedAt, {
    recoveryId: recoveryId || null,
    mimeType,
    textLength: plainText.length,
    model,
    providerTimeoutMs: RECOVERY_EDGE_CONFIG.providerTimeoutMs,
    serializedSchemaLength,
  })

  const requestBody: Record<string, unknown> = {
    model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: buildUserPayload({ plainText, fileName, mimeType }),
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

  if (shouldAttachLowReasoning(model)) {
    requestBody.reasoning = { effort: 'low' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), RECOVERY_EDGE_CONFIG.providerTimeoutMs)

  let openAiBody: unknown
  const openAiStartedAt = Date.now()
  logTiming('openai_request_start', requestStartedAt, {
    recoveryId: recoveryId || null,
    textLength: plainText.length,
    model,
  })
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
    openAiBody = await response.json()
    logTiming('openai_response_received', requestStartedAt, {
      recoveryId: recoveryId || null,
      openAiDurationMs: elapsedMs(openAiStartedAt),
      httpStatus: response.status,
      ok: response.ok,
    })
    if (!response.ok) {
      console.error(
        '[wedding-contract-recovery] provider error',
        response.status,
        // Status/error codes only — avoid dumping full provider body (may include snippets).
        isObjectSafe(openAiBody) && typeof openAiBody.error === 'object'
          ? JSON.stringify({ error: openAiBody.error })
          : 'provider_error',
      )
      return errorResponse(
        'CONTRACT_RECOVERY_AI_FAILED',
        'Analiza umowy nie powiodła się.',
        502,
        true,
      )
    }
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError'
    logTiming(aborted ? 'openai_request_aborted' : 'openai_request_failed', requestStartedAt, {
      recoveryId: recoveryId || null,
      openAiDurationMs: elapsedMs(openAiStartedAt),
      providerTimeoutMs: RECOVERY_EDGE_CONFIG.providerTimeoutMs,
      errorName: err instanceof Error ? err.name : typeof err,
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    return errorResponse(
      'CONTRACT_RECOVERY_AI_FAILED',
      aborted ? 'Analiza trwała zbyt długo. Spróbuj ponownie — dokument został zachowany.' : 'Analiza umowy nie powiodła się.',
      aborted ? 504 : 502,
      true,
    )
  } finally {
    clearTimeout(timeout)
  }

  const openAiDurationMs = elapsedMs(openAiStartedAt)
  const outputText = extractOutputText(openAiBody)
  logTiming('openai_output_extracted', requestStartedAt, {
    recoveryId: recoveryId || null,
    outputChars: outputText.length,
  })
  if (!outputText.trim()) {
    return errorResponse(
      'CONTRACT_RECOVERY_INVALID_AI_OUTPUT',
      'Nie udało się poprawnie rozpoznać danych z umowy.',
      422,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(outputText)
  } catch {
    return errorResponse(
      'CONTRACT_RECOVERY_INVALID_AI_OUTPUT',
      'Nie udało się poprawnie rozpoznać danych z umowy.',
      422,
    )
  }

  const validationStartedAt = Date.now()
  logTiming('schema_validation_start', requestStartedAt, {
    recoveryId: recoveryId || null,
  })

  if (!validateRecoveryExtraction(parsed)) {
    return errorResponse(
      'CONTRACT_RECOVERY_INVALID_AI_OUTPUT',
      'Nie udało się poprawnie rozpoznać danych z umowy.',
      422,
    )
  }

  const validationDurationMs = elapsedMs(validationStartedAt)
  logTiming('schema_validation_complete', requestStartedAt, {
    recoveryId: recoveryId || null,
    validationDurationMs,
  })

  const usage = readRecoveryProviderUsage(openAiBody)
  const extractionTelemetry = summarizeExtractionTelemetry(parsed)
  const totalDurationMs = elapsedMs(requestStartedAt)

  console.info(
    '[wedding-contract-recovery-usage]',
    buildRecoveryUsageLogPayload({
      model,
      usage,
      documentTextLength: plainText.length,
      serializedSchemaLength,
      rawResponseCharacterLength: outputText.length,
      requestPreparationDurationMs: prepDurationMs,
      openAiDurationMs,
      validationDurationMs,
      totalDurationMs,
      extraction: extractionTelemetry,
      promptVersion: WEDDING_CONTRACT_RECOVERY_PROMPT_VERSION,
      responseVersion: WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION,
      recoveryId: recoveryId || null,
    }),
  )

  logTiming('response_serialization_start', requestStartedAt, {
    recoveryId: recoveryId || null,
    totalDurationMs,
    openAiDurationMs,
    model,
    textLength: plainText.length,
  })

  return jsonResponse({
    ok: true,
    extraction: parsed,
    aiProvider: 'openai',
    aiModel: model,
    responseVersion: WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION,
  })
})

function isObjectSafe(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
