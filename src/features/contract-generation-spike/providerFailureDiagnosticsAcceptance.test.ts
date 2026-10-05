import assert from 'node:assert/strict'
import { fetchProviderResponse, ProviderOperationError } from './serverBoundary'

const secret = 'private-request-contract-prompt-provider-body'
async function failure(run: (calls: number[]) => Promise<Response>) {
  const calls: number[] = []
  try {
    await run(calls)
    assert.fail('expected provider request to fail')
  } catch (error) {
    assert.ok(error instanceof ProviderOperationError)
    assert.equal(error.category, 'provider_failure')
    assert.equal(JSON.stringify({ providerFailureClass: error.providerFailureClass, providerHttpStatus: error.providerHttpStatus }).includes(secret), false)
    return { error, calls }
  }
}

const transport = await failure((calls) => fetchProviderResponse('https://provider.invalid', { method: 'POST', body: secret }, new AbortController().signal, async () => {
  calls.push(1)
  throw new Error(secret)
}))
assert.equal(transport.error.providerFailureClass, 'transport_error')
assert.equal(transport.error.providerHttpStatus, undefined)
assert.equal(transport.calls.length, 1, 'transport failure is not retried')

const controller = new AbortController()
controller.abort()
const timeout = await failure((calls) => fetchProviderResponse('https://provider.invalid', { method: 'POST', body: secret }, controller.signal, async () => {
  calls.push(1)
  throw new DOMException(secret, 'TimeoutError')
}))
assert.equal(timeout.error.providerFailureClass, 'timeout')
assert.equal(timeout.error.providerHttpStatus, undefined)
assert.equal(timeout.calls.length, 1, 'timeout is not retried')

for (const [status, expected] of [[400, 'http_400'], [401, 'http_401'], [403, 'http_403'], [404, 'http_404'], [408, 'http_408'], [409, 'http_409'], [429, 'http_429'], [500, 'http_5xx'], [502, 'http_5xx'], [418, 'http_other']] as const) {
  let bodyRead = false
  const { error, calls } = await failure((callCount) => fetchProviderResponse('https://provider.invalid', { method: 'POST', body: secret }, new AbortController().signal, async () => {
    callCount.push(1)
    return {
      ok: false,
      status,
      get body() { bodyRead = true; throw new Error(secret) },
      json: async () => { bodyRead = true; throw new Error(secret) },
      text: async () => { bodyRead = true; throw new Error(secret) },
    } as unknown as Response
  }))
  assert.equal(error.providerFailureClass, expected)
  assert.equal(error.providerHttpStatus, status)
  assert.equal(bodyRead, false, 'non-OK response body is not read')
  assert.equal(calls.length, 1, 'HTTP failure is not retried')
}

let successCalls = 0
const successResponse = new Response(JSON.stringify({ output_text: '{"status":"READY"}' }), { status: 200 })
assert.equal(await fetchProviderResponse('https://provider.invalid', { method: 'POST', body: secret }, new AbortController().signal, async () => {
  successCalls += 1
  return successResponse
}), successResponse, 'successful response is returned unchanged')
assert.equal(successCalls, 1)
console.log('Provider failure diagnostics acceptance passed')
