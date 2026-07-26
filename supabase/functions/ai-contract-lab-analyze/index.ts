import {
  AI_CONTRACT_LAB_EDGE_CONFIG,
  computeMaxOutputTokens,
  resolveContractLabModel,
  shouldAttachLowReasoning,
} from './config.ts'
import {
  ANALYSIS_JSON_SCHEMA,
  ANALYSIS_VERSION,
  SYSTEM_PROMPT,
  buildUserPrompt,
} from './prompt.ts'
import {
  logPhaseAFailure,
  softValidateProviderSemanticMap,
  type PhaseAErrorCode,
  type PhaseAStage,
} from './phaseAValidate.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CONTEXT_CHARS = AI_CONTRACT_LAB_EDGE_CONFIG.contextChars

type Stage =
  | 'request_received'
  | 'auth_completed'
  | 'payload_validated'
  | 'analysis_payload_built'
  | 'openai_request_started'
  | 'openai_response_received'
  | 'openai_response_parsed'
  | 'semantic_validation_completed'
  | 'response_returned'
  | 'request_failed'

type SafeLog = {
  requestId: string
  stage: Stage
  elapsedMs: number
  model?: string
  modelSource?: 'env' | 'fallback'
  anchorCount?: number
  canonicalFieldCount?: number
  inputBytes?: number
  inputCharacters?: number
  schemaBytes?: number
  outputCharacters?: number
  openaiRequestId?: string
  errorType?: string
  httpStatus?: number
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

function extractOutputText(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const response = body as Record<string, unknown>
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text
  }
  const output = Array.isArray(response.output) ? response.output : []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const itemType = (item as Record<string, unknown>).type
    if (itemType === 'reasoning') continue
    const content = (item as Record<string, unknown>).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const text = (part as Record<string, unknown>).text
      if (typeof text === 'string' && text.trim()) return text
    }
  }
  return null
}

function collapseWhitespace(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t\f\v]+/g, ' ')
}

function capContext(value: string): string {
  const cleaned = collapseWhitespace(value).trim()
  if (cleaned.length <= CONTEXT_CHARS) return cleaned
  return cleaned.slice(0, CONTEXT_CHARS)
}

function slimAnchors(raw: unknown[]): {
  anchors: Array<{
    anchorId: string
    text: string
    contextBefore: string
    contextAfter: string
    container: string
  }>
  characters: number
} {
  const anchors: Array<{
    anchorId: string
    text: string
    contextBefore: string
    contextAfter: string
    container: string
  }> = []
  let characters = 0
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const anchorId = typeof row.anchorId === 'string' ? row.anchorId : ''
    const text = typeof row.text === 'string' ? row.text : ''
    if (!anchorId || !text.trim()) continue
    characters += text.length
    anchors.push({
      anchorId,
      text,
      contextBefore: capContext(
        typeof row.contextBefore === 'string' ? row.contextBefore : '',
      ),
      contextAfter: capContext(
        typeof row.contextAfter === 'string' ? row.contextAfter : '',
      ),
      container: typeof row.container === 'string' ? row.container : 'body',
    })
  }
  return { anchors, characters }
}

function slimCatalog(raw: unknown[]): Array<{
  key: string
  label: string
  category: string
  formattedValue: string | null
  available: boolean
  dataType: string
}> {
  const out: Array<{
    key: string
    label: string
    category: string
    formattedValue: string | null
    available: boolean
    dataType: string
  }> = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const key = typeof row.key === 'string' ? row.key : ''
    if (!key) continue
    const formattedRaw =
      typeof row.formattedValue === 'string' ? row.formattedValue : null
    const formatted = formattedRaw
      ? collapseWhitespace(formattedRaw).trim() || null
      : null
    out.push({
      key,
      label: typeof row.label === 'string' ? row.label : key,
      category: typeof row.category === 'string' ? row.category : 'wedding',
      formattedValue: formatted,
      available: Boolean(formatted),
      dataType: typeof row.dataType === 'string' ? row.dataType : 'text',
    })
  }
  return out
}

