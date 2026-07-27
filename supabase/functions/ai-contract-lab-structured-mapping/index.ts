import {
  AI_CONTRACT_MAPPING_PROMPT_VERSION,
  STRUCTURED_MAPPING_EDGE_CONFIG,
  computeMaxOutputTokens,
  resolveMappingModel,
  shouldAttachLowReasoning,
} from './config.ts'
import {
  SYSTEM_PROMPT,
  buildUserPayload,
  type SlimBlock,
} from './prompt.ts'
import { FIELD_REGISTRY, IMMUTABLE_CONCEPTS } from './registry.ts'
import { STRUCTURED_MAPPING_JSON_SCHEMA } from './schema.ts'
import { buildOutputMetrics } from './outputMetrics.ts'
import { validateStructuredProposals } from './validateProposals.ts'
import {
  buildClassificationDiagnosticLog,
  classificationToApiError,
  extractOutputText,
  inspectOpenAiResponse,
} from './classifyResponse.ts'
import { mapProviderError, validateIncomingBlocks, type AiMappingApiErrorCode } from './validate.ts'

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

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function logClassification(input: {
  runId: string
  responseId: string | null
  model: string
  body: unknown
  parsed?: unknown
  structuredOutputValidationSucceeded?: boolean
}): ReturnType<typeof inspectOpenAiResponse> {
  const inspection = inspectOpenAiResponse({
    body: input.body,
    parsed: input.parsed,
    structuredOutputValidationSucceeded: input.structuredOutputValidationSucceeded,
  })
  console.info(
    '[ai-contract-mapping-classification]',
    buildClassificationDiagnosticLog({
      runId: input.runId,
      responseId: input.responseId,
      model: input.model,
      inspection,
    }),
  )
  return inspection
}

function errorResponse(
  classification: ReturnType<typeof inspectOpenAiResponse>['finalClassification'],
  status = 422,
): Response {
  const mapped = classificationToApiError(classification)
  return jsonResponse(
    {
      ok: false,
      error: {
        code: mapped.code,
        message: mapped.message,
        retryable: mapped.retryable,
      },
    },
    status,
  )
}

function slimBlocks(raw: unknown[]): {
  blocks: SlimBlock[]
  totalChars: number
} {
  const blocks: SlimBlock[] = []
  let totalChars = 0
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const text = typeof row.text === 'string' ? row.text : ''
    if (!id) continue
    if (text.length > STRUCTURED_MAPPING_EDGE_CONFIG.maxBlockTextChars) {
      throw new Error('block_too_large')
    }
    totalChars += text.length
    const kind = row.kind === 'tableCell' ? 'tableCell' : 'paragraph'
    const slim: SlimBlock = {
      id,
      kind,
      text,
      paragraphIndex:
        typeof row.paragraphIndex === 'number' ? row.paragraphIndex : 0,
    }
    if (kind === 'tableCell') {
      if (typeof row.tableIndex === 'number') slim.tableIndex = row.tableIndex
      if (typeof row.rowIndex === 'number') slim.rowIndex = row.rowIndex
      if (typeof row.cellIndex === 'number') slim.cellIndex = row.cellIndex
      if (Array.isArray(row.rowTexts)) {
        slim.rowTexts = row.rowTexts.filter((t) => typeof t === 'string')
      }
      if (Array.isArray(row.headerTexts)) {
        slim.headerTexts = row.headerTexts.filter((t) => typeof t === 'string')
      }
    }
    blocks.push(slim)
  }
  return { blocks, totalChars }
}

