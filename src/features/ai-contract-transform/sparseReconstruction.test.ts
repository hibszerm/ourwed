/**
 * Sparse changedBlocks reconstruction + incomplete_response / retry policy.
 * Run: npm run test:ai-contract-transform-sparse
 */

import { applySparseBlockChanges } from './applySparseBlockChanges'
import { buildTransformEdgeErrorDetail } from './edgeFunctionError'
import {
  computeMaxOutputTokens,
  estimateFullEchoOutputTokens,
  estimateSparseOutputTokens,
  NORMAL_MAX_OUTPUT_TOKENS,
  shouldRetryIncomplete,
} from './incompleteResponsePolicy'
import { blocksFromPlainParagraphs } from './indexDocxForTransform'
import { buildModeADiagnostics } from './modeADiagnostics'
import { buildProtectedContractData } from './protectedContractData'
import { verifyGuardedTransformation } from './guardedVerifier'
import {
  assertSparseOutputContract,
  parseSparseV2ModelPayload,
} from './sparseResponseSchema'
import { SAMPLE_DATASET } from './fixtures/transformFixtures'
import { invokeTransform, type TransformFunctionsInvoke } from './transformApi'
import {
  createComparisonRunShell,
  runBothTransformModes,
} from './transformService'
import {
  FULL_AI_PROMPT_VERSION,
  FULL_AI_RESPONSE_VERSION,
  GUARDED_AI_RESPONSE_VERSION,
  type TransformDocumentBlock,
  type TransformedBlock,
} from './types'

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

function make47Blocks(): TransformDocumentBlock[] {
  const filler =
    ' Strony zobowiązują się do zachowania poufności treści niniejszej umowy oraz danych osobowych przekazanych w związku z jej wykonaniem. '
  const texts = Array.from({ length: 47 }, (_, i) => {
    if (i === 2) return 'Umowa zawarta w dniu 30.10.2024 r.'
    if (i === 10) return 'Wynagrodzenie 8 000 zł (słownie: osiem tysięcy złotych).'
    return `Akapit źródłowy numer ${i + 1}. Treść stała umowy — klauzula ${i + 1}.${filler.repeat(6)}`
  })
  return blocksFromPlainParagraphs(texts)
}

function sparseSuccessPayload(
  changedBlocks: Array<{ blockId: string; text: string }>,
  version: string,
  diagnostics?: Record<string, unknown>,
) {
  return {
    ok: true,
    changedBlocks,
    model: 'mock',
    promptVersion: version,
    responseVersion: version,
    diagnostics: {
      attemptCount: 1,
      configuredMaxOutputTokens: NORMAL_MAX_OUTPUT_TOKENS,
      sourceBlockCount: 47,
      changedBlockCount: changedBlocks.length,
      responseStatus: 'completed',
      incompleteReason: null,
      ...diagnostics,
    },
  }
}