/** Phase A role catalog — ids only, no wedding values. */
const SEMANTIC_ROLE_CATALOG = [
  'contract_date',
  'contract_execution_date',
  'wedding_date',
  'preparation_location',
  'ceremony_location',
  'reception_location',
  'civil_office',
  'church',
  'package_name',
  'package_price',
  'deposit_amount',
  'remaining_amount',
  'bank_account',
  'photographer_name',
  'videographer_name',
  'company_name',
  'company_nip',
  'company_regon',
  'company_address',
  'company_phone',
  'company_email',
  'client_name',
  'bride_name',
  'groom_name',
  'client_phone',
  'client_email',
  'bride_phone',
  'groom_phone',
  'bride_email',
  'groom_email',
  'bride_address',
  'groom_address',
  'delivery_deadline',
  'preview_deadline',
  'working_hours',
  'extra_hour_price',
  'final_payment_due_date',
  'deposit_due_date',
  'coverage_hours',
  'coverage_end_time',
  'package_contents',
  'deposit_refund_multiplier',
  'deposit_forfeiture_clause',
  'amount_reference_without_literal_value',
  'legal_clause_reference',
  'defined_party_term',
  'couple_defined_term',
  'client_defined_term',
  'contractor_defined_term',
  'legal_party_reference',
] as const


