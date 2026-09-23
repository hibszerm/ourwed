import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createOneCallBudget,
  HarnessFailure,
  invokeExactlyOnce,
  parseHarnessArgs,
  prepareSemanticV7G01,
  runSemanticV7G01Harness,
  SEMANTIC_V7_G01_AUTH_ACK,
  SEMANTIC_V7_G01_MODEL,
  SEMANTIC_V7_G01_REASONING,
  SEMANTIC_V7_G01_SOURCE_SHA256,
  SEMANTIC_V7_G01_SOURCE_IDENTITY,
} from './semanticV7G01Harness'
import { groundParsedSemanticMapResponse, parseSemanticMapResponse } from '@/features/ai-contract-transform/semanticMapModelContract'

const root = process.cwd()
const checks: string[] = []
function check(name: string, fn: () => void | Promise<void>) {
  checks.push(name)
  return Promise.resolve().then(fn)
}
function expectCode(code: string, fn: () => unknown) {
  assert.throws(fn, (error: unknown) => error instanceof HarnessFailure && error.code === code)
}
function testRequest() {
  return {
    model: SEMANTIC_V7_G01_MODEL,
    reasoning: { effort: SEMANTIC_V7_G01_REASONING },
    max_output_tokens: 8192,
    input: [{ role: 'system', content: 'synthetic' }, { role: 'user', content: '{}' }],
    text: { format: { type: 'json_schema', name: 'synthetic', strict: true, schema: {} } },
  } as never
}
function responseBody(outputText: string, status = 'completed') {
  return JSON.stringify({
    id: 'resp_synthetic', status, model: SEMANTIC_V7_G01_MODEL,
    output_text: outputText,
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: outputText }] }],
    usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 2 }, output_tokens: 5, output_tokens_details: { reasoning_tokens: 1 } },
  })
}
const emptyValidOutput = JSON.stringify({ semanticMappings: [], extrasPlacement: null })

await check('default dry run requires explicit G01 and never reads key or calls provider', async () => {
  let keyReads = 0
  let networkCalls = 0
  const result = await runSemanticV7G01Harness(['--golden', 'G01'], {
    repositoryRoot: root,
    readKey: () => { keyReads += 1; throw new Error('must not read') },
    fetcher: async () => { networkCalls += 1; throw new Error('must not fetch') },
    runId: undefined,
  } as never)
  assert.equal(result.mode, 'DRY_RUN')
  assert.equal(result.providerCalls, 0)
  assert.equal(result.keyRead, false)
  assert.equal(keyReads, 0)
  assert.equal(networkCalls, 0)
})

await check('live flag and exact selector are explicit', () => {
  assert.deepEqual(parseHarnessArgs(['--golden', 'G01']), { golden: 'G01', live: false, confirmed: false })
  assert.equal(parseHarnessArgs(['--golden', 'G01', '--live', SEMANTIC_V7_G01_AUTH_ACK]).live, true)
  expectCode('GOLDEN_G01_SELECTOR_REQUIRED', () => parseHarnessArgs([]))
  expectCode('GOLDEN_G01_SELECTOR_REQUIRED', () => parseHarnessArgs(['--golden', 'G02']))
  expectCode('CONFIRMATION_REQUIRES_LIVE_FLAG', () => parseHarnessArgs(['--golden', 'G01', SEMANTIC_V7_G01_AUTH_ACK]))
})

