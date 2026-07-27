/**
 * Edge function error handling + independent mode lifecycles.
 * Run: npm run test:ai-contract-transform-errors
 */

import {
  buildTransformEdgeErrorDetail,
  classifyTransformEdgeError,
  sanitizeRawResponse,
} from './edgeFunctionError'
import { invokeTransform, type TransformFunctionsInvoke } from './transformApi'
import {
  createComparisonRunShell,
  runBothTransformModes,
} from './transformService'
import { blocksFromPlainParagraphs } from './indexDocxForTransform'
import { SAMPLE_DATASET } from './fixtures/transformFixtures'
import type { TransformedBlock } from './types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

function installLocalStorage() {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, String(v))
    },
    removeItem: (k) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage
}

function okBlocks(source = blocksFromPlainParagraphs(['Hello'])): TransformedBlock[] {
  return source.map((b) => ({ blockId: b.blockId, text: b.text.replace('Hello', 'Hi') }))
}

function mockInvoke(handlers: {
  full?: () => Promise<{ data: unknown; error: unknown }> | { data: unknown; error: unknown }
  guarded?: () => Promise<{ data: unknown; error: unknown }> | { data: unknown; error: unknown }
}): TransformFunctionsInvoke {
  return async (functionName) => {
    if (functionName === 'ai-contract-full-rewrite') {
      return handlers.full ? await handlers.full() : { data: null, error: { message: 'missing full mock' } }
    }
    if (functionName === 'ai-contract-guarded-transform') {
      return handlers.guarded
        ? await handlers.guarded()
        : { data: null, error: { message: 'missing guarded mock' } }
    }
    return { data: null, error: { message: `unknown function ${functionName}` } }
  }
}

function successPayload(
  source: ReturnType<typeof blocksFromPlainParagraphs>,
  changedBlocks: TransformedBlock[],
  version: string,
) {
  return {
    ok: true,
    changedBlocks,
    model: 'mock',
    promptVersion: version,
    responseVersion: version,
    diagnostics: {
      attemptCount: 1,
      configuredMaxOutputTokens: 8192,
      sourceBlockCount: source.length,
      changedBlockCount: changedBlocks.length,
      responseStatus: 'completed',
      incompleteReason: null,
    },
  }
}