function createLogger(requestId: string) {
  const started = Date.now()
  const logs: SafeLog[] = []

  function log(stage: Stage, extra: Partial<SafeLog> = {}) {
    const entry: SafeLog = {
      requestId,
      stage,
      elapsedMs: Date.now() - started,
      ...extra,
    }
    logs.push(entry)
    console.info('[ai-contract-lab-analyze]', entry)
  }

  function flush() {
    // Deno/Supabase flush console synchronously before response return.
    console.info('[ai-contract-lab-analyze]', {
      requestId,
      stage: 'log_flush',
      elapsedMs: Date.now() - started,
      stages: logs.map((l) => l.stage),
    })
  }

  return { log, flush, started }
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function isTransientHttp(status: number): boolean {
  return status >= 500 && status <= 599
}

function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.name === 'AbortError') return false
  const msg = err.message.toLowerCase()
  return (
    msg.includes('connection reset') ||
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset')
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID()
  const logger = createLogger(requestId)
  logger.log('request_received')

  if (req.method !== 'POST') {
    logger.log('request_failed', { errorType: 'bad_request', httpStatus: 405 })
    logger.flush()
    return jsonResponse(
      { ok: false, error: { code: 'bad_request', message: 'POST only' } },
      405,
    )
  }

  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    logger.log('request_failed', { errorType: 'unauthorized', httpStatus: 401 })
    logger.flush()
    return jsonResponse(
      {
        ok: false,
        error: { code: 'unauthorized', message: 'Brak autoryzacji.' },
      },
      401,
    )
  }
  logger.log('auth_completed')

  const apiKey = resolveApiKey()
  if (!apiKey) {
    logger.log('request_failed', { errorType: 'misconfigured', httpStatus: 500 })
    logger.flush()
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'misconfigured',
          message:
            'Analiza AI nie powiodła się. Oryginalny dokument nie został zmieniony.',
        },
      },
      500,
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    logger.log('request_failed', { errorType: 'bad_request', httpStatus: 400 })
    logger.flush()
    return jsonResponse(
      {
        ok: false,
        error: { code: 'bad_request', message: 'Nieprawidłowy JSON.' },
      },
      400,
    )
  }

  const textAnchorsRaw = body.textAnchors
  // fieldCatalog is accepted for client compatibility but NOT sent to OpenAI in Phase A.
  const fieldCatalogRaw = Array.isArray(body.fieldCatalog)
    ? body.fieldCatalog
    : []

  if (!Array.isArray(textAnchorsRaw)) {
    logger.log('request_failed', { errorType: 'bad_request', httpStatus: 400 })
    logger.flush()
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'bad_request',
          message: 'Wymagane textAnchors.',
        },
      },
      400,
    )
  }

  const { anchors, characters } = slimAnchors(textAnchorsRaw)
  const fieldCatalog = slimCatalog(fieldCatalogRaw)
  const schemaJson = JSON.stringify(ANALYSIS_JSON_SCHEMA)
  const schemaBytes = utf8Bytes(schemaJson)
  // Phase A payload: anchors + role catalog only (no wedding PII / values)
  const serialized = JSON.stringify({
    textAnchors: anchors,
    semanticRoleCatalog: SEMANTIC_ROLE_CATALOG,
  })
  const inputBytes = utf8Bytes(serialized)

  logger.log('payload_validated', {
    anchorCount: anchors.length,
    canonicalFieldCount: fieldCatalog.length,
    inputBytes,
    inputCharacters: characters,
    schemaBytes,
  })

  if (
    anchors.length > AI_CONTRACT_LAB_EDGE_CONFIG.maxAnchors ||
    characters > AI_CONTRACT_LAB_EDGE_CONFIG.maxAnchorCharacters ||
    inputBytes > AI_CONTRACT_LAB_EDGE_CONFIG.maxSerializedPayloadBytes
  ) {
    logger.log('request_failed', {
      errorType: 'document_too_large',
      httpStatus: 413,
      anchorCount: anchors.length,
      inputBytes,
      inputCharacters: characters,
    })
    logger.flush()
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'document_too_large',
          message:
            'Dokument jest zbyt duży do jednorazowej analizy. Użyj krótszego wzoru albo podziel analizę.',
          retryable: false,
        },
      },
      413,
    )
  }

  const resolved = resolveContractLabModel()
  const model = resolved.model
  console.info('[ai-contract-lab-analyze]', {
    requestId,
    stage: 'model_selected',
    model,
    modelSource: resolved.source,
  })

  const userPrompt = buildUserPrompt({
    textAnchors: anchors,
    semanticRoleCatalog: SEMANTIC_ROLE_CATALOG,
  })
  const maxOutputTokens = computeMaxOutputTokens(anchors.length)

  logger.log('analysis_payload_built', {
    model,
    modelSource: resolved.source,
    anchorCount: anchors.length,
    canonicalFieldCount: fieldCatalog.length,
    inputBytes,
    inputCharacters: characters,
    schemaBytes,
  })

  const deadline = logger.started + AI_CONTRACT_LAB_EDGE_CONFIG.providerTimeoutMs
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, AI_CONTRACT_LAB_EDGE_CONFIG.providerTimeoutMs)

  async function callOpenAi(attempt: number): Promise<{
    ok: true
    raw: unknown
    text: string
    openaiRequestId: string | null
    outputCharacters: number
  } | {
    ok: false
    errorType: string
    httpStatus: number
    retryable: boolean
  }> {
    const remaining = deadline - Date.now()
    if (remaining < 5_000) {
      return {
        ok: false,
        errorType: 'provider_timeout',
        httpStatus: 504,
        retryable: true,
      }
    }

    const requestBody: Record<string, unknown> = {
      model,
      store: false,
      max_output_tokens: maxOutputTokens,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'ai_contract_lab_semantic_map',
          strict: true,
          schema: ANALYSIS_JSON_SCHEMA,
        },
      },
    }

    if (shouldAttachLowReasoning(model)) {
      requestBody.reasoning = { effort: 'low' }
    }

    logger.log('openai_request_started', {
      model,
      modelSource: resolved.source,
      anchorCount: anchors.length,
      canonicalFieldCount: fieldCatalog.length,
      inputBytes,
      inputCharacters: characters,
      schemaBytes,
    })

    const openaiStarted = Date.now()
    let res: Response
    try {
      res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError'
      return {
        ok: false,
        errorType: aborted ? 'provider_timeout' : 'network_error',
        httpStatus: aborted ? 504 : 502,
        retryable: !aborted && isRetryableNetworkError(err) && attempt === 0,
      }
    }

    const raw = await res.json().catch(() => null)
    logger.log('openai_response_received', {
      model,
      httpStatus: res.status,
      openaiRequestId:
        raw && typeof raw === 'object'
          ? ((raw as Record<string, unknown>).id as string | undefined)
          : undefined,
    })
    console.info('[ai-contract-lab-analyze]', {
      requestId,
      stage: 'openai_duration',
      openaiDurationMs: Date.now() - openaiStarted,
      attempt,
    })

    if (!res.ok) {
      const code =
        res.status === 401 || res.status === 403
          ? 'provider_auth'
          : res.status === 429
            ? 'rate_limit'
            : res.status === 408 || res.status === 504
              ? 'provider_timeout'
              : 'provider_error'
      return {
        ok: false,
        errorType: code,
        httpStatus:
          res.status >= 400 && res.status < 600 ? res.status : 502,
        retryable: isTransientHttp(res.status) && attempt === 0,
      }
    }

    const text = extractOutputText(raw)
    if (!text) {
      return {
        ok: false,
        errorType: 'invalid_provider_output',
        httpStatus: 502,
        retryable: false,
      }
    }

    return {
      ok: true,
      raw,
      text,
      openaiRequestId:
        raw && typeof raw === 'object'
          ? (((raw as Record<string, unknown>).id as string) ?? null)
          : null,
      outputCharacters: text.length,
    }
  }

  try {
    let result = await callOpenAi(0)
    if (!result.ok && result.retryable && Date.now() < deadline - 5_000) {
      console.info('[ai-contract-lab-analyze]', {
        requestId,
        stage: 'openai_retry',
        errorType: result.errorType,
      })
      result = await callOpenAi(1)
    }

    if (!result.ok) {
      const code: PhaseAErrorCode =
        result.errorType === 'provider_timeout'
          ? 'provider_timeout'
          : result.errorType === 'rate_limit'
            ? 'rate_limit'
            : result.errorType === 'provider_auth'
              ? 'provider_auth'
              : result.errorType === 'invalid_provider_output'
                ? 'provider_output_not_json'
                : result.errorType === 'network_error'
                  ? 'network_error'
                  : 'provider_error'

      const stage: PhaseAStage =
        code === 'provider_output_not_json'
          ? 'parse_provider_json'
          : 'provider_request'

      const message =
        code === 'provider_timeout'
          ? 'Analiza trwała zbyt długo. Spróbuj ponownie albo użyj krótszego dokumentu.'
          : code === 'rate_limit'
            ? 'Limit zapytań AI został wyczerpany. Spróbuj ponownie za chwilę.'
            : code === 'provider_auth'
              ? 'Autoryzacja dostawcy AI nie powiodła się.'
              : code === 'provider_output_not_json'
                ? 'OpenAI response was empty or not JSON'
                : 'Analiza AI nie powiodła się. Oryginalny dokument nie został zmieniony.'

      logPhaseAFailure({
        analysisVersion: ANALYSIS_VERSION,
        stage,
        code,
        inputAnchorCount: anchors.length,
        providerAnchorCount: 0,
        validAnchorCount: 0,
        invalidAnchorCount: 0,
        durationMs: Date.now() - logger.started,
      })

      logger.log('request_failed', {
        model,
        modelSource: resolved.source,
        errorType: code,
        httpStatus: result.httpStatus,
        anchorCount: anchors.length,
        inputBytes,
        inputCharacters: characters,
      })
      logger.flush()

      const status =
        result.httpStatus === 422 || result.httpStatus === 400
          ? 422
          : result.httpStatus

      return jsonResponse(
        {
          ok: false,
          error: {
            code,
            stage,
            message,
            analysisVersion: ANALYSIS_VERSION,
            issueCount: 0,
            issues: [],
            retryable:
              code === 'provider_timeout' ||
              code === 'rate_limit' ||
              code === 'network_error' ||
              code === 'provider_output_not_json',
          },
        },
        status,
      )
    }

    let semanticMapRaw: unknown
    try {
      semanticMapRaw = JSON.parse(result.text)
      logger.log('openai_response_parsed', {
        model,
        outputCharacters: result.outputCharacters,
        openaiRequestId: result.openaiRequestId ?? undefined,
      })
    } catch {
      const durationMs = Date.now() - logger.started
      logPhaseAFailure({
        analysisVersion: ANALYSIS_VERSION,
        stage: 'parse_provider_json',
        code: 'provider_output_not_json',
        inputAnchorCount: anchors.length,
        providerAnchorCount: 0,
        validAnchorCount: 0,
        invalidAnchorCount: 0,
        durationMs,
      })
      logger.log('request_failed', {
        errorType: 'provider_output_not_json',
        httpStatus: 422,
        outputCharacters: result.outputCharacters,
      })
      logger.flush()
      return jsonResponse(
        {
          ok: false,
          error: {
            code: 'provider_output_not_json' satisfies PhaseAErrorCode,
            stage: 'parse_provider_json' satisfies PhaseAStage,
            message: 'OpenAI response was not valid JSON',
            analysisVersion: ANALYSIS_VERSION,
            issueCount: 1,
            issues: [{ path: '', code: 'not_json' }],
          },
        },
        422,
      )
    }

    const knownIds = new Set(anchors.map((a) => a.anchorId))
    const validated = softValidateProviderSemanticMap(
      semanticMapRaw,
      knownIds,
      ANALYSIS_VERSION,
    )

    if (!validated.ok) {
      const durationMs = Date.now() - logger.started
      logPhaseAFailure({
        analysisVersion: validated.analysisVersion,
        stage: validated.stage,
        code: validated.code,
        inputAnchorCount: anchors.length,
        providerAnchorCount: validated.stats.providerRows,
        validAnchorCount: validated.stats.validRows,
        invalidAnchorCount: validated.stats.unresolvedRows,
        durationMs,
      })
      logger.log('request_failed', {
        errorType: validated.code,
        httpStatus: 422,
        anchorCount: anchors.length,
      })
      logger.flush()
      return jsonResponse(
        {
          ok: false,
          error: {
            code: validated.code,
            stage: validated.stage,
            message: validated.message,
            analysisVersion: validated.analysisVersion ?? ANALYSIS_VERSION,
            issueCount: validated.issues.length,
            issues: validated.issues,
            stats: validated.stats,
          },
        },
        422,
      )
    }

    logger.log('semantic_validation_completed', {
      model,
      openaiRequestId: result.openaiRequestId ?? undefined,
      outputCharacters: result.outputCharacters,
      anchorCount: anchors.length,
      canonicalFieldCount: fieldCatalog.length,
    })
    console.info('[ai-contract-lab-analyze]', {
      requestId,
      stage: 'phase_a_stats',
      ...validated.stats,
      durationMs: Date.now() - logger.started,
    })
    logger.log('response_returned', {
      model,
      modelSource: resolved.source,
      openaiRequestId: result.openaiRequestId ?? undefined,
      outputCharacters: result.outputCharacters,
      anchorCount: anchors.length,
      inputBytes,
    })
    logger.flush()

    return jsonResponse({
      ok: true,
      semanticMap: validated.semanticMap,
      stats: validated.stats,
      analysis: validated.semanticMap,
      requestId: result.openaiRequestId ?? requestId,
    })
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    logger.log('request_failed', {
      model,
      errorType: aborted ? 'provider_timeout' : 'provider_error',
      httpStatus: aborted ? 504 : 502,
    })
    logger.flush()
    return jsonResponse(
      {
        ok: false,
        error: {
          code: aborted ? 'provider_timeout' : 'provider_error',
          message: aborted
            ? 'Analiza trwała zbyt długo. Spróbuj ponownie albo użyj krótszego dokumentu.'
            : 'Analiza AI nie powiodła się. Oryginalny dokument nie został zmieniony.',
          retryable: aborted,
        },
      },
      aborted ? 504 : 502,
    )
  } finally {
    clearTimeout(timer)
  }
})
