import { DOCUMENT_AI_EDGE_CONFIG } from './config.ts'
import {
  estimateTokenCount,
  type RequestTimer,
} from './timing.ts'

export interface OpenAiCallResult {
  text: string
}

/** Temporary debug result when extract finds no text — exposes raw OpenAI JSON. */
export interface OpenAiDebugEmptyResult {
  debugEmpty: true
  responseJson: unknown
}

export type OpenAiCallOutcome = OpenAiCallResult | OpenAiDebugEmptyResult

/** Provider failure — mapped to neutral Edge error codes for the client. */
export interface ProviderErrorPayload {
  code:
    | 'provider_unavailable'
    | 'provider_timeout'
    | 'provider_rate_limit'
    | 'unauthorized'
    | 'bad_request'
    | 'empty_response'
  message: string
  httpStatus: number | null
  model: string
}

export class ProviderError extends Error {
  readonly payload: ProviderErrorPayload

  constructor(payload: ProviderErrorPayload) {
    super(payload.message)
    this.name = 'ProviderError'
    this.payload = payload
  }
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

function mapHttpToCode(
  httpStatus: number | null,
): ProviderErrorPayload['code'] {
  if (httpStatus === 401 || httpStatus === 403) return 'unauthorized'
  if (httpStatus === 400 || httpStatus === 422) return 'bad_request'
  if (httpStatus === 429) return 'provider_rate_limit'
  if (httpStatus === 408 || httpStatus === 504) return 'provider_timeout'
  return 'provider_unavailable'
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value && typeof value === 'object') {
    try {
      const json = JSON.stringify(value)
      return json && json !== '{}' && json !== '[]' ? json : null
    } catch {
      return null
    }
  }
  return null
}

function contentParts(item: unknown): unknown[] {
  if (!item || typeof item !== 'object') return []
  const content = (item as Record<string, unknown>).content
  return Array.isArray(content) ? content : []
}

/**
 * Robust Responses API text extractor.
 * Tries documented shapes in order; returns first non-empty string + path.
 */
function extractOutputText(body: unknown): {
  text: string | null
  path: string | null
} {
  if (!body || typeof body !== 'object') {
    return { text: null, path: null }
  }
  const response = body as Record<string, unknown>

  // 1) response.output_text
  {
    const text = asNonEmptyString(response.output_text)
    if (text) {
      return { text, path: 'response.output_text' }
    }
  }

  const output = Array.isArray(response.output) ? response.output : null
  if (!output || output.length === 0) {
    return { text: null, path: null }
  }

  // 2) response.output[0].content[0].text
  {
    const parts = contentParts(output[0])
    if (parts.length > 0 && parts[0] && typeof parts[0] === 'object') {
      const text = asNonEmptyString(
        (parts[0] as Record<string, unknown>).text,
      )
      if (text) {
        return { text, path: 'response.output[0].content[0].text' }
      }
    }
  }

  // 3–6) Walk all output[].content[] fields in priority order.
  // Skip reasoning items — their text is not the model JSON payload.
  const fieldPriority = ['text', 'json', 'arguments', 'value'] as const

  for (const field of fieldPriority) {
    for (let i = 0; i < output.length; i++) {
      const item = output[i]
      if (item && typeof item === 'object') {
        const itemType = (item as Record<string, unknown>).type
        if (itemType === 'reasoning') continue
      }
      const parts = contentParts(item)
      for (let j = 0; j < parts.length; j++) {
        const part = parts[j]
        if (!part || typeof part !== 'object') continue
        const text = asNonEmptyString(
          (part as Record<string, unknown>)[field],
        )
        if (text) {
          return {
            text,
            path: `response.output[${i}].content[${j}].${field}`,
          }
        }
      }
    }
  }

  // Also accept top-level stringish fields on output items (some shapes)
  for (let i = 0; i < output.length; i++) {
    const item = output[i]
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    for (const field of ['text', 'content', 'result', 'value'] as const) {
      const text = asNonEmptyString(row[field])
      if (text) {
        return { text, path: `response.output[${i}].${field}` }
      }
    }
  }

  return { text: null, path: null }
}

function parseProviderMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const err = (body as { error?: Record<string, unknown> }).error
  if (!err || typeof err !== 'object') return null
  return typeof err.message === 'string' ? err.message : null
}

/**
 * Call OpenAI Responses API and return raw JSON text.
 * Never logs the API key.
 */
