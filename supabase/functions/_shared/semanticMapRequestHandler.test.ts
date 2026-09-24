import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { handleSemanticMapRequest, SEMANTIC_MAP_MODEL, SEMANTIC_MAP_REASONING_EFFORT } from './semanticMapRequestHandler'

const schema = { type: 'object', additionalProperties: false, required: ['semanticMappings', 'extrasPlacement', 'extrasStructure'], properties: {} }
const providerRequest = {
  model: 'gpt-5.6-terra', reasoning: { effort: 'medium' }, max_output_tokens: 8192,
  input: [{ role: 'system', content: 'accepted V7 prompt' }, { role: 'user', content: JSON.stringify({ promptVersion: 'semantic-map-v7-version-scoped-extras-structure', sourceBlocks: [], crmReferenceOnly: { clients: [] } }) }],
  text: { format: { type: 'json_schema', name: 'contract_semantic_mappings_v7_version_scoped_extras_structure', strict: true, schema } },
}
const makeRequest = (body: unknown = { request: providerRequest }) => new Request('https://local.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const env = (overrides: Record<string, string> = {}) => (name: string) => ({ OPENAI_API_KEY: 'unit-test-only', ...overrides }[name])
const deps = (overrides: Partial<Parameters<typeof handleSemanticMapRequest>[1]> = {}) => ({
  authenticate: async () => true,
  env: env(),
  fetch: globalThis.fetch,
  ...overrides,
})

async function run() {
  let sent: Record<string, unknown> | undefined
  let authHeader = ''
  const success = await handleSemanticMapRequest(makeRequest(), deps({
    fetch: async (_url, init) => {
      authHeader = new Headers(init?.headers).get('Authorization') ?? ''
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({ status: 'completed', output_text: '{"semanticMappings":[],"extrasPlacement":null,"extrasStructure":null}' })
    },
  }))
  assert.equal(success.status, 200, 'valid semantic V7 request reaches mocked provider')
  const successBody = await success.json() as Record<string, unknown>
  assert.deepEqual(successBody, { ok: true, outputText: '{"semanticMappings":[],"extrasPlacement":null,"extrasStructure":null}' })
  assert.equal(sent?.model, SEMANTIC_MAP_MODEL, 'semantic model configuration is used')
  assert.equal(sent?.reasoning && (sent.reasoning as { effort?: string }).effort, SEMANTIC_MAP_REASONING_EFFORT, 'medium reasoning is explicit')
  assert.deepEqual(sent?.input, providerRequest.input, 'accepted V7 prompt and context are reused unchanged')
  assert.deepEqual(sent?.text, providerRequest.text, 'accepted strict schema is reused unchanged')
  assert.equal(authHeader, 'Bearer unit-test-only', 'server secret authenticates provider request')
  assert.equal('Authorization' in successBody, false, 'provider credentials are not returned')
  assert.equal(JSON.stringify(sent).includes('extraPrice'), false, 'extra prices are not added to semantic request')

  const unauthenticated = await handleSemanticMapRequest(makeRequest(), deps({ authenticate: async () => false, fetch: async () => { throw new Error('must not fetch') } }))
  assert.equal(unauthenticated.status, 401, 'authentication is required before provider use')
  const authConfiguration = await handleSemanticMapRequest(makeRequest(), deps({ authenticate: async () => 'configuration', fetch: async () => { throw new Error('must not fetch') } }))
  assert.equal(authConfiguration.status, 503, 'auth infrastructure configuration fails closed')
  const malformedJson = await handleSemanticMapRequest(new Request('https://local.test', { method: 'POST', body: '{' }), deps())
  assert.equal(malformedJson.status, 400, 'malformed JSON fails closed')
  const invalid = await handleSemanticMapRequest(makeRequest({ request: { ...providerRequest, text: {} } }), deps())
  assert.equal(invalid.status, 400, 'invalid strict request is rejected')

  const missingConfig = await handleSemanticMapRequest(makeRequest(), deps({ env: env({ OPENAI_API_KEY: '' }) }))
  assert.equal(missingConfig.status, 503, 'missing model credentials fail closed')
  const badModel = await handleSemanticMapRequest(makeRequest(), deps({ env: env({ OPENAI_CONTRACT_SEMANTIC_MODEL: 'gpt-5.6-sol' }) }))
  assert.equal(badModel.status, 503, 'invalid semantic model configuration fails closed')

  const providerFailure = await handleSemanticMapRequest(makeRequest(), deps({ fetch: async () => new Response('provider error', { status: 500 }) }))
  assert.equal(providerFailure.status, 502, 'provider HTTP failure is typed and fail closed')
  const malformedProvider = await handleSemanticMapRequest(makeRequest(), deps({ fetch: async () => new Response('{', { status: 200 }) }))
  assert.equal(malformedProvider.status, 502, 'malformed provider JSON fails closed')
  const invalidProviderProtocol = await handleSemanticMapRequest(makeRequest(), deps({ fetch: async () => Response.json({ status: 'incomplete', output_text: '{}' }) }))
  assert.equal(invalidProviderProtocol.status, 502, 'non-completed provider response fails closed')
  const timeout = await handleSemanticMapRequest(makeRequest(), deps({ timeoutMs: 5, fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error) })
  }) }))
  assert.equal(timeout.status, 504, 'finite provider timeout is enforced')

  const edge = await readFile(new URL('../ai-contract-semantic-map/index.ts', import.meta.url), 'utf8')
  assert(edge.includes('requireAuthenticatedUser'), 'Edge uses repository authenticated-user helper')
  assert(edge.includes('buildRestrictedCorsHeaders'), 'Edge uses restricted CORS')
  assert(!/console\.(?:log|info|debug)\([^)]*(?:payload|Authorization|OPENAI_API_KEY)/i.test(edge), 'Edge does not log payloads or credentials')
  assert(!edge.includes('ai-contract-full-rewrite'), 'semantic Edge is isolated from legacy Edge')
  console.log('PASS semantic-map Edge handler: auth, strict V7 forwarding, config, timeout, failures, privacy, legacy isolation')
}

await run()