function extractUsage(raw: unknown): {
  inputTokens?: number
  outputTokens?: number
} {
  if (!raw || typeof raw !== 'object') return {}
  const usage = (raw as Record<string, unknown>).usage
  if (!usage || typeof usage !== 'object') return {}
  const u = usage as Record<string, unknown>
  return {
    inputTokens: typeof u.input_tokens === 'number' ? u.input_tokens : undefined,
    outputTokens:
      typeof u.output_tokens === 'number' ? u.output_tokens : undefined,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const started = Date.now()
  const runId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `run-${started}`

  if (req.method !== 'POST') {
    return jsonResponse(
      { ok: false, error: { code: 'request_failed', message: 'POST only' } },
      405,
    )
  }

  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'authentication_failed' satisfies AiMappingApiErrorCode,
          message: 'Brak autoryzacji.',
        },
      },
      401,
    )
  }

  const apiKey = resolveApiKey()
  if (!apiKey) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'not_configured' satisfies AiMappingApiErrorCode,
          message: 'Analiza AI nie jest skonfigurowana.',
        },
      },
      500,
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'request_failed' satisfies AiMappingApiErrorCode,
          message: 'Nieprawidłowy JSON.',
        },
      },
      400,
    )
  }

  const experimentRunId =
    typeof body.experimentRunId === 'string' ? body.experimentRunId : runId
  const pkg = body.package as Record<string, unknown> | undefined
  const doc = body.document as Record<string, unknown> | undefined
  const genCtx = body.generationContext as Record<string, unknown> | undefined

  const packageId = typeof pkg?.id === 'string' ? pkg.id : ''
  const packageName = typeof pkg?.name === 'string' ? pkg.name : ''
  const fileName =
    typeof doc?.fileName === 'string' ? doc.fileName : 'document.docx'
  const blocksRaw = Array.isArray(doc?.blocks) ? doc.blocks : []
  const expectedClientCount =
    typeof genCtx?.expectedClientCount === 'number'
      ? genCtx.expectedClientCount
      : 2
  const availableWeddingFields = Array.isArray(genCtx?.availableWeddingFields)
    ? (genCtx.availableWeddingFields as string[])
    : []
  const universallyRequiredTemplateFields = Array.isArray(
    genCtx?.universallyRequiredTemplateFields,
  )
    ? (genCtx.universallyRequiredTemplateFields as string[])
    : []
  const sourceConditionalFields = Array.isArray(genCtx?.sourceConditionalFields)
    ? (genCtx.sourceConditionalFields as string[])
    : []

  const blockGate = validateIncomingBlocks(blocksRaw)
  if (!blockGate.ok) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'document_too_large' satisfies AiMappingApiErrorCode,
          message: blockGate.message,
        },
      },
      413,
    )
  }

  let slimResult: { blocks: SlimBlock[]; totalChars: number }
  try {
    slimResult = slimBlocks(blocksRaw)
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'document_too_large' satisfies AiMappingApiErrorCode,
          message:
            'Dokument jest zbyt duży do jednorazowej analizy. Użyj krótszego wzoru albo podziel analizę.',
        },
      },
      413,
    )
  }

  const { blocks, totalChars } = slimResult
  if (
    blocks.length > STRUCTURED_MAPPING_EDGE_CONFIG.maxBlocks ||
    totalChars > STRUCTURED_MAPPING_EDGE_CONFIG.maxTotalSourceChars
  ) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'document_too_large' satisfies AiMappingApiErrorCode,
          message:
            'Dokument jest zbyt duży do jednorazowej analizy. Użyj krótszego wzoru albo podziel analizę.',
        },
      },
      413,
    )
  }

  const resolved = resolveMappingModel()
  const model = resolved.model

  const userPayload = buildUserPayload({
    fileName,
    packageName,
    expectedClientCount,
    availableWeddingFields,
    universallyRequiredTemplateFields,
    sourceConditionalFields,
    allowedDynamicFields: FIELD_REGISTRY,
    immutableConcepts: [...IMMUTABLE_CONCEPTS],
    blocks,
  })

  if (
    utf8Bytes(userPayload) >
    STRUCTURED_MAPPING_EDGE_CONFIG.maxSerializedPayloadBytes
  ) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'document_too_large' satisfies AiMappingApiErrorCode,
          message:
            'Dokument jest zbyt duży do jednorazowej analizy. Użyj krótszego wzoru albo podziel analizę.',
        },
      },
      413,
    )
  }

  console.info('[ai-contract-mapping-request]', {
    runId: experimentRunId,
    promptVersion: AI_CONTRACT_MAPPING_PROMPT_VERSION,
    model,
    blockCount: blocks.length,
    sourceCharacterCount: totalChars,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, STRUCTURED_MAPPING_EDGE_CONFIG.providerTimeoutMs)

  const maxOutputTokens = computeMaxOutputTokens(blocks.length, model)
  const requestBody: Record<string, unknown> = {
    model,
    store: false,
    max_output_tokens: maxOutputTokens,
    input: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPayload },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'ai_contract_structured_mapping',
        strict: true,
        schema: STRUCTURED_MAPPING_JSON_SCHEMA,
      },
    },
  }

  if (shouldAttachLowReasoning(model)) {
    requestBody.reasoning = { effort: 'low' }
  }

  let openaiRaw: unknown = null
  let openaiRequestId: string | null = null
  let httpStatus = 502

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    httpStatus = res.status
    openaiRaw = await res.json().catch(() => null)
    openaiRequestId =
      openaiRaw && typeof openaiRaw === 'object'
        ? (((openaiRaw as Record<string, unknown>).id as string) ?? null)
        : null

    if (!res.ok) {
      const mapped = mapProviderError(res.status, openaiRaw)
      logClassification({
        runId: experimentRunId,
        responseId: openaiRequestId,
        model,
        body: openaiRaw,
      })
      console.info('[ai-contract-mapping-response]', {
        runId: experimentRunId,
        model,
        responseId: openaiRequestId,
        durationMs: Date.now() - started,
        status: 'error',
        code: mapped.code,
      })
      return jsonResponse(
        {
          ok: false,
          error: {
            code: mapped.code,
            message: mapped.message,
            retryable: mapped.retryable,
          },
        },
        res.status >= 400 && res.status < 600 ? res.status : 502,
      )
    }

    const transportInspection = inspectOpenAiResponse({
      body: openaiRaw,
    })
    logClassification({
      runId: experimentRunId,
      responseId: openaiRequestId,
      model,
      body: openaiRaw,
    })

    if (transportInspection.hasExplicitRefusal) {
      console.info('[ai-contract-mapping-response]', {
        runId: experimentRunId,
        model,
        responseId: openaiRequestId,
        durationMs: Date.now() - started,
        status: 'refused',
      })
      return errorResponse('refused')
    }

    if (transportInspection.responseStatus === 'incomplete') {
      console.info('[ai-contract-mapping-response]', {
        runId: experimentRunId,
        model,
        responseId: openaiRequestId,
        durationMs: Date.now() - started,
        status: 'incomplete_response',
      })
      return errorResponse('incomplete_response')
    }

    if (transportInspection.responseStatus === 'failed') {
      console.info('[ai-contract-mapping-response]', {
        runId: experimentRunId,
        model,
        responseId: openaiRequestId,
        durationMs: Date.now() - started,
        status: 'request_failed',
      })
      return errorResponse('request_failed')
    }

    const text = extractOutputText(openaiRaw)
    if (!text) {
      const inspection = logClassification({
        runId: experimentRunId,
        responseId: openaiRequestId,
        model,
        body: openaiRaw,
      })
      console.info('[ai-contract-mapping-response]', {
        runId: experimentRunId,
        model,
        responseId: openaiRequestId,
        durationMs: Date.now() - started,
        status: inspection.finalClassification,
      })
      return errorResponse(inspection.finalClassification)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      const inspection = logClassification({
        runId: experimentRunId,
        responseId: openaiRequestId,
        model,
        body: openaiRaw,
        parsed: undefined,
        structuredOutputValidationSucceeded: false,
      })
      console.info('[ai-contract-mapping-response]', {
        runId: experimentRunId,
        model,
        responseId: openaiRequestId,
        durationMs: Date.now() - started,
        status: inspection.finalClassification,
      })
      return errorResponse('invalid_structured_output')
    }

    const blocksById = new Map(blocks.map((b) => [b.id, b.text] as const))
    const proposalGate = validateStructuredProposals(parsed, blocksById)
    if (!proposalGate.ok) {
      const inspection = logClassification({
        runId: experimentRunId,
        responseId: openaiRequestId,
        model,
        body: openaiRaw,
        parsed,
        structuredOutputValidationSucceeded: false,
      })
      console.info('[ai-contract-mapping-response]', {
        runId: experimentRunId,
        model,
        responseId: openaiRequestId,
        durationMs: Date.now() - started,
        status: inspection.finalClassification,
      })
      return jsonResponse(
        {
          ok: false,
          error: {
            code: 'invalid_structured_output' satisfies AiMappingApiErrorCode,
            message: `Odpowiedź zawiera nieprawidłowe wskazania pól (${proposalGate.reason}).`,
            retryable: false,
          },
        },
        422,
      )
    }

    logClassification({
      runId: experimentRunId,
      responseId: openaiRequestId,
      model,
      body: openaiRaw,
      parsed,
      structuredOutputValidationSucceeded: true,
    })

    const usage = extractUsage(openaiRaw)
    const durationMs = Date.now() - started
    const fieldCount = Array.isArray((parsed as Record<string, unknown>).fields)
      ? ((parsed as Record<string, unknown>).fields as unknown[]).length
      : 0
    const warningCount = Array.isArray(
      (parsed as Record<string, unknown>).warnings,
    )
      ? ((parsed as Record<string, unknown>).warnings as unknown[]).length
      : 0

    console.info('[ai-contract-mapping-response]', {
      runId: experimentRunId,
      model,
      responseId: openaiRequestId,
      durationMs,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      fieldCount,
      warningCount,
      status: 'completed',
    })

    console.info(
      '[ai-contract-mapping-output-metrics]',
      buildOutputMetrics({
        runId: experimentRunId,
        maxOutputTokens,
        parsed,
        responseText: text,
        blockCount: blocks.length,
      }),
    )

    return jsonResponse({
      ok: true,
      mapping: parsed,
      metadata: {
        model,
        requestCount: 1,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        durationMs,
        responseId: openaiRequestId,
        promptVersion: AI_CONTRACT_MAPPING_PROMPT_VERSION,
      },
      diagnostics: {
        promptVersion: AI_CONTRACT_MAPPING_PROMPT_VERSION,
        responseVersion: AI_CONTRACT_MAPPING_PROMPT_VERSION,
        systemPrompt: SYSTEM_PROMPT,
        taskPayload: JSON.parse(userPayload),
      },
    })
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    const code: AiMappingApiErrorCode = aborted ? 'timeout' : 'request_failed'
    console.info('[ai-contract-mapping-response]', {
      runId: experimentRunId,
      model,
      responseId: openaiRequestId,
      durationMs: Date.now() - started,
      status: 'error',
      code,
    })
    return jsonResponse(
      {
        ok: false,
        error: {
          code,
          message: aborted
            ? 'Analiza trwała zbyt długo. Spróbuj ponownie.'
            : 'Analiza AI nie powiodła się. Oryginalny dokument nie został zmieniony.',
          retryable: aborted,
        },
      },
      aborted ? 504 : httpStatus,
    )
  } finally {
    clearTimeout(timer)
  }
})
