import { DOCUMENT_AI_EDGE_CONFIG } from './config.ts'

export interface GeminiCallResult {
  text: string
}

/** Structured Gemini provider failure (diagnostics — preserves Google error). */
export interface GeminiProviderErrorPayload {
  provider: 'gemini'
  httpStatus: number | null
  googleCode: string | null
  googleMessage: string | null
  internalCode: string
  model: string
  /** URL with API key redacted. */
  requestUrl: string
  /** Truncated Google response body for debugging (no secrets). */
  googleBody?: unknown
  /** Exact outbound request (redacted) for diagnostics. */
  debugRequest?: {
    method: string
    url: string
    headers: Record<string, string>
    body: unknown
    modelRaw: string
    modelNormalized: string
    modelCharCodes: number[]
  }
}

export class GeminiProviderError extends Error {
  readonly payload: GeminiProviderErrorPayload

  constructor(payload: GeminiProviderErrorPayload) {
    super(
      payload.googleMessage ??
        payload.googleCode ??
        payload.internalCode ??
        'gemini_error',
    )
    this.name = 'GeminiProviderError'
    this.payload = payload
  }
}

function redactUrl(url: string): string {
  return url.replace(/([?&]key=)[^&]*/gi, '$1REDACTED')
}

/**
 * Normalize model id for URL path:
 * - trim whitespace / wrapping quotes
 * - strip leading "models/" if present (ListModels name form)
 * Must be exactly e.g. gemini-2.5-flash (no duplicated models/ prefix).
 */
export function normalizeGeminiModelId(raw: string): string {
  let model = raw.trim()
  if (
    (model.startsWith('"') && model.endsWith('"')) ||
    (model.startsWith("'") && model.endsWith("'"))
  ) {
    model = model.slice(1, -1).trim()
  }
  if (model.toLowerCase().startsWith('models/')) {
    model = model.slice('models/'.length)
  }
  return model
}

function mapInternalCode(
  httpStatus: number | null,
  googleStatus: string | null,
): string {
  const status = (googleStatus ?? '').toUpperCase()
  if (status === 'PERMISSION_DENIED' || httpStatus === 403) {
    return 'gemini_permission_denied'
  }
  if (
    status === 'NOT_FOUND' ||
    status === 'MODEL_NOT_FOUND' ||
    httpStatus === 404
  ) {
    return 'gemini_model_not_found'
  }
  if (status === 'RESOURCE_EXHAUSTED' || httpStatus === 429) {
    return 'gemini_rate_limit'
  }
  if (status === 'INVALID_ARGUMENT' || httpStatus === 400) {
    return 'gemini_invalid_argument'
  }
  if (status === 'UNAUTHENTICATED' || httpStatus === 401) {
    return 'gemini_unauthenticated'
  }
  if (status === 'FAILED_PRECONDITION') {
    return 'gemini_failed_precondition'
  }
  if (httpStatus != null && httpStatus >= 500) {
    return 'gemini_unavailable'
  }
  if (httpStatus == null) {
    return 'gemini_unavailable'
  }
  return `gemini_http_${httpStatus}`
}

function parseGoogleError(body: unknown): {
  googleCode: string | null
  googleMessage: string | null
} {
  if (!body || typeof body !== 'object') {
    return { googleCode: null, googleMessage: null }
  }
  const err = (body as { error?: Record<string, unknown> }).error
  if (!err || typeof err !== 'object') {
    return { googleCode: null, googleMessage: null }
  }
  const googleCode =
    typeof err.status === 'string'
      ? err.status
      : typeof err.code === 'string'
        ? err.code
        : typeof err.code === 'number'
          ? String(err.code)
          : null
  const googleMessage =
    typeof err.message === 'string' ? err.message : null
  return { googleCode, googleMessage }
}

function resolveApiKey(): string | null {
  const raw = Deno.env.get('GEMINI_API_KEY')
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

async function postGenerateContent(input: {
  url: string
  apiKey: string
  requestBody: unknown
  signal: AbortSignal
}): Promise<{ status: number; ok: boolean; body: unknown; rawText: string }> {
  const res = await fetch(input.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': input.apiKey,
    },
    signal: input.signal,
    body: JSON.stringify(input.requestBody),
  })
  const rawText = await res.text()
  let body: unknown = null
  if (rawText) {
    try {
      body = JSON.parse(rawText)
    } catch {
      body = { raw: rawText.slice(0, 2000) }
    }
  }
  return { status: res.status, ok: res.ok, body, rawText }
}

function extractCandidateText(body: unknown): string | null {
  const json = body as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
    }>
  }
  const text = json?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim()
  return text || null
}

/**
 * Call Gemini generateContent with JSON mime type.
 * Current official REST shape (ai.google.dev):
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   Header: x-goog-api-key
 *   Body: { contents: [{ role, parts }], generationConfig }
 * Never logs the API key.
 */
