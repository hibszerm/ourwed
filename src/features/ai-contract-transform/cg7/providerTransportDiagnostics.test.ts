import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureProviderResponseWithDiagnostics } from './providerTransportDiagnostics'

function response(status: number, text: () => Promise<string>): Response {
  return { status, text } as unknown as Response
}

function evidence(directory: string, goldenId: string) {
  return JSON.parse(readFileSync(join(directory, `${goldenId}-transport-diagnostics.json`), 'utf8'))
}

const base = { endpoint: 'https://api.openai.com/v1/responses', init: { method: 'POST', headers: { Authorization: 'Bearer synthetic-secret' }, body: '{}' } }

// A. Fetch rejects before a Response is received; error and nested fields survive.
{
  const directory = mkdtempSync(join(tmpdir(), 'provider-transport-fetch-'))
  const cause = Object.assign(new Error('connect failed'), { code: 'EHOSTUNREACH', errno: -65, syscall: 'connect', hostname: 'api.openai.com' })
  const error = Object.assign(new TypeError('fetch failed'), { code: 'UND_ERR_CONNECT_TIMEOUT', cause })
  const result = await captureProviderResponseWithDiagnostics({ ...base, directory, goldenId: 'G01', fetcher: async () => { throw error } })
  const saved = evidence(directory, 'G01')
  assert.equal(result.ok, false)
  assert.equal(saved.stage, 'FAILED_BEFORE_RESPONSE')
  assert.equal(saved.failureStage, 'before_response')
  assert.equal(saved.didFetchReturnResponse, false)
  assert.equal(saved.httpStatus, null)
  assert.equal(saved.errorName, 'TypeError')
  assert.equal(saved.errorCode, 'UND_ERR_CONNECT_TIMEOUT')
  assert.equal(saved.causeName, 'Error')
  assert.equal(saved.causeCode, 'EHOSTUNREACH')
  assert.equal(saved.errno, -65)
  assert.equal(saved.syscall, 'connect')
  assert.equal(saved.hostname, 'api.openai.com')
}

// B. A readable HTTP 200 captures status before and after body reading.
{
  const directory = mkdtempSync(join(tmpdir(), 'provider-transport-ok-'))
  const result = await captureProviderResponseWithDiagnostics({ ...base, directory, goldenId: 'G02', fetcher: async () => response(200, async () => '{"ok":true}') })
  const saved = evidence(directory, 'G02')
  assert.equal(result.ok, true)
  assert.equal(result.httpStatus, 200)
  assert.equal(result.bodyText, '{"ok":true}')
  assert.equal(saved.stage, 'BODY_READ_COMPLETE')
  assert.equal(saved.didFetchReturnResponse, true)
  assert.equal(saved.responseHeadersReceived, true)
  assert.equal(saved.bodyReadStarted, true)
  assert.equal(saved.bodyReadCompleted, true)
}

// C. Body read rejection retains the already-received HTTP 200.
{
  const directory = mkdtempSync(join(tmpdir(), 'provider-transport-body-'))
  const error = Object.assign(new Error('stream reset'), { code: 'ERR_STREAM_PREMATURE_CLOSE' })
  const result = await captureProviderResponseWithDiagnostics({ ...base, directory, goldenId: 'G03', fetcher: async () => response(200, async () => { throw error }) })
  const saved = evidence(directory, 'G03')
  assert.equal(result.ok, false)
  assert.equal(result.httpStatus, 200)
  assert.equal(saved.stage, 'FAILED_DURING_BODY_READ')
  assert.equal(saved.failureStage, 'during_body_read')
  assert.equal(saved.didFetchReturnResponse, true)
  assert.equal(saved.httpStatus, 200)
  assert.equal(saved.bodyReadStarted, true)
  assert.equal(saved.bodyReadCompleted, false)
  assert.equal(saved.errorMessage, 'stream reset')
  assert.equal(saved.errorCode, 'ERR_STREAM_PREMATURE_CLOSE')
}

// D. Non-2xx is still a completed transport capture with the actual status/body.
{
  const directory = mkdtempSync(join(tmpdir(), 'provider-transport-http-'))
  const result = await captureProviderResponseWithDiagnostics({ ...base, directory, goldenId: 'G04', fetcher: async () => response(429, async () => '{"error":"limited"}') })
  assert.equal(result.ok, true)
  assert.equal(result.httpStatus, 429)
  assert.equal(result.bodyText, '{"error":"limited"}')
  assert.equal(evidence(directory, 'G04').httpStatus, 429)
}

// E/F. Nested optional fields are retained when present; absent fields stay null.
{
  const directory = mkdtempSync(join(tmpdir(), 'provider-transport-cause-'))
  const cause = Object.assign(new Error('root cause'), { code: 'EAI_AGAIN' })
  const error = Object.assign(new Error('outer error'), { code: 'FETCH_ERR', cause })
  const result = await captureProviderResponseWithDiagnostics({ ...base, directory, goldenId: 'G05', fetcher: async () => { throw error } })
  assert.equal(result.diagnostics.causeMessage, 'root cause')
  assert.equal(result.diagnostics.causeCode, 'EAI_AGAIN')

  const missingDirectory = mkdtempSync(join(tmpdir(), 'provider-transport-missing-'))
  const missing = await captureProviderResponseWithDiagnostics({ ...base, directory: missingDirectory, goldenId: 'G06', fetcher: async () => { throw new Error('bare failure') } })
  const saved = evidence(missingDirectory, 'G06')
  assert.equal(missing.diagnostics.errorMessage, 'bare failure')
  assert.equal(saved.errorCode, null)
  assert.equal(saved.causeName, null)
  assert.equal(saved.causeMessage, null)
  assert.equal(saved.causeCode, null)
  assert.equal(saved.errno, null)
  assert.equal(saved.syscall, null)
  assert.equal(saved.hostname, null)
}

// G. Credential-like message material and explicit synthetic secrets never persist.
{
  const directory = mkdtempSync(join(tmpdir(), 'provider-transport-secret-'))
  const syntheticSecret = 'synthetic_secret_value_123'
  const error = new Error(`Authorization: Bearer sk-proj-123456789012345678 ${syntheticSecret} token=${syntheticSecret}`)
  await captureProviderResponseWithDiagnostics({ ...base, directory, goldenId: 'G07', sensitiveValues: [syntheticSecret], fetcher: async () => { throw error } })
  const text = readFileSync(join(directory, 'G07-transport-diagnostics.json'), 'utf8')
  assert.equal(text.includes(syntheticSecret), false)
  assert.equal(text.includes('sk-proj-123456789012345678'), false)
  assert.equal(text.includes('Bearer synthetic-secret'), false)
  assert.equal(text.includes('"Authorization"'), false)
  assert.match(text, /\[REDACTED\]/)
}

console.log('provider transport diagnostics tests: PASS')
