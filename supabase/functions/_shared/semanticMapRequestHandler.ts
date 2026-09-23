export const SEMANTIC_MAP_MODEL = 'gpt-6-luna'
export const SEMANTIC_MAP_REASONING_EFFORT = 'medium'
export const SEMANTIC_MAP_TIMEOUT_MS = 45_000

type SemanticRequest = {
  model?: unknown
  reasoning?: unknown
  max_output_tokens?: unknown
  input?: unknown
  text?: unknown
}

export type SemanticMapHandlerDependencies = {
  authenticate: (request: Request) => Promise<boolean | 'configuration'>
  env: (name: string) => string | undefined
  fetch: typeof fetch
  timeoutMs?: number
}

function response(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function validRequest(value: unknown): value is SemanticRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as SemanticRequest
  if (!Array.isArray(request.input) || request.input.length !== 2) return false
  if (!request.input.every((item) => item && typeof item === 'object'
    && ((item as Record<string, unknown>).role === 'system' || (item as Record<string, unknown>).role === 'user')
    && typeof (item as Record<string, unknown>).content === 'string')) return false
  if (request.max_output_tokens !== 8192) return false
  const format = (request.text as { format?: Record<string, unknown> } | undefined)?.format
  const schema = format?.schema as Record<string, unknown> | undefined
  const required = schema?.required
  let hasAcceptedVersion = false
  try {
    const userContent = (request.input[1] as { content: string }).content
    const context = JSON.parse(userContent) as { promptVersion?: unknown }
    hasAcceptedVersion = context.promptVersion === 'semantic-map-v7-extras-placement'
  } catch { /* rejected below */ }
  return hasAcceptedVersion && format?.type === 'json_schema' && format.strict === true
    && format.name === 'contract_semantic_mappings_v5_extras_placement' && Boolean(schema)
    && schema?.type === 'object' && schema.additionalProperties === false
    && Array.isArray(required) && required.includes('semanticMappings') && required.includes('extrasPlacement')
}

function extractOutputText(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const value = body as Record<string, unknown>
  if (typeof value.output_text === 'string' && value.output_text.trim()) return value.output_text
  const output = Array.isArray(value.output) ? value.output : []
  const text = output.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    if (row.type !== 'message' && row.type !== 'output_message' && row.role !== 'assistant') return []
    return (Array.isArray(row.content) ? row.content : []).flatMap((part) =>
      part && typeof part === 'object' && (part as Record<string, unknown>).type === 'output_text'
        && typeof (part as Record<string, unknown>).text === 'string'
        ? [(part as Record<string, unknown>).text as string] : [])
  }).join('')
  return text.trim() ? text : null
}

async function timedProviderCall(fetcher: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<{ response: Response; body?: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const providerResponse = await fetcher(url, { ...init, signal: controller.signal })
    if (!providerResponse.ok) return { response: providerResponse }
    return { response: providerResponse, body: await providerResponse.json() }
  } catch (error) {
    if (controller.signal.aborted) {
      const timeout = new Error('provider_timeout')
      timeout.name = 'AbortError'
      throw timeout
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function handleSemanticMapRequest(
  request: Request,
  dependencies: SemanticMapHandlerDependencies,
): Promise<Response> {
  if (request.method !== 'POST') return response({ ok: false, error: { code: 'method_not_allowed' } }, 405)
  try {
    const auth = await dependencies.authenticate(request)
    if (auth === 'configuration') return response({ ok: false, error: { code: 'provider_configuration' } }, 503)
    if (!auth) return response({ ok: false, error: { code: 'unauthorized' } }, 401)
  } catch {
    return response({ ok: false, error: { code: 'unauthorized' } }, 401)
  }

  let payload: unknown
  try { payload = await request.json() } catch {
    return response({ ok: false, error: { code: 'invalid_request' } }, 400)
  }
  const envelope = payload as { request?: unknown } | null
  if (!envelope || !validRequest(envelope.request)) {
    return response({ ok: false, error: { code: 'invalid_request' } }, 400)
  }

  const apiKey = dependencies.env('OPENAI_API_KEY')?.trim()
  const configuredModel = dependencies.env('OPENAI_CONTRACT_SEMANTIC_MODEL')?.trim() || SEMANTIC_MAP_MODEL
  const configuredReasoning = dependencies.env('OPENAI_CONTRACT_SEMANTIC_REASONING_EFFORT')?.trim() || SEMANTIC_MAP_REASONING_EFFORT
  if (!apiKey || configuredModel !== SEMANTIC_MAP_MODEL || configuredReasoning !== SEMANTIC_MAP_REASONING_EFFORT) {
    return response({ ok: false, error: { code: 'provider_configuration' } }, 503)
  }

  const semanticRequest = envelope.request
  const controllerlessRequest = {
    model: configuredModel,
    reasoning: { effort: configuredReasoning },
    max_output_tokens: semanticRequest.max_output_tokens,
    input: semanticRequest.input,
    text: semanticRequest.text,
  }
  let providerResponse: Response
  let providerBody: unknown
  try {
    const call = await timedProviderCall(dependencies.fetch, 'https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(controllerlessRequest),
    }, dependencies.timeoutMs ?? SEMANTIC_MAP_TIMEOUT_MS)
    providerResponse = call.response
    providerBody = call.body
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return response({ ok: false, error: { code: 'provider_timeout' } }, 504)
    }
    return response({ ok: false, error: { code: 'provider_failure' } }, 502)
  }
  if (!providerResponse.ok) return response({ ok: false, error: { code: 'provider_failure' } }, 502)
  if ((providerBody as Record<string, unknown> | null)?.status !== 'completed') {
    return response({ ok: false, error: { code: 'provider_protocol' } }, 502)
  }
  const outputText = extractOutputText(providerBody)
  if (!outputText) return response({ ok: false, error: { code: 'provider_protocol' } }, 502)
  return response({ ok: true, outputText }, 200)
}