export async function callGeminiGenerateJson(input: {
  prompt: string
  documentText: string
}): Promise<GeminiCallResult> {
  const modelRaw = DOCUMENT_AI_EDGE_CONFIG.model
  const model = normalizeGeminiModelId(modelRaw)
  const apiKey = resolveApiKey()

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const safeUrl = redactUrl(url)

  if (!apiKey) {
    console.error('[geminiClient] GEMINI_API_KEY missing in Edge runtime')
    throw new GeminiProviderError({
      provider: 'gemini',
      httpStatus: null,
      googleCode: null,
      googleMessage: 'GEMINI_API_KEY is not configured in Edge Function secrets',
      internalCode: 'gemini_missing_api_key',
      model,
      requestUrl: safeUrl,
    })
  }

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${input.prompt}\n\n---\nDOCUMENT TEXT:\n${input.documentText}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  }

  const debugRequest = {
    method: 'POST',
    url: safeUrl,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': 'REDACTED',
    },
    body: requestBody,
    modelRaw,
    modelNormalized: model,
    modelCharCodes: [...model].map((c) => c.charCodeAt(0)),
  }

  console.info('[geminiClient] exact request', debugRequest)

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    DOCUMENT_AI_EDGE_CONFIG.geminiTimeoutMs,
  )

  try {
    const res = await postGenerateContent({
      url,
      apiKey,
      requestBody,
      signal: controller.signal,
    })

    console.info('[geminiClient] exact response meta', {
      httpStatus: res.status,
      ok: res.ok,
      bodyPreview: res.body,
    })

    if (!res.ok) {
      const { googleCode, googleMessage } = parseGoogleError(res.body)
      const internalCode = mapInternalCode(res.status, googleCode)

      let modelProbe: unknown = null
      try {
        const probeUrl =
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`
        const probeRes = await fetch(probeUrl, {
          method: 'GET',
          headers: { 'x-goog-api-key': apiKey },
        })
        const probeText = await probeRes.text()
        let probeBody: unknown = probeText
        try {
          probeBody = JSON.parse(probeText)
        } catch {
          /* keep text */
        }
        modelProbe = { httpStatus: probeRes.status, body: probeBody }
        console.info('[geminiClient] model probe GET', {
          url: probeUrl,
          httpStatus: probeRes.status,
          body: probeBody,
        })
      } catch (probeErr) {
        modelProbe = {
          error: probeErr instanceof Error ? probeErr.message : String(probeErr),
        }
      }

      console.error('[geminiClient] Google error', {
        requestUrl: safeUrl,
        model,
        httpStatus: res.status,
        googleCode,
        googleMessage,
        googleBody: res.body,
        internalCode,
        modelProbe,
      })

      throw new GeminiProviderError({
        provider: 'gemini',
        httpStatus: res.status,
        googleCode,
        googleMessage,
        internalCode,
        model,
        requestUrl: safeUrl,
        googleBody: {
          generateContentError: res.body,
          modelProbe,
        },
        debugRequest,
      })
    }

    const text = extractCandidateText(res.body)
    if (!text) {
      console.error('[geminiClient] empty candidates', {
        requestUrl: safeUrl,
        model,
        httpStatus: res.status,
        googleBody: res.body,
      })
      throw new GeminiProviderError({
        provider: 'gemini',
        httpStatus: res.status,
        googleCode: 'EMPTY_RESPONSE',
        googleMessage: 'Gemini returned no candidate text',
        internalCode: 'empty_response',
        model,
        requestUrl: safeUrl,
        googleBody: res.body,
        debugRequest,
      })
    }

    console.info('[geminiClient] success', {
      requestUrl: safeUrl,
      model,
      httpStatus: res.status,
      textLength: text.length,
    })

    return { text }
  } catch (e) {
    if (e instanceof GeminiProviderError) throw e

    if (e instanceof DOMException && e.name === 'AbortError') {
      console.error('[geminiClient] timeout', {
        requestUrl: safeUrl,
        model,
      })
      throw new GeminiProviderError({
        provider: 'gemini',
        httpStatus: null,
        googleCode: 'TIMEOUT',
        googleMessage: 'Gemini request timed out',
        internalCode: 'timeout',
        model,
        requestUrl: safeUrl,
        debugRequest,
      })
    }

    console.error('[geminiClient] unexpected', {
      requestUrl: safeUrl,
      model,
      error: e instanceof Error ? e.message : String(e),
    })
    throw new GeminiProviderError({
      provider: 'gemini',
      httpStatus: null,
      googleCode: null,
      googleMessage: e instanceof Error ? e.message : String(e),
      internalCode: 'gemini_unavailable',
      model,
      requestUrl: safeUrl,
      debugRequest,
    })
  } finally {
    clearTimeout(timer)
  }
}