export async function callOpenAiResponsesJson(input: {
  prompt: string
  documentText: string
  timer?: RequestTimer
}): Promise<OpenAiCallOutcome> {
  const model = DOCUMENT_AI_EDGE_CONFIG.model
  const apiKey = resolveApiKey()
  const url = 'https://api.openai.com/v1/responses'
  const timer = input.timer

  if (!apiKey) {
    console.error('[document-ai] OPENAI_API_KEY missing in Edge runtime')
    throw new ProviderError({
      code: 'provider_unavailable',
      message: 'AI provider is not configured',
      httpStatus: null,
      model,
    })
  }

  const requestBody = {
    model,
    input: [
      {
        role: 'system',
        content: input.prompt,
      },
      {
        role: 'user',
        content: `DOCUMENT:\n${input.documentText}`,
      },
    ],
    text: {
      format: {
        type: 'json_object',
      },
    },
    /** Keep completion tiny — IDs + primitive values only. */
    max_output_tokens: 600,
  }

  const promptLen = input.prompt.length
  const docLen = input.documentText.length
  const requestJsonLen = JSON.stringify(requestBody).length

  timer?.log('OpenAI request start', {
    model,
    promptLength: promptLen,
    documentTextLength: docLen,
    estimatedPromptTokens: estimateTokenCount(promptLen),
    estimatedDocumentTokens: estimateTokenCount(docLen),
    estimatedRequestTokens: estimateTokenCount(requestJsonLen),
  })

  console.info('[document-ai] provider request', {
    url,
    model,
    method: 'POST',
  })

  const controller = new AbortController()
  const timerHandle = setTimeout(
    () => controller.abort(),
    DOCUMENT_AI_EDGE_CONFIG.providerTimeoutMs,
  )

  const openaiStartedAt = performance.now()

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(requestBody),
    })

    const rawText = await res.text()
    const openaiDurationMs = Math.round(performance.now() - openaiStartedAt)

    console.info(`[document-ai] OpenAI duration: ${openaiDurationMs} ms`)
    timer?.log('OpenAI response received', {
      httpStatus: res.status,
      ok: res.ok,
      openaiDurationMs,
      responseLength: rawText.length,
      estimatedResponseTokens: estimateTokenCount(rawText.length),
    })
    if (openaiDurationMs >= 1000) {
      console.warn('[document-ai] SLOW STEP', {
        step: 'OpenAI request',
        openaiDurationMs,
        elapsedMs: timer?.elapsedMs(),
        note: 'OpenAI call exceeded 1000ms',
      })
    }

    let responseJson: unknown = null
    if (rawText) {
      try {
        responseJson = JSON.parse(rawText)
      } catch {
        responseJson = { raw: rawText }
      }
    }

    // Exact OpenAI payload — no sanitize / map / transform.
    console.log(
      '[openai] RAW JSON',
      JSON.stringify(responseJson, null, 2),
    )

    console.info('[document-ai] provider response meta', {
      httpStatus: res.status,
      ok: res.ok,
      openaiDurationMs,
    })

    if (!res.ok) {
      const providerMessage = parseProviderMessage(responseJson)
      const code = mapHttpToCode(res.status)
      console.error('[document-ai] provider error', {
        httpStatus: res.status,
        code,
        openaiDurationMs,
        providerMessage,
      })
      throw new ProviderError({
        code,
        message: 'AI provider request failed',
        httpStatus: res.status,
        model,
      })
    }

    const { text, path } = extractOutputText(responseJson)
    if (!text) {
      const obj =
        responseJson && typeof responseJson === 'object'
          ? (responseJson as Record<string, unknown>)
          : null

      console.log('[openai] responseJson.output', obj?.output)
      console.log('[openai] responseJson.output_text', obj?.output_text)
      console.log('[openai] responseJson.content', obj?.content)
      console.log('[openai] responseJson', responseJson)

      // Temporary: do NOT throw empty_response — surface raw payload instead.
      return { debugEmpty: true, responseJson }
    }

    console.log('[openai] Parsed from:', path)
    console.log('Extracted chars:', text.length)

    console.info('[document-ai] provider success', {
      model,
      httpStatus: res.status,
      textLength: text.length,
      parsePath: path,
      openaiDurationMs,
    })

    return { text }
  } catch (e) {
    const openaiDurationMs = Math.round(performance.now() - openaiStartedAt)
    console.info(`[document-ai] OpenAI duration: ${openaiDurationMs} ms`)

    if (e instanceof ProviderError) throw e

    if (e instanceof DOMException && e.name === 'AbortError') {
      console.error('[document-ai] provider timeout', {
        model,
        openaiDurationMs,
      })
      throw new ProviderError({
        code: 'provider_timeout',
        message: 'AI provider request timed out',
        httpStatus: null,
        model,
      })
    }

    console.error('[document-ai] unexpected provider failure', {
      model,
      openaiDurationMs,
      error: e instanceof Error ? e.message : String(e),
    })
    throw new ProviderError({
      code: 'provider_unavailable',
      message: 'AI provider is temporarily unavailable',
      httpStatus: null,
      model,
    })
  } finally {
    clearTimeout(timerHandle)
  }
}
