/**
 * CG4 — sparse changedBlocks blockId integrity helpers.
 *
 * Source block IDs are SYSTEM structure. Model-invented IDs must never mutate
 * the document. No fuzzy remapping to neighbors.
 */

import type { SparseChangedBlock } from './parseSparseV2Response'

export type BlockIdPartition = {
  valid: SparseChangedBlock[]
  invalid: SparseChangedBlock[]
  validIdSet: Set<string>
}

export function partitionChangedBlocksBySourceIds(input: {
  changedBlocks: SparseChangedBlock[]
  sourceBlockIds: readonly string[]
}): BlockIdPartition {
  const validIdSet = new Set(input.sourceBlockIds)
  const valid: SparseChangedBlock[] = []
  const invalid: SparseChangedBlock[] = []
  const seen = new Set<string>()

  for (const row of input.changedBlocks) {
    if (!row || typeof row.blockId !== 'string') {
      invalid.push(row)
      continue
    }
    // Duplicate IDs in the payload: keep first valid occurrence only
    if (seen.has(row.blockId)) {
      invalid.push(row)
      continue
    }
    seen.add(row.blockId)
    if (validIdSet.has(row.blockId)) valid.push(row)
    else invalid.push(row)
  }

  return { valid, invalid, validIdSet }
}

export function buildProtocolBlockIdRetryHint(input: {
  invalidBlockIds: string[]
  allowedBlockIds: readonly string[]
}): string {
  const invalid = [...new Set(input.invalidBlockIds)].slice(0, 20).join(', ')
  const allowed = input.allowedBlockIds.slice(0, 80).join(', ')
  return [
    'PROTOCOL ERROR: one or more changedBlocks.blockId values are not in the source document.',
    `Rejected blockId(s): ${invalid || '(none)'}`,
    `Allowed blockId values (exact): ${allowed}`,
    'Return changedBlocks again using ONLY allowed blockId values. Do not invent IDs. Do not remap to neighboring numbers.',
  ].join('\n')
}

/**
 * Build strict JSON schema constraining blockId to the request's source IDs.
 * Falls back to unconstrained string when the ID set is empty.
 */
export function buildFullAiJsonSchemaForBlockIds(validBlockIds: readonly string[]) {
  const blockIdSchema =
    validBlockIds.length > 0
      ? { type: 'string' as const, enum: [...validBlockIds] }
      : { type: 'string' as const }

  return {
    name: 'full_ai_contract_rewrite_v2',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['changedBlocks'],
      properties: {
        changedBlocks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['blockId', 'text'],
            properties: {
              blockId: blockIdSchema,
              text: { type: 'string' },
            },
          },
        },
      },
    },
  }
}