await check('canonical G01 preflight builds current V7 request and safe summary', async () => {
  const prepared = await prepareSemanticV7G01({ repositoryRoot: root, runId: 'test-run', now: () => new Date('2026-09-23T00:00:00.000Z') })
  assert.equal(prepared.sourceHash, SEMANTIC_V7_G01_SOURCE_SHA256)
  assert.equal(prepared.requestSummary.protocol, 'semantic-map-v7-extras-placement')
  assert.equal(prepared.requestSummary.sourceIdentity, SEMANTIC_V7_G01_SOURCE_IDENTITY)
  assert.equal(prepared.outgoingRequest.model, 'gpt-6-luna')
  assert.equal(prepared.outgoingRequest.reasoning.effort, 'medium')
  assert.equal(prepared.requestSummary.maxProviderCalls, 1)
  assert.equal(prepared.requestSummary.retries, 0)
  assert.equal(prepared.request.input[0]?.content.includes('You identify semantic facts in a wedding contract.'), true)
  assert.equal(prepared.request.text.format.type, 'json_schema')
  const userContext = JSON.parse(prepared.request.input[1]!.content) as {
    promptVersion: string
    selectedExtrasPresent: boolean
    wedding?: unknown
    additionalServices?: unknown
    crmReferenceOnly: Record<string, unknown>
  }
  assert.equal(userContext.promptVersion, 'semantic-map-v7-extras-placement')
  assert.equal(userContext.selectedExtrasPresent, true)
  assert.equal(Object.hasOwn(userContext, 'wedding'), false)
  assert.equal(Object.hasOwn(userContext, 'additionalServices'), false)
  assert.equal(Object.hasOwn(userContext.crmReferenceOnly, 'additionalServices'), false)
  assert.equal(prepared.sourceBlocks.some((block) => block.text && block.blockId), true)
  const safe = JSON.stringify(prepared.requestSummary)
  assert.equal(safe.includes('Zofia Kalendarzowa'), false)
  assert.equal(safe.includes('zofia.kalendarzowa@example.com'), false)
  assert.equal(safe.includes('Authorization'), false)
  assert.equal(safe.includes('apiKey'), false)
})

await check('source hash mismatch precheck prevents any key read or provider call', async () => {
  let keyReads = 0
  let networkCalls = 0
  await assert.rejects(() => runSemanticV7G01Harness(['--golden', 'G01', '--live', SEMANTIC_V7_G01_AUTH_ACK], {
    repositoryRoot: root,
    prepare: async () => { throw new HarnessFailure('G01_SOURCE_HASH_MISMATCH') },
    readKey: () => { keyReads += 1; return 'synthetic' },
    fetcher: async () => { networkCalls += 1; return new Response('') },
  }), (error: unknown) => error instanceof HarnessFailure && error.code === 'G01_SOURCE_HASH_MISMATCH')
  assert.equal(keyReads, 0)
  assert.equal(networkCalls, 0)
})

await check('model and reasoning are fixed on the outgoing provider request', async () => {
  let sent: Record<string, unknown> | null = null
  const result = await invokeExactlyOnce({
    request: testRequest(), apiKey: 'synthetic-secret', budget: createOneCallBudget(),
    fetcher: async (_url, init) => { sent = JSON.parse(String(init?.body)); return new Response(responseBody(emptyValidOutput), { status: 200 }) },
  })
  const outgoing = sent as { model?: unknown; reasoning?: { effort?: unknown } } | null
  assert.equal(outgoing?.model, 'gpt-6-luna')
  assert.equal(outgoing?.reasoning?.effort, 'medium')
  assert.equal(result.httpStatus, 200)
})

await check('call budget is exactly one and second provider invocation is blocked before fetch', async () => {
  const budget = createOneCallBudget()
  let calls = 0
  const options = {
    request: testRequest(), apiKey: 'synthetic-secret', budget,
    fetcher: async () => { calls += 1; return new Response(responseBody(emptyValidOutput), { status: 200 }) },
  }
  await invokeExactlyOnce(options)
  await assert.rejects(() => invokeExactlyOnce(options), (error: unknown) => error instanceof HarnessFailure && error.code === 'CALL_BUDGET_EXHAUSTED')
  assert.equal(budget.used, 1)
  assert.equal(calls, 1)
})

await check('HTTP error stops after one provider attempt without retry', async () => {
  let calls = 0
  const budget = createOneCallBudget()
  await assert.rejects(() => invokeExactlyOnce({
    request: testRequest(), apiKey: 'synthetic-secret', budget,
    fetcher: async () => { calls += 1; return new Response('{"error":{"code":"bad_request"}}', { status: 400 }) },
  }), (error: unknown) => error instanceof HarnessFailure && error.code === 'PROVIDER_HTTP_400')
  assert.equal(calls, 1)
  assert.equal(budget.used, 1)
})

