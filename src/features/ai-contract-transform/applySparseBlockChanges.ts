/**
 * Deterministic sparse changed-block → full TransformedBlock[] reconstruction.
 */

import type { TransformDocumentBlock, TransformedBlock } from './types'

export type SparseReconstructionError = {
  code:
    | 'unknown_block_id'
    | 'duplicate_block_id'
    | 'missing_text'
    | 'empty_text_for_nonempty_source'
  message: string
  blockId?: string
}

export type SparseReconstructionResult =
  | { ok: true; blocks: TransformedBlock[]; changedBlockCount: number }
  | { ok: false; error: SparseReconstructionError }

export function applySparseBlockChanges(
  sourceBlocks: TransformDocumentBlock[],
  changedBlocks: Array<{ blockId: string; text: string }>,
): SparseReconstructionResult {
  const sourceById = new Map(sourceBlocks.map((b) => [b.blockId, b]))
  const seen = new Set<string>()

  for (const change of changedBlocks) {
    if (!change || typeof change.blockId !== 'string') {
      return {
        ok: false,
        error: { code: 'missing_text', message: 'changed block missing blockId' },
      }
    }
    if (seen.has(change.blockId)) {
      return {
        ok: false,
        error: {
          code: 'duplicate_block_id',
          message: `duplicate changed blockId: ${change.blockId}`,
          blockId: change.blockId,
        },
      }
    }
    seen.add(change.blockId)

    if (!sourceById.has(change.blockId)) {
      return {
        ok: false,
        error: {
          code: 'unknown_block_id',
          message: `unknown changed blockId: ${change.blockId}`,
          blockId: change.blockId,
        },
      }
    }

    if (typeof change.text !== 'string') {
      return {
        ok: false,
        error: {
          code: 'missing_text',
          message: `missing text for blockId: ${change.blockId}`,
          blockId: change.blockId,
        },
      }
    }

    const source = sourceById.get(change.blockId)!
    if (source.text.length > 0 && change.text.length === 0) {
      return {
        ok: false,
        error: {
          code: 'empty_text_for_nonempty_source',
          message: `empty replacement for non-empty source block: ${change.blockId}`,
          blockId: change.blockId,
        },
      }
    }
  }

  const changeMap = new Map(changedBlocks.map((c) => [c.blockId, c.text]))
  const blocks: TransformedBlock[] = sourceBlocks.map((src) => ({
    blockId: src.blockId,
    text: changeMap.has(src.blockId) ? changeMap.get(src.blockId)! : src.text,
  }))

  return {
    ok: true,
    blocks,
    changedBlockCount: changedBlocks.length,
  }
}
