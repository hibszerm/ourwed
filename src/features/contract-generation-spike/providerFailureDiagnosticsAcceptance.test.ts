import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { callStructuredProvider, DEFAULT_PROVIDER_TIMEOUT_MS, GENERATOR_PROVIDER_TIMEOUT_MS } from './providerRequest'
import { ProviderOperationError, providerFailureTelemetry } from './serverBoundary'

const privateMarker = 'private-request-prompt-contract-response'
const failureStages = new Set(['request_build', 'timeout_setup', 'fetch_transport', 'fetch_timeout', 'http_non_ok', 'response_read', 'response_parse', 'structured_output', 'adapter_mapping', 'unknown_provider_failure'])
const input = {
  system: 'private prompt', user: { contract: privateMarker }, schemaName: 'test_schema', schema: { type: 'object' },
  model: 'safe-model-id', apiKey: 'private-api-key', effort: 'medium',
}

const edgeBoundary = readFileSync(new URL('../../../supabase/functions/contract-generation-boundary/index.ts', import.meta.url), 'utf8')
assert.equal((edgeBoundary.match(/timeoutMs:\s*GENERATOR_PROVIDER_TIMEOUT_MS/g) ?? []).length, 1, 'only the Generator adapter opts into its longer fetch timeout')

async function rejectsWithStage(run: () => Promise<unknown>, stage: string, failureClass?: string, status?: number) {
  try {
    await run()
    assert.fail('expected provider call to fail')
  } catch (error) {
    assert.ok(error instanceof ProviderOperationError)
    const telemetry = providerFailureTelemetry(error, error.category === 'provider_failure' ? 'unknown_provider_failure' : undefined)
    assert.equal(telemetry.providerFailureStage, stage)
    assert.ok(telemetry.providerFailureStage && failureStages.has(telemetry.providerFailureStage), 'every provider failure has a non-empty allowlisted stage')
    assert.equal(telemetry.providerFailureClass, failureClass)
    assert.equal(telemetry.providerHttpStatus, status)
    assert.equal(JSON.stringify(telemetry).includes(privateMarker), false, 'telemetry excludes request, prompt, and response content')
    assert.equal(JSON.stringify(telemetry).includes('private-api-key'), false, 'telemetry excludes API key')
    return { error, telemetry }
  }
}

{
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  let timeoutSetups = 0
  const { error } = await rejectsWithStage(() => callStructuredProvider({ ...input, user: cyclic }, {
    createTimeoutSignal: () => { timeoutSetups += 1; return new AbortController().signal },
  }), 'request_build')
  assert.equal(error.category, 'provider_failure')
  assert.equal(timeoutSetups, 0, 'request serialization keeps its established order before timeout setup')
}

{
  const { error } = await rejectsWithStage(() => callStructuredProvider(input, {
    createTimeoutSignal: () => { throw new Error(privateMarker) },
  }), 'timeout_setup')
  assert.equal(error.category, 'provider_failure')
}

{
  let calls = 0
  const { error } = await rejectsWithStage(() => callStructuredProvider(input, {
    createTimeoutSignal: () => new AbortController().signal,
    fetcher: async () => { calls += 1; throw new Error(privateMarker) },
  }), 'fetch_transport', 'transport_error')
  assert.equal(error.category, 'provider_failure')
  assert.equal(calls, 1, 'transport failure is not retried')
}

{
  const controller = new AbortController()
  controller.abort()
  let calls = 0
  const { error } = await rejectsWithStage(() => callStructuredProvider(input, {
    createTimeoutSignal: () => controller.signal,
    fetcher: async () => { calls += 1; throw new DOMException(privateMarker, 'TimeoutError') },
  }), 'fetch_timeout', 'timeout')
  assert.equal(error.category, 'provider_failure')
  assert.equal(calls, 1, 'timeout is not retried')
}

for (const [status, expectedClass] of [[400, 'http_400'], [401, 'http_401'], [403, 'http_403'], [404, 'http_404'], [408, 'http_408'], [409, 'http_409'], [429, 'http_429'], [500, 'http_5xx'], [502, 'http_5xx'], [503, 'http_5xx'], [418, 'http_other']] as const) {
  let bodyRead = false
  let calls = 0
  const { error } = await rejectsWithStage(() => callStructuredProvider(input, {
    createTimeoutSignal: () => new AbortController().signal,
    fetcher: async () => {
      calls += 1
      return {
        ok: false, status,
        text: async () => { bodyRead = true; throw new Error(privateMarker) },
      } as Response
    },
  }), 'http_non_ok', expectedClass, status)
  assert.equal(error.category, 'provider_failure')
  assert.equal(bodyRead, false, 'non-OK provider body is never read')
  assert.equal(calls, 1, 'HTTP failure is not retried')
}

