/**
 * Server-side responseVersion injection — model schema is changedBlocks-only.
 * Run: npm run test:ai-contract-transform-response-version
 */

import {
  parseSparseV2FromResponse,
  shouldRetryParseFailure,
  MODEL_SCHEMA_VERSION,
  validateSparseChangedBlocksModelResult,
} from './parseSparseV2Response'
import {
  parseSparseV2ModelPayload,
  type FullAiSparseResponseV2,
  type GuardedAiSparseResponseV2,
} from './sparseResponseSchema'
import { applySparseBlockChanges } from './applySparseBlockChanges'
import { blocksFromPlainParagraphs } from './indexDocxForTransform'
import {
  createComparisonRunShell,
  runBothTransformModes,
} from './transformService'
import type { TransformFunctionsInvoke } from './transformApi'
import {
  FULL_AI_RESPONSE_VERSION,
  GUARDED_AI_RESPONSE_VERSION,
} from './types'
import { SAMPLE_DATASET } from './fixtures/transformFixtures'

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

function completedMessage(text: string) {
  return {
    status: 'completed',
    id: 'resp_test',
    output: [
      { type: 'reasoning', summary: [] },
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      },
    ],
  }
}

async function main() {
  installLocalStorage()

  const onlyChanged = JSON.stringify({
    changedBlocks: [{ blockId: 'para-0', text: 'Nowa treść' }],
  })

  // 1–2 model-only output succeeds
  const full = parseSparseV2FromResponse({
    body: completedMessage(onlyChanged),
    applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
  })
  assert(full.ok, 'full model-only ok')
  if (full.ok) {
    // 3 inject full version
    assertEq(
      full.applicationResponseVersion,
      FULL_AI_RESPONSE_VERSION,
      'full injects version',
    )
    assertEq(full.modelSchemaVersion, MODEL_SCHEMA_VERSION, 'model schema v')
  }

  const guarded = parseSparseV2FromResponse({
    body: completedMessage(onlyChanged),
    applicationResponseVersion: GUARDED_AI_RESPONSE_VERSION,
  })
  assert(guarded.ok, 'guarded model-only ok')
  if (guarded.ok) {
    // 4 inject guarded version
    assertEq(
      guarded.applicationResponseVersion,
      GUARDED_AI_RESPONSE_VERSION,
      'guarded injects version',
    )
  }

  // 5 model cannot control final version
  const wrongVersion = JSON.stringify({
    responseVersion: 'model-made-this-up',
    changedBlocks: [{ blockId: 'para-0', text: 'X' }],
  })
  const hijack = parseSparseV2FromResponse({
    body: completedMessage(wrongVersion),
    applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
  })
  assert(hijack.ok, 'wrong model version still ok')
  if (hijack.ok) {
    assertEq(
      hijack.applicationResponseVersion,
      FULL_AI_RESPONSE_VERSION,
      'trusted wins',
    )
    assertEq(
      hijack.ignoredModelResponseVersion,
      'model-made-this-up',
      'ignored recorded',
    )
  }

  // 6 legacy correct version compatible
  const legacyOk = validateSparseChangedBlocksModelResult({
    responseVersion: FULL_AI_RESPONSE_VERSION,
    changedBlocks: [{ blockId: 'para-0', text: 'A' }],
  })
  assert(legacyOk.ok, 'legacy correct ok')

  // 7 legacy wrong version still uses changedBlocks
  const legacyWrong = validateSparseChangedBlocksModelResult({
    responseVersion: 'garbage',
    changedBlocks: [{ blockId: 'para-0', text: 'A' }],
  })
  assert(legacyWrong.ok, 'legacy wrong still ok')
  if (legacyWrong.ok) {
    assertEq(legacyWrong.changedBlocks[0]!.text, 'A', 'blocks kept')
    assertEq(legacyWrong.ignoredModelResponseVersion, 'garbage', 'ignored')
  }

  // 8 unknown additional fields rejected
  const extra = validateSparseChangedBlocksModelResult({
    changedBlocks: [],
    notes: 'nope',
  })
  assert(!extra.ok, 'extra fields rejected')

  // 9 invalid changedBlocks rejected
  const badBlocks = validateSparseChangedBlocksModelResult({
    changedBlocks: [{ blockId: 1, text: 'x' }],
  })
  assert(!badBlocks.ok, 'invalid blocks rejected')

  // 10–11 unknown / duplicate IDs still rejected at reconstruction
  const source = blocksFromPlainParagraphs(['A', 'B'])
  const unknown = applySparseBlockChanges(source, [
    { blockId: 'para-99', text: 'x' },
  ])
  assert(!unknown.ok && unknown.error.code === 'unknown_block_id', 'unknown id')
  const dup = applySparseBlockChanges(source, [
    { blockId: 'para-0', text: 'a' },
    { blockId: 'para-0', text: 'b' },
  ])
  assert(!dup.ok && dup.error.code === 'duplicate_block_id', 'dup id')

  // Client envelope types + injection
  const clientFull = parseSparseV2ModelPayload('full_ai_trusted_rewrite', {
    changedBlocks: [{ blockId: 'para-0', text: 'Z' }],
  })
  assert(clientFull.ok, 'client full')
  if (clientFull.ok) {
    const envelope: FullAiSparseResponseV2 = {
      responseVersion: FULL_AI_RESPONSE_VERSION,
      changedBlocks: clientFull.changedBlocks,
    }
    assertEq(envelope.responseVersion, FULL_AI_RESPONSE_VERSION, 'typed full')
  }
  const clientGuarded = parseSparseV2ModelPayload('guarded_ai_transform', {
    changedBlocks: [{ blockId: 'para-0', text: 'Z' }],
    responseVersion: 'wrong',
  })
  assert(clientGuarded.ok, 'client guarded ignores wrong')
  if (clientGuarded.ok) {
    const envelope: GuardedAiSparseResponseV2 = {
      responseVersion: GUARDED_AI_RESPONSE_VERSION,
      changedBlocks: clientGuarded.changedBlocks,
    }
    assertEq(
      envelope.responseVersion,
      GUARDED_AI_RESPONSE_VERSION,
      'typed guarded',
    )
    assertEq(clientGuarded.responseVersion, GUARDED_AI_RESPONSE_VERSION, 'inject')
  }

  // No retry for schema-invalid (would include old version mismatch — now ignored)
  const schemaFail = parseSparseV2FromResponse({
    body: completedMessage(JSON.stringify({ changedBlocks: [], notes: 'x' })),
    applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
  })
  assert(
    !shouldRetryParseFailure({
      attempt: 1,
      status: 'completed',
      parse: schemaFail,
    }),
    'no retry schema',
  )

  // 12–14 / 15–16 persistence via runBoth
  const invoke: TransformFunctionsInvoke = async (name) => {
    if (name === 'ai-contract-full-rewrite') {
      return {
        data: {
          ok: true,
          changedBlocks: [{ blockId: 'para-0', text: 'Full out' }],
          model: 'mock',
          promptVersion: '2026-07-full-ai-v2',
          responseVersion: FULL_AI_RESPONSE_VERSION,
          diagnostics: {
            modelSchemaVersion: MODEL_SCHEMA_VERSION,
            applicationResponseVersion: FULL_AI_RESPONSE_VERSION,
            changedBlockCount: 1,
          },
        },
        error: null,
      }
    }
    return {
      data: {
        ok: true,
        changedBlocks: [{ blockId: 'para-0', text: 'Guarded out' }],
        model: 'mock',
        promptVersion: '2026-07-guarded-ai-v2',
        responseVersion: GUARDED_AI_RESPONSE_VERSION,
        diagnostics: {
          modelSchemaVersion: MODEL_SCHEMA_VERSION,
          applicationResponseVersion: GUARDED_AI_RESPONSE_VERSION,
          changedBlockCount: 1,
        },
      },
      error: null,
    }
  }

  const finished = await runBothTransformModes({
    run: createComparisonRunShell({
      runId: 'ver-inject',
      sourceFileName: 't.docx',
      blocks: source,
      dataset: SAMPLE_DATASET,
    }),
    sourceBytes: new ArrayBuffer(8),
    sourceBlocks: source,
    dataset: SAMPLE_DATASET,
    invoke,
  })
  assertEq(finished.modeA.status, 'success', 'A success')
  assertEq(finished.modeB.status, 'success', 'B success')
  assertEq(
    finished.modeA.responseVersion,
    FULL_AI_RESPONSE_VERSION,
    'persisted full version',
  )
  assertEq(
    finished.modeB.responseVersion,
    GUARDED_AI_RESPONSE_VERSION,
    'persisted guarded version',
  )

  console.log('ok — ai-contract-transform-response-version')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