await check('timeout stops after one provider attempt without retry', async () => {
  let calls = 0
  const budget = createOneCallBudget()
  await assert.rejects(() => invokeExactlyOnce({
    request: testRequest(), apiKey: 'synthetic-secret', budget, timeoutMs: 2,
    fetcher: async (_url, init) => {
      calls += 1
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => {
        const error = new Error('abort'); error.name = 'AbortError'; reject(error)
      }, { once: true }))
    },
  }), (error: unknown) => error instanceof HarnessFailure && error.code === 'PROVIDER_TIMEOUT')
  assert.equal(calls, 1)
  assert.equal(budget.used, 1)
})

await check('malformed provider body stops after one call without retry', async () => {
  let calls = 0
  await assert.rejects(() => invokeExactlyOnce({
    request: testRequest(), apiKey: 'synthetic-secret', budget: createOneCallBudget(),
    fetcher: async () => { calls += 1; return new Response('not-json', { status: 200 }) },
  }), (error: unknown) => error instanceof HarnessFailure && error.code === 'PROVIDER_RESPONSE_MALFORMED')
  assert.equal(calls, 1)
})

await check('non-completed and invalid protocol output stop after one call', async () => {
  let calls = 0
  await assert.rejects(() => invokeExactlyOnce({
    request: testRequest(), apiKey: 'synthetic-secret', budget: createOneCallBudget(),
    fetcher: async () => { calls += 1; return new Response(responseBody(emptyValidOutput, 'incomplete'), { status: 200 }) },
  }), (error: unknown) => error instanceof HarnessFailure && error.code === 'PROVIDER_RESPONSE_NOT_COMPLETED')
  assert.equal(calls, 1)
  calls = 0
  await assert.rejects(() => invokeExactlyOnce({
    request: testRequest(), apiKey: 'synthetic-secret', budget: createOneCallBudget(),
    fetcher: async () => { calls += 1; return new Response(responseBody('{"notSemanticMappings":[]}'), { status: 200 }) },
  }), (error: unknown) => error instanceof HarnessFailure && error.code.startsWith('STRICT_V7_PARSE_'))
  assert.equal(calls, 1)
})

await check('raw provider body is captured before strict parsing without auth metadata', async () => {
  const raw = responseBody(emptyValidOutput)
  let captured = ''
  let sentBody = ''
  let sentAuthorization = ''
  const result = await invokeExactlyOnce({
    request: testRequest(), apiKey: 'synthetic-secret', budget: createOneCallBudget(),
    fetcher: async (_url, init) => {
      sentBody = String(init?.body)
      sentAuthorization = new Headers(init?.headers).get('Authorization') ?? ''
      return new Response(raw, { status: 200 })
    },
    onRawResponse: (body) => { captured = body },
  })
  assert.equal(captured, raw)
  assert.equal(result.rawBody, raw)
  assert.equal(captured.includes('synthetic-secret'), false)
  assert.equal(sentAuthorization, 'Bearer synthetic-secret')
  assert.equal(sentBody.includes('synthetic-secret'), false)
  assert.equal(JSON.stringify({ captured, parsed: result.parsed, responseId: result.responseId, usage: result.usage }).includes('Authorization'), false)
})

await check('the strict V7 parser is reused and rejects invalid wire schema', () => {
  assert.deepEqual(parseSemanticMapResponse(emptyValidOutput), { ok: true, semanticMappings: [], extrasPlacement: null })
  assert.equal(parseSemanticMapResponse('{"notSemanticMappings":[]}').ok, false)
})

