/**
 * Edge function error handling (full-rewrite invoke path).
 * Run: npm run test:ai-contract-transform-errors
 */

import {
  buildTransformEdgeErrorDetail,
  classifyTransformEdgeError,
  sanitizeRawResponse,
} from './edgeFunctionError'
import { invokeTransform } from './transformApi'
import { blocksFromPlainParagraphs } from './indexDocxForTransform'
import { SAMPLE_DATASET } from './fixtures/transformFixtures'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

async function main() {
  const sourceBlocks = blocksFromPlainParagraphs(['Akapit testowy'])
  const dataset = SAMPLE_DATASET

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

  // non-2xx text body (full-rewrite path)
  const textDetail = await buildTransformEdgeErrorDetail({
    mode: 'full_ai_trusted_rewrite',
    functionName: 'ai-contract-full-rewrite',
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

  // incomplete_response body classification via invokeTransform
  const incomplete = await invokeTransform({
    functionName: 'ai-contract-full-rewrite',
    mode: 'full_ai_trusted_rewrite',
    runId: 'run-inc',
    promptVersion: '2026-07-full-ai-v2',
    documentBlocks: sourceBlocks,
    transformationDataset: dataset,
    protectedDataSummary: { exactCount: 0, patternCount: 0 },
    invoke: async () => ({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 422,
          text: async () =>
            JSON.stringify({
              ok: false,
              error: {
                code: 'incomplete_response',
                message: 'Model returned an incomplete response',
                reason: 'max_output_tokens',
                retryable: true,
                configuredMaxOutputTokens: 16384,
              },
            }),
        },
      },
    }),
  })
  assert(!incomplete.ok, 'incomplete → error')
  if (!incomplete.ok) {
    assertEq(incomplete.error.code, 'incomplete_response', 'incomplete code')
  }

  console.log('ok — ai-contract-transform-errors')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