async function main() {
  installLocalStorage()
  const source = make47Blocks()
  assertEq(source.length, 47, '47-block fixture')

  // 1–3, 6–7: reconstruction
  const changed = [
    { blockId: 'para-2', text: 'Umowa zawarta w dniu 02.02.2027 r.' },
    {
      blockId: 'para-10',
      text: 'Wynagrodzenie 9 500 zł (słownie: dziewięć tysięcy pięćset złotych).',
    },
  ]
  const rebuilt = applySparseBlockChanges(source, changed)
  assert(rebuilt.ok, 'sparse ok')
  if (!rebuilt.ok) throw new Error('unreachable')
  assertEq(rebuilt.blocks.length, 47, 'reconstructs 47 blocks')
  assertEq(rebuilt.changedBlockCount, 2, 'two changed')
  assertEq(rebuilt.blocks[2]!.text, changed[0]!.text, 'change applied once')
  assertEq(rebuilt.blocks[10]!.text, changed[1]!.text, 'second change')
  for (let i = 0; i < 47; i++) {
    assertEq(rebuilt.blocks[i]!.blockId, source[i]!.blockId, `order ${i}`)
    if (i !== 2 && i !== 10) {
      assertEq(rebuilt.blocks[i]!.text, source[i]!.text, `unchanged ${i}`)
    }
  }
  // never mutates source
  assertEq(source[2]!.text.includes('2024'), true, 'source unchanged')

  // 4 unknown
  const unknown = applySparseBlockChanges(source, [
    { blockId: 'para-999', text: 'x' },
  ])
  assert(!unknown.ok && unknown.error.code === 'unknown_block_id', 'unknown id')

  // 5 duplicate
  const dup = applySparseBlockChanges(source, [
    { blockId: 'para-1', text: 'a' },
    { blockId: 'para-1', text: 'b' },
  ])
  assert(!dup.ok && dup.error.code === 'duplicate_block_id', 'duplicate id')

  // 6 empty changedBlocks
  const empty = applySparseBlockChanges(source, [])
  assert(empty.ok, 'empty ok')
  if (empty.ok) {
    assertEq(empty.blocks.length, 47, 'empty → full doc')
    for (let i = 0; i < 47; i++) {
      assertEq(empty.blocks[i]!.text, source[i]!.text, `empty identical ${i}`)
    }
  }

  // empty text rejection
  const emptyText = applySparseBlockChanges(source, [
    { blockId: 'para-0', text: '' },
  ])
  assert(
    !emptyText.ok && emptyText.error.code === 'empty_text_for_nonempty_source',
    'empty text rejected',
  )

  // 8 Mode A diagnostics on reconstructed
  const protectedData = buildProtectedContractData({
    blockTexts: source.map((b) => b.text),
  })
  const modeA = buildModeADiagnostics({
    sourceBlocks: source,
    transformedBlocks: rebuilt.blocks,
    dataset: SAMPLE_DATASET,
    protectedData,
  })
  assert(modeA.diagnostics.changedBlockCount >= 1, 'mode A sees changes')
  assertEq(modeA.diagnostics.unchangedBlockCount, 45, 'mode A unchanged count')

  // 9 Guarded verifier on reconstructed
  const modeB = verifyGuardedTransformation({
    sourceBlocks: source,
    transformedBlocks: rebuilt.blocks,
    dataset: SAMPLE_DATASET,
    protectedData,
  })
  assert(Array.isArray(modeB.diffs), 'guarded diffs')
  assert(modeB.structureOk, 'structure ok after reconstruct')

  // 10 DOCX writer receives full reconstructed length (mock contract)
  const docxInputBlocks: TransformedBlock[] = rebuilt.blocks
  assertEq(docxInputBlocks.length, source.length, 'docx gets full blocks')

  // 11–12 schema
  const good = parseSparseV2ModelPayload('full_ai_trusted_rewrite', {
    changedBlocks: changed,
  })
  assert(good.ok, 'v2 accepts sparse')
  const verbose = parseSparseV2ModelPayload('full_ai_trusted_rewrite', {
    changedBlocks: changed,
    notes: 'do not include',
    reasoning: 'nope',
  })
  assert(!verbose.ok && verbose.code === 'unexpected_fields', 'rejects verbose')
  const blockNotes = parseSparseV2ModelPayload('guarded_ai_transform', {
    changedBlocks: [{ blockId: 'para-1', text: 'x', explanation: 'no' }],
  })
  assert(
    !blockNotes.ok && blockNotes.code === 'unexpected_fields',
    'rejects block notes',
  )

  // Regression: prompts must not require full echo
  assert(
    assertSparseOutputContract(
      'Return ONLY blocks whose text must change. Do NOT return unchanged blocks.',
    ),
    'sparse prompt contract',
  )
  assert(
    !assertSparseOutputContract('Return every document block including unchanged.'),
    'full echo prompt rejected',
  )

  // 13 incomplete_details.reason exposed
  const incompleteDetail = await buildTransformEdgeErrorDetail({
    mode: 'full_ai_trusted_rewrite',
    functionName: 'ai-contract-full-rewrite',
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
              configuredMaxOutputTokens: 8192,
            },
            diagnostics: {
              attemptCount: 2,
              configuredMaxOutputTokens: 16384,
              responseStatus: 'incomplete',
              incompleteReason: 'max_output_tokens',
            },
          }),
      },
    },
  })
  assertEq(incompleteDetail.providerCode, 'incomplete_response', 'provider code')
  assertEq(incompleteDetail.incompleteReason, 'max_output_tokens', 'reason')
  assertEq(incompleteDetail.configuredMaxOutputTokens, 8192, 'configured tokens')
  assertEq(incompleteDetail.attemptCount, 2, 'attempt from diagnostics')

  // 14–16 retry policy
  assert(
    shouldRetryIncomplete({ attempt: 1, incompleteReason: 'max_output_tokens' }),
    'retry token incomplete',
  )
  assert(
    !shouldRetryIncomplete({ attempt: 2, incompleteReason: 'max_output_tokens' }),
    'no second retry',
  )
  assert(
    !shouldRetryIncomplete({ attempt: 1, incompleteReason: 'content_filter' }),
    'no retry non-token',
  )
  assert(
    !shouldRetryIncomplete({ attempt: 1, incompleteReason: null }),
    'no retry missing reason',
  )
  assertEq(
    computeMaxOutputTokens({ blockCount: 47, characterCount: 20_000, attempt: 1 }),
    NORMAL_MAX_OUTPUT_TOKENS,
    'attempt1 normal',
  )
  assertEq(
    computeMaxOutputTokens({ blockCount: 47, characterCount: 20_000, attempt: 2 }),
    16_384,
    'attempt2 hard max for large',
  )

  // Simulated retry orchestration (mirrors Edge)
  let attempts = 0
  let lastLimit = 0
  function simulateProvider(status: string, reason: string | null) {
    attempts += 1
    lastLimit = computeMaxOutputTokens({
      blockCount: 47,
      characterCount: 20_000,
      attempt: attempts as 1 | 2,
    })
    return { status, incompleteReason: reason, parsed: null as null }
  }
  let first = simulateProvider('incomplete', 'max_output_tokens')
  assert(first.parsed == null, 'first incomplete')
  if (
    shouldRetryIncomplete({
      attempt: 1,
      incompleteReason: first.incompleteReason,
    })
  ) {
    const second = simulateProvider('incomplete', 'max_output_tokens')
    assertEq(attempts, 2, 'one retry')
    assert(second.status === 'incomplete', 'second still incomplete')
    assert(
      !shouldRetryIncomplete({
        attempt: 2,
        incompleteReason: second.incompleteReason,
      }),
      'final error — no third attempt',
    )
  }
  assert(lastLimit === 16_384, 'retry used larger limit')

  // 17 independent mode failures with sparse payloads
  const sourceBytes = new ArrayBuffer(8)
  const finished = await runBothTransformModes({
    run: createComparisonRunShell({
      runId: 'sparse-indep',
      sourceFileName: 't.docx',
      blocks: source,
      dataset: SAMPLE_DATASET,
    }),
    sourceBytes,
    sourceBlocks: source,
    dataset: SAMPLE_DATASET,
    invoke: (async (functionName) => {
      if (functionName === 'ai-contract-full-rewrite') {
        return {
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
                  diagnostics: {
                    attemptCount: 2,
                    incompleteReason: 'max_output_tokens',
                    responseStatus: 'incomplete',
                    configuredMaxOutputTokens: 16384,
                  },
                }),
            },
          },
        }
      }
      return {
        data: sparseSuccessPayload(
          [{ blockId: 'para-2', text: 'Umowa zawarta w dniu 02.02.2027 r.' }],
          GUARDED_AI_RESPONSE_VERSION,
        ),
        error: null,
      }
    }) as TransformFunctionsInvoke,
  })
  assertEq(finished.modeA.status, 'error', 'A incomplete error')
  assertEq(finished.modeA.errorCode, 'incomplete_response', 'A code')
  assertEq(
    finished.modeA.responseSizeDiagnostics?.incompleteReason,
    'max_output_tokens',
    'A reason stored',
  )
  assertEq(finished.modeB.status, 'success', 'B independent success')
  assertEq(finished.modeB.transformedBlocks?.length, 47, 'B reconstructed')

  // invokeTransform reconstructs sparse
  const api = await invokeTransform({
    functionName: 'ai-contract-full-rewrite',
    mode: 'full_ai_trusted_rewrite',
    runId: 'api-sparse',
    promptVersion: FULL_AI_PROMPT_VERSION,
    documentBlocks: source,
    transformationDataset: SAMPLE_DATASET,
    protectedDataSummary: { exactCount: 0, patternCount: 0 },
    invoke: async () => ({
      data: sparseSuccessPayload(changed, FULL_AI_RESPONSE_VERSION),
      error: null,
    }),
  })
  assert(api.ok, 'api sparse ok')
  if (api.ok) {
    assertEq(api.transformedBlocks.length, 47, 'api reconstructed')
    assertEq(api.changedBlockCount, 2, 'api changed count')
    assertEq(api.responseVersion, FULL_AI_RESPONSE_VERSION, 'api v2')
  }

  // 18 size: full echo exceeds previous ~4k budget; sparse stays under 8192
  const fullEchoTokens = estimateFullEchoOutputTokens({
    blocks: source.map((b) => ({ blockId: b.blockId, text: b.text })),
  })
  const sparseTokens = estimateSparseOutputTokens({
    responseVersion: FULL_AI_RESPONSE_VERSION,
    changedBlocks: changed,
  })
  assert(fullEchoTokens > LEGACY_LIMIT_HINT(), 'full echo oversized vs legacy')
  assert(
    sparseTokens < NORMAL_MAX_OUTPUT_TOKENS,
    `sparse ${sparseTokens} < ${NORMAL_MAX_OUTPUT_TOKENS}`,
  )

  console.log('ok — ai-contract-transform-sparse')
}

function LEGACY_LIMIT_HINT() {
  return 4_000
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