await check('the Semantic Source Identity V2 grounder is reused', async () => {
  const prepared = await prepareSemanticV7G01({ repositoryRoot: root, runId: 'ground-test' })
  const parsed = parseSemanticMapResponse(emptyValidOutput)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const grounded = groundParsedSemanticMapResponse(parsed, prepared.sourceParagraphs, prepared.sourceBlocks)
  assert.equal(grounded.ok, true)
})

await check('unknown block/token references fail source-token grounding', async () => {
  const prepared = await prepareSemanticV7G01({ repositoryRoot: root, runId: 'invalid-ground-test' })
  const mapping = {
    sourceBlockId: 'not-a-source-block', startTokenId: 'not-a-token', endTokenId: 'not-a-token',
    concept: 'customer_1_name', customerIndex: null, customerIndexes: null, nameForm: 'BASE',
    dateRole: null, baseDateConcept: null, relation: null,
  }
  const parsed = parseSemanticMapResponse(JSON.stringify({ semanticMappings: [mapping], extrasPlacement: null }))
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const grounded = groundParsedSemanticMapResponse(parsed, prepared.sourceParagraphs, prepared.sourceBlocks)
  assert.equal(grounded.ok, false)
  if (!grounded.ok) assert.equal(grounded.code, 'unknown_source')
})

await check('harness imports production service/parser/grounder and excludes legacy protocols', () => {
  const source = readFileSync(join(root, 'scripts/dev-validation/semanticV7G01Harness.ts'), 'utf8')
  assert.match(source, /startSemanticContractGeneration/)
  assert.match(source, /parseSemanticMapResponse/)
  assert.match(source, /groundParsedSemanticMapResponse/)
  assert.doesNotMatch(source, /localFullRewriteInvoke|runSparseProductTransform|changedBlocks|ai-contract-full-rewrite|legacy repair/i)
})

await check('request and evidence records exclude credentials and payload dumps', async () => {
  const prepared = await prepareSemanticV7G01({ repositoryRoot: root, runId: 'safe-summary-test' })
  const safe = JSON.stringify(prepared.requestSummary)
  assert.equal(safe.includes('Authorization'), false)
  assert.equal(safe.includes('apiKey'), false)
  assert.equal(safe.includes('synthetic-secret'), false)
  assert.equal(safe.includes('sourceBlocks'), false)
  assert.equal(safe.includes('visibleText'), false)
})

await check('dry run reports zero network calls and no key read', async () => {
  let keyReads = 0
  let networkCalls = 0
  const result = await runSemanticV7G01Harness(['--golden', 'G01'], {
    repositoryRoot: root,
    readKey: () => { keyReads += 1; throw new Error('must not read') },
    fetcher: async () => { networkCalls += 1; throw new Error('must not fetch') },
  })
  assert.equal(result.networkCalls, 0)
  assert.equal(result.keyRead, false)
  assert.equal(keyReads, 0)
  assert.equal(networkCalls, 0)
})

await check('confirmation failure happens before key read and network', async () => {
  let keyReads = 0
  let networkCalls = 0
  await assert.rejects(() => runSemanticV7G01Harness(['--golden', 'G01', '--live'], {
    repositoryRoot: root,
    readKey: () => { keyReads += 1; return 'synthetic' },
    fetcher: async () => { networkCalls += 1; return new Response('') },
  }), (error: unknown) => error instanceof HarnessFailure && error.code === 'PAID_CALL_CONFIRMATION_REQUIRED')
  assert.equal(keyReads, 0)
  assert.equal(networkCalls, 0)
})

await check('the existing source is canonical and selector only supports G01', async () => {
  const prepared = await prepareSemanticV7G01({ repositoryRoot: root, runId: 'canonical-test' })
  assert.equal(prepared.sourcePath.endsWith('Golden_01_Elegant_Photographer.docx'), true)
  assert.equal(prepared.sourceHash, SEMANTIC_V7_G01_SOURCE_SHA256)
  assert.equal(parseHarnessArgs(['--golden', 'G01']).golden, 'G01')
})

console.log(`Semantic V7 G01 harness tests: PASS (${checks.length} checks)`)
