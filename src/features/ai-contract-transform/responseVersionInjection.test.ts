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
} from './sparseResponseSchema'
import { applySparseBlockChanges } from './applySparseBlockChanges'
import { blocksFromPlainParagraphs } from './indexDocxForTransform'
import {
  FULL_AI_RESPONSE_VERSION,
} from './types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}
function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
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


  console.log('ok — ai-contract-transform-response-version')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
