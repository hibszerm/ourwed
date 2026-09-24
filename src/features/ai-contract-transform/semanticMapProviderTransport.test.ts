import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createSemanticMapProvider } from './semanticMapProviderTransport'
import { SemanticMapTransportError } from './semanticMapTransportTypes'
import { buildSemanticMapResponseSchema, SEMANTIC_MAP_MAX_OUTPUT_TOKENS, SEMANTIC_MAP_MODEL_IDS } from './semanticMapModelContract'

const outputText = '{"semanticMappings":[],"extrasPlacement":null,"extrasStructure":null}'
const request = {
  model: SEMANTIC_MAP_MODEL_IDS.terra,
  reasoning: { effort: 'medium' as const },
  max_output_tokens: SEMANTIC_MAP_MAX_OUTPUT_TOKENS,
  input: [{ role: 'system' as const, content: 'accepted prompt' }, { role: 'user' as const, content: '{"filtered":true}' }],
  text: { format: { type: 'json_schema' as const, ...buildSemanticMapResponseSchema() } },
}

async function run() {
  let received: unknown
  const provider = createSemanticMapProvider(async (body) => { received = body; return { data: { ok: true, outputText }, error: null } })
  const parsed = await provider(request)
  assert.deepEqual(received, { request }, 'client sends the accepted request through the dedicated edge seam')
  assert.equal(parsed.ok, true, 'strict V7 output returns as P0 provider result')
  assert.deepEqual(parsed.semanticMappings, [], 'parsed semantic mappings are returned to P0')

  const invalid = createSemanticMapProvider(async () => ({ data: { ok: true, outputText: '{' }, error: null }))
  await assert.rejects(invalid(request), (error: unknown) => error instanceof SemanticMapTransportError && error.failure === 'PROTOCOL_FAILURE')
  const invalidEnvelope = createSemanticMapProvider(async () => ({ data: { ok: true }, error: null }))
  await assert.rejects(invalidEnvelope(request), (error: unknown) => error instanceof SemanticMapTransportError && error.failure === 'PROTOCOL_FAILURE')
  const network = createSemanticMapProvider(async () => { throw new Error('offline') })
  await assert.rejects(network(request), (error: unknown) => error instanceof SemanticMapTransportError && error.failure === 'TRANSPORT_FAILURE')
  const auth = createSemanticMapProvider(async () => ({ data: null, error: { context: Response.json({ ok: false, error: { code: 'unauthorized' } }, { status: 401 }) } }))
  await assert.rejects(auth(request), (error: unknown) => error instanceof SemanticMapTransportError && error.failure === 'AUTH_FAILURE')
  const timeout = createSemanticMapProvider(async () => ({ data: null, error: { context: Response.json({ ok: false, error: { code: 'provider_timeout' } }, { status: 504 }) } }))
  await assert.rejects(timeout(request), (error: unknown) => error instanceof SemanticMapTransportError && error.failure === 'PROVIDER_TIMEOUT')
  const config = createSemanticMapProvider(async () => ({ data: null, error: { context: Response.json({ ok: false, error: { code: 'provider_configuration' } }, { status: 503 }) } }))
  await assert.rejects(config(request), (error: unknown) => error instanceof SemanticMapTransportError && error.failure === 'PROVIDER_CONFIGURATION_FAILURE')
  const providerFailure = createSemanticMapProvider(async () => ({ data: null, error: { context: Response.json({ ok: false, error: { code: 'provider_failure' } }, { status: 502 }) } }))
  await assert.rejects(providerFailure(request), (error: unknown) => error instanceof SemanticMapTransportError && error.failure === 'PROVIDER_FAILURE')
  const transportSource = await readFile(new URL('./semanticMapProviderTransport.ts', import.meta.url), 'utf8')
  const serviceSource = await readFile(new URL('./semanticContractGenerationService.ts', import.meta.url), 'utf8')
  assert(!transportSource.includes('changedBlocks'), 'new transport does not use legacy changedBlocks protocol')
  assert(!transportSource.includes('runSparseProductTransform'), 'new transport does not import the legacy generator')
  assert(!serviceSource.includes('runSparseProductTransform'), 'P0 provider path does not call the legacy generator')
  console.log('PASS semantic-map client transport: strict parsing, typed failures, provider seam')
}

await run()