{
  const { error } = await rejectsWithStage(() => callStructuredProvider(input, {
    createTimeoutSignal: () => new AbortController().signal,
    fetcher: async () => ({ ok: true, text: async () => { throw new Error(privateMarker) } } as Response),
  }), 'response_read')
  assert.equal(error.category, 'invalid_response', 'response-read external behavior is unchanged')
}

{
  const { error } = await rejectsWithStage(() => callStructuredProvider(input, {
    createTimeoutSignal: () => new AbortController().signal,
    fetcher: async () => ({ ok: true, text: async () => privateMarker } as Response),
  }), 'response_parse')
  assert.equal(error.category, 'invalid_response', 'response parse external behavior is unchanged')
}

{
  const { error } = await rejectsWithStage(() => callStructuredProvider(input, {
    createTimeoutSignal: () => new AbortController().signal,
    fetcher: async () => ({ ok: true, text: async () => JSON.stringify({ output: [{ content: [null] }] }) } as Response),
  }), 'structured_output')
  assert.equal(error.category, 'provider_failure', 'unexpected output mapping keeps the existing temporary-failure path')
  assert.equal(error.failureOrigin, 'STRUCTURED_OUTPUT_EXTRACTION_FAILURE')
}

{
  const { error, telemetry } = await rejectsWithStage(() => callStructuredProvider(input, {
    createTimeoutSignal: () => new AbortController().signal,
    fetcher: async () => ({ ok: true, text: async () => JSON.stringify({ output: [] }) } as Response),
  }), 'structured_output')
  assert.equal(error.category, 'invalid_response')
  assert.equal(error.failureOrigin, 'EMPTY_STRUCTURED_OUTPUT')
  assert.equal(telemetry.failureOrigin, 'EMPTY_STRUCTURED_OUTPUT', 'empty extracted output has its own closed diagnostic origin')
}

{
  const { error } = await rejectsWithStage(() => callStructuredProvider(input, {
    createTimeoutSignal: () => new AbortController().signal,
    fetcher: async () => ({ ok: true, text: async () => JSON.stringify({ output_text: 'not-json' }) } as Response),
  }), 'response_parse')
  assert.equal(error.category, 'invalid_response', 'structured JSON parse external behavior is unchanged')
}

{
  const projected = providerFailureTelemetry(new Error(privateMarker), 'unknown_provider_failure')
  assert.deepEqual(projected, { providerFailureStage: 'unknown_provider_failure' })
  assert.equal(JSON.stringify(projected).includes(privateMarker), false, 'fallback never retains exception text')
  assert.equal(providerFailureTelemetry({ providerFailureStage: 'http_non_ok', providerFailureClass: 'http_5xx', providerHttpStatus: 502 }).providerHttpStatus, 502)
  assert.equal(providerFailureTelemetry({ providerFailureStage: 'fetch_transport', providerFailureClass: 'transport_error', providerHttpStatus: 502 }).providerHttpStatus, undefined)
  assert.equal(providerFailureTelemetry({ providerFailureStage: 'not-allowlisted' }).providerFailureStage, undefined)
}

{
  let calls = 0
  const successful = await callStructuredProvider(input, {
    createTimeoutSignal: (milliseconds) => {
      assert.equal(milliseconds, DEFAULT_PROVIDER_TIMEOUT_MS, 'existing default timeout duration is preserved')
      return new AbortController().signal
    },
    fetcher: async (url, init) => {
      calls += 1
      assert.equal(url, 'https://api.openai.com/v1/responses')
      assert.equal(init?.method, 'POST')
      const requestBody = JSON.parse(String(init?.body))
      assert.equal(requestBody.model, input.model)
      assert.equal(requestBody.reasoning.effort, input.effort)
      return { ok: true, text: async () => JSON.stringify({ output_text: '{"status":"READY","edits":[]}' }) } as Response
    },
  })
  assert.deepEqual(successful, { status: 'READY', edits: [] }, 'successful structured output remains unchanged')
  assert.equal(calls, 1)
}

{
  assert.equal(DEFAULT_PROVIDER_TIMEOUT_MS, 60_000, 'Reviewer and Conflict Verifier retain their existing timeout')
  assert.equal(GENERATOR_PROVIDER_TIMEOUT_MS, 120_000, 'Generator receives the requested timeout')
  let calls = 0
  const result = await callStructuredProvider({ ...input, timeoutMs: GENERATOR_PROVIDER_TIMEOUT_MS }, {
    createTimeoutSignal: (milliseconds) => {
      assert.equal(milliseconds, 120_000, 'the Generator timeout reaches the provider fetch')
      return new AbortController().signal
    },
    fetcher: async () => {
      calls += 1
      return { ok: true, text: async () => JSON.stringify({ output_text: '{"status":"READY","edits":[]}' }) } as Response
    },
  })
  assert.deepEqual(result, { status: 'READY', edits: [] })
  assert.equal(calls, 1, 'the longer timeout does not add a retry')
}

console.log('Provider failure-stage matrix acceptance passed')
