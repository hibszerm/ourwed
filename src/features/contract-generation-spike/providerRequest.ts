import { fetchProviderResponse, ProviderOperationError } from './serverBoundary.ts'

export type StructuredProviderRequest = {
  system: string
  user: unknown
  schemaName: string
  schema: unknown
  model: string
  apiKey: string
  effort: string
  timeoutMs?: number
}

export const DEFAULT_PROVIDER_TIMEOUT_MS = 60_000
export const GENERATOR_PROVIDER_TIMEOUT_MS = 120_000

export type StructuredProviderRuntime = {
  createTimeoutSignal?: (milliseconds: number) => AbortSignal
  fetcher?: typeof fetch
}

const providerEndpoint = 'https://api.openai.com/v1/responses'

export async function callStructuredProvider(input: StructuredProviderRequest, runtime: StructuredProviderRuntime = {}): Promise<unknown> {
  let requestBody: string
  try {
    requestBody = JSON.stringify({
      model: input.model,
      reasoning: { effort: input.effort },
      max_output_tokens: 8192,
      input: [
        { role: 'system', content: input.system },
        { role: 'user', content: JSON.stringify(input.user) },
      ],
      text: { format: { type: 'json_schema', name: input.schemaName, strict: true, schema: input.schema } },
    })
  } catch {
    throw new ProviderOperationError('provider_failure', { providerFailureStage: 'request_build' })
  }

  let timeoutSignal: AbortSignal
  try {
    timeoutSignal = (runtime.createTimeoutSignal ?? ((milliseconds) => AbortSignal.timeout(milliseconds)))(input.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS)
  } catch {
    throw new ProviderOperationError('provider_failure', { providerFailureStage: 'timeout_setup' })
  }

  let response: Response
  try {
    response = await fetchProviderResponse(providerEndpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: requestBody,
    }, timeoutSignal, runtime.fetcher)
  } catch (error) {
    if (error instanceof ProviderOperationError) throw error
    throw new ProviderOperationError('provider_failure', { providerFailureStage: 'unknown_provider_failure' })
  }

  let responseBody: string
  try {
    responseBody = await response.text()
  } catch {
    throw new ProviderOperationError('invalid_response', { providerFailureStage: 'response_read' })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(responseBody) as Record<string, unknown>
  } catch {
    throw new ProviderOperationError('invalid_response', { providerFailureStage: 'response_parse' })
  }

  let text: string
  try {
    if (typeof body.output_text === 'string' && body.output_text.trim()) text = body.output_text
    else {
      const output = Array.isArray(body.output) ? body.output : []
      text = output.flatMap((item: Record<string, unknown>) => Array.isArray(item.content)
        ? item.content.flatMap((part: Record<string, unknown>) => part.type === 'output_text' && typeof part.text === 'string' ? [part.text] : [])
        : []).join('')
    }
  } catch {
    throw new ProviderOperationError('provider_failure', { providerFailureStage: 'structured_output', failureOrigin: 'STRUCTURED_OUTPUT_EXTRACTION_FAILURE' })
  }
  if (!text.trim()) throw new ProviderOperationError('invalid_response', { providerFailureStage: 'structured_output', failureOrigin: 'EMPTY_STRUCTURED_OUTPUT' })
  try {
    return JSON.parse(text)
  } catch {
    throw new ProviderOperationError('invalid_response', { providerFailureStage: 'response_parse' })
  }
}
