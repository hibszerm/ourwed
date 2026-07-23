import { DOCUMENT_TRANSFORM_EDGE_CONFIG } from './config.ts'

export interface OpenAiCallResult {
  text: string
}

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
  return null
}

function extractOutputText(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const response = body as Record<string, unknown>
  const direct = asNonEmptyString(response.output_text)
  if (direct) return direct

  const output = Array.isArray(response.output) ? response.output : null
  if (!output) return null

  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    if ((item as Record<string, unknown>).type === 'reasoning') continue
    const content = (item as Record<string, unknown>).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const text = asNonEmptyString((part as Record<string, unknown>).text)
      if (text) return text
    }
  }
  return null
}

export async function callOpenAiTransformJson(input: {
  systemPrompt: string
  userPayload: string
}): Promise<OpenAiCallResult> {
  const model = DOCUMENT_TRANSFORM_EDGE_CONFIG.model
  const apiKey = resolveApiKey()
  if (!apiKey) {
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
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPayload },
    ],
    text: { format: { type: 'json_object' } },
    max_output_tokens: DOCUMENT_TRANSFORM_EDGE_CONFIG.maxOutputTokens,
  }

  const controller = new AbortController()
  const timerHandle = setTimeout(
    () => controller.abort(),
    DOCUMENT_TRANSFORM_EDGE_CONFIG.providerTimeoutMs,
  )

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(requestBody),
    })

    const rawText = await res.text()
    let responseJson: unknown = null
    try {
      responseJson = rawText ? JSON.parse(rawText) : null
    } catch {
      responseJson = null
    }

    if (!res.ok) {
      throw new ProviderError({
        code: mapHttpToCode(res.status),
        message: 'AI provider request failed',
        httpStatus: res.status,
        model,
      })
    }

    const text = extractOutputText(responseJson)
    if (!text) {
      throw new ProviderError({
        code: 'empty_response',
        message: 'AI provider returned an empty transformation',
        httpStatus: res.status,
        model,
      })
    }
    return { text }
  } catch (e) {
    if (e instanceof ProviderError) throw e
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ProviderError({
        code: 'provider_timeout',
        message: 'AI provider request timed out',
        httpStatus: null,
        model,
      })
    }
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