async function main() {
  installLocalStorage()
  const sourceBlocks = blocksFromPlainParagraphs(['Akapit testowy'])
  const sourceBytes = new ArrayBuffer(8)
  const dataset = SAMPLE_DATASET
  const blocks = okBlocks(sourceBlocks)

  // --- classification unit checks ---
  assertEq(
    classifyTransformEdgeError({ httpStatus: 404, message: 'not found' }),
    'function_not_found',
    '404 → function_not_found',
  )
  assertEq(
    classifyTransformEdgeError({ httpStatus: 401, message: 'unauthorized' }),
    'unauthorized',
    '401 → unauthorized',
  )
  assertEq(
    classifyTransformEdgeError({
      message: 'OPENAI_API_KEY not configured',
      bodyCode: 'provider_api_error',
    }),
    'missing_configuration',
    'missing config',
  )
  assertEq(
    classifyTransformEdgeError({ message: 'timed out' }),
    'timeout',
    'timeout',
  )
  assertEq(
    classifyTransformEdgeError({ message: 'Failed to fetch' }),
    'network_error',
    'network',
  )
  assert(
    !sanitizeRawResponse('Authorization: Bearer secret-token-xyz').includes(
      'secret-token',
    ),
    'sanitize bearer',
  )

  // non-2xx JSON body extraction
  const jsonDetail = await buildTransformEdgeErrorDetail({
    mode: 'full_ai_trusted_rewrite',
    functionName: 'ai-contract-full-rewrite',
    error: {
      message: 'Edge Function returned a non-2xx status code',
      context: {
        status: 404,
        text: async () =>
          JSON.stringify({
            ok: false,
            error: { code: 'not_found', message: 'Function not deployed' },
          }),
      },
    },
  })
  assertEq(jsonDetail.httpStatus, 404, 'json http status')
  assertEq(jsonDetail.errorType, 'function_not_found', 'json error type')
  assert(
    jsonDetail.message.includes('Function not deployed'),
    `json message was: ${jsonDetail.message}`,
  )
  assert(
    !jsonDetail.message.includes('non-2xx'),
    'must not keep generic non-2xx as primary message when body exists',
  )

  // non-2xx text body
  const textDetail = await buildTransformEdgeErrorDetail({
    mode: 'guarded_ai_transform',
    functionName: 'ai-contract-guarded-transform',
    error: {
      message: 'Edge Function returned a non-2xx status code',
      context: {
        status: 502,
        text: async () => 'upstream provider unavailable',
      },
    },
  })
  assertEq(textDetail.httpStatus, 502, 'text http')
  assert(
    Boolean(
      textDetail.message.includes('upstream provider unavailable') ||
        textDetail.rawResponse?.includes('upstream provider unavailable'),
    ),
    'text body captured',
  )

  // invokeTransform network throw
  const thrown = await invokeTransform({
    functionName: 'ai-contract-full-rewrite',
    mode: 'full_ai_trusted_rewrite',
    runId: 'run-net',
    promptVersion: '2026-07-full-ai-v2',
    documentBlocks: sourceBlocks,
    transformationDataset: dataset,
    protectedDataSummary: { exactCount: 0, patternCount: 0 },
    invoke: async () => {
      throw new Error('Failed to fetch')
    },
  })
  assert(!thrown.ok, 'network throw → error')
  if (!thrown.ok) {
    assertEq(thrown.error.detail.errorType, 'network_error', 'network type')
  }

  // timeout throw
  const timed = await invokeTransform({
    functionName: 'ai-contract-full-rewrite',
    mode: 'full_ai_trusted_rewrite',
    runId: 'run-to',
    promptVersion: '2026-07-full-ai-v2',
    documentBlocks: sourceBlocks,
    transformationDataset: dataset,
    protectedDataSummary: { exactCount: 0, patternCount: 0 },
    invoke: async () => {
      throw new Error('Request timed out')
    },
  })
  assert(!timed.ok, 'timeout → error')
  if (!timed.ok) {
    assertEq(timed.error.detail.errorType, 'timeout', 'timeout type')
  }

  const shell = () =>
    createComparisonRunShell({
      runId: `run-${Math.random().toString(36).slice(2, 8)}`,
      sourceFileName: 'test.docx',
      blocks: sourceBlocks,
      dataset,
    })

  // both succeed
  {
    const finished = await runBothTransformModes({
      run: shell(),
      sourceBytes,
      sourceBlocks,
      dataset,
      invoke: mockInvoke({
        full: () => ({
          data: successPayload(sourceBlocks, blocks, '2026-07-full-ai-v2'),
          error: null,
        }),
        guarded: () => ({
          data: successPayload(sourceBlocks, blocks, '2026-07-guarded-ai-v2'),
          error: null,
        }),
      }),
    })
    assertEq(finished.modeA.status, 'success', 'both: A success')
    assertEq(finished.modeB.status, 'success', 'both: B success')
    assert(finished.modeA.status !== 'idle', 'A not idle')
    assert(finished.modeB.status !== 'idle', 'B not idle')
  }

  // Full AI fails, Guarded succeeds
  {
    const finished = await runBothTransformModes({
      run: shell(),
      sourceBytes,
      sourceBlocks,
      dataset,
      invoke: mockInvoke({
        full: () => ({
          data: null,
          error: {
            message: 'Edge Function returned a non-2xx status code',
            context: {
              status: 404,
              text: async () =>
                JSON.stringify({
                  ok: false,
                  error: {
                    code: 'not_found',
                    message: 'Function ai-contract-full-rewrite does not exist',
                  },
                }),
            },
          },
        }),
        guarded: () => ({
          data: successPayload(sourceBlocks, blocks, '2026-07-guarded-ai-v2'),
          error: null,
        }),
      }),
    })
    assertEq(finished.modeA.status, 'error', 'A error')
    assertEq(finished.modeB.status, 'success', 'B success despite A')
    assert(
      finished.modeA.edgeError?.message.includes('does not exist') ?? false,
      'A shows real message',
    )
    assertEq(
      finished.modeA.edgeError?.errorType,
      'function_not_found',
      'A classified',
    )
  }

  // Guarded fails, Full AI succeeds
  {
    const finished = await runBothTransformModes({
      run: shell(),
      sourceBytes,
      sourceBlocks,
      dataset,
      invoke: mockInvoke({
        full: () => ({
          data: successPayload(sourceBlocks, blocks, '2026-07-full-ai-v2'),
          error: null,
        }),
        guarded: () => ({
          data: null,
          error: {
            message: 'Edge Function returned a non-2xx status code',
            context: {
              status: 500,
              text: async () =>
                JSON.stringify({
                  ok: false,
                  error: {
                    code: 'provider_api_error',
                    message: 'OPENAI_API_KEY not configured',
                  },
                }),
            },
          },
        }),
      }),
    })
    assertEq(finished.modeA.status, 'success', 'A success despite B')
    assertEq(finished.modeB.status, 'error', 'B error')
    assertEq(
      finished.modeB.edgeError?.errorType,
      'missing_configuration',
      'B missing config',
    )
  }

  // both fail
  {
    const finished = await runBothTransformModes({
      run: shell(),
      sourceBytes,
      sourceBlocks,
      dataset,
      invoke: mockInvoke({
        full: () => ({
          data: null,
          error: {
            message: 'Edge Function returned a non-2xx status code',
            context: { status: 502, text: async () => 'bad gateway' },
          },
        }),
        guarded: () => {
          throw new Error('Failed to fetch')
        },
      }),
    })
    assertEq(finished.modeA.status, 'error', 'both fail A')
    assertEq(finished.modeB.status, 'error', 'both fail B')
    assert(finished.modeA.status !== 'running', 'A not stuck running')
    assert(finished.modeB.status !== 'running', 'B not stuck running')
    assert(finished.modeA.status !== 'idle', 'A not idle after fail')
  }

  console.log('ok — ai-contract-transform-errors')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
