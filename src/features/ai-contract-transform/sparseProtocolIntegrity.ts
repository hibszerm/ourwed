/**
 * CG6.1 — sparse protocol integrity: destructive empty replacements.
 *
 * Complements CG4 blockId partitioning. Empty/whitespace newText for a
 * non-empty source block is a protocol violation — never auto-restore-and-pass.
 */

import type { SparseChangedBlock } from './parseSparseV2Response'
import {
  buildProtocolBlockIdRetryHint,
  partitionChangedBlocksBySourceIds,
  type BlockIdPartition,
} from './blockIdIntegrity'

export type DestructiveEmptyReplacement = {
  blockId: string
  sourceText: string
}

export type ProtocolIntegrityViolation =
  | { kind: 'INVALID_BLOCK_ID'; blockId: string }
  | { kind: 'DUPLICATE_BLOCK_ID'; blockId: string }
  | {
      kind: 'DESTRUCTIVE_EMPTY_REPLACEMENT'
      blockId: string
      sourceText: string
    }

/** Meaningful non-whitespace source text. */
export function sourceHasMeaningfulText(text: string): boolean {
  return text.trim().length > 0
}

/** Empty or whitespace-only replacement text. */
export function isEmptyOrWhitespaceReplacement(text: string): boolean {
  return text.trim().length === 0
}

/**
 * Find changedBlocks that would clear a non-empty source block.
 * Only considers blocks present in the source map (call after ID partition).
 */
export function findDestructiveEmptyReplacements(input: {
  changedBlocks: SparseChangedBlock[]
  sourceBlocks: ReadonlyArray<{ blockId: string; text: string }>
}): DestructiveEmptyReplacement[] {
  const byId = new Map(input.sourceBlocks.map((b) => [b.blockId, b.text]))
  const out: DestructiveEmptyReplacement[] = []
  for (const row of input.changedBlocks) {
    if (!row || typeof row.blockId !== 'string') continue
    if (typeof row.text !== 'string') continue
    const sourceText = byId.get(row.blockId)
    if (sourceText == null) continue
    if (
      sourceHasMeaningfulText(sourceText) &&
      isEmptyOrWhitespaceReplacement(row.text)
    ) {
      out.push({ blockId: row.blockId, sourceText })
    }
  }
  return out
}

export function collectProtocolIntegrityViolations(input: {
  changedBlocks: SparseChangedBlock[]
  sourceBlocks: ReadonlyArray<{ blockId: string; text: string }>
}): {
  partition: BlockIdPartition
  emptyReplacements: DestructiveEmptyReplacement[]
  violations: ProtocolIntegrityViolation[]
  needsProtocolRetry: boolean
} {
  const sourceBlockIds = input.sourceBlocks.map((b) => b.blockId)
  const partition = partitionChangedBlocksBySourceIds({
    changedBlocks: input.changedBlocks,
    sourceBlockIds,
  })
  const emptyReplacements = findDestructiveEmptyReplacements({
    changedBlocks: partition.valid,
    sourceBlocks: input.sourceBlocks,
  })
  const violations: ProtocolIntegrityViolation[] = [
    ...partition.invalid.filter((row) => !partition.duplicates.includes(row)).map((row) => ({
      kind: 'INVALID_BLOCK_ID' as const,
      blockId: typeof row?.blockId === 'string' ? row.blockId : '(invalid)',
    })),
    ...partition.duplicates.map((row) => ({
      kind: 'DUPLICATE_BLOCK_ID' as const,
      blockId: row.blockId,
    })),
    ...emptyReplacements.map((e) => ({
      kind: 'DESTRUCTIVE_EMPTY_REPLACEMENT' as const,
      blockId: e.blockId,
      sourceText: e.sourceText,
    })),
  ]
  return {
    partition,
    emptyReplacements,
    violations,
    needsProtocolRetry: violations.length > 0,
  }
}

export function buildProtocolIntegrityRetryHint(input: {
  violations: ProtocolIntegrityViolation[]
  allowedBlockIds: readonly string[]
}): string {
  const invalidIds = input.violations
    .filter((v) => v.kind === 'INVALID_BLOCK_ID')
    .map((v) => v.blockId)
  const empties = input.violations.filter(
    (v) => v.kind === 'DESTRUCTIVE_EMPTY_REPLACEMENT',
  ) as Array<{
    kind: 'DESTRUCTIVE_EMPTY_REPLACEMENT'
    blockId: string
    sourceText: string
  }>

  const parts: string[] = [
    'PROTOCOL ERROR: sparse changedBlocks integrity violation.',
    'Return the full changedBlocks array again. Do not clear non-empty source blocks.',
    'Each changedBlocks[].text must be the COMPLETE non-empty final text of that block.',
    'To leave a block unchanged, omit it from changedBlocks — never set text to "" or whitespace.',
  ]

  if (invalidIds.length > 0) {
    parts.push(
      buildProtocolBlockIdRetryHint({
        invalidBlockIds: invalidIds,
        allowedBlockIds: input.allowedBlockIds,
      }),
    )
  }

  if (empties.length > 0) {
    const listed = empties
      .slice(0, 12)
      .map((e) => {
        const preview = e.sourceText.replace(/\s+/g, ' ').slice(0, 120)
        return `- ${e.blockId}: original non-empty text was "${preview}"`
      })
      .join('\n')
    parts.push(
      `DESTRUCTIVE_EMPTY_REPLACEMENT rejected for blockId(s): ${empties.map((e) => e.blockId).join(', ')}`,
      'Offending blocks (must return complete non-empty replacement text, or omit the block):',
      listed,
    )
  }

  return parts.join('\n')
}
