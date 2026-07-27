/**
 * Client-side validators for sparse changedBlocks model results + application envelopes.
 */

import {
  FULL_AI_RESPONSE_VERSION,
  GUARDED_AI_RESPONSE_VERSION,
  type TransformMode,
  type TransformedBlock,
} from './types'

export const MODEL_SCHEMA_VERSION = 'sparse-changed-blocks-v1' as const

export type SparseChangedBlock = {
  blockId: string
  text: string
}

export type SparseChangedBlocksModelResult = {
  changedBlocks: SparseChangedBlock[]
}

export type FullAiSparseResponseV2 = {
  responseVersion: typeof FULL_AI_RESPONSE_VERSION
  changedBlocks: SparseChangedBlock[]
}

export type GuardedAiSparseResponseV2 = {
  responseVersion: typeof GUARDED_AI_RESPONSE_VERSION
  changedBlocks: SparseChangedBlock[]
}

export type SparseV2ParseResult =
  | {
      ok: true
      responseVersion: string
      changedBlocks: SparseChangedBlock[]
      modelSchemaVersion: typeof MODEL_SCHEMA_VERSION
      ignoredModelResponseVersion?: string | null
    }
  | { ok: false; code: string; message: string }

const ALLOWED_BLOCK_KEYS = new Set(['blockId', 'text'])

function trustedVersion(mode: TransformMode): string {
  return mode === 'full_ai_trusted_rewrite'
    ? FULL_AI_RESPONSE_VERSION
    : GUARDED_AI_RESPONSE_VERSION
}

/**
 * Validate raw model / Edge-returned changedBlocks payload.
 * Ignores legacy responseVersion; injects trusted application version.
 */
export function parseSparseV2ModelPayload(
  mode: TransformMode,
  payload: unknown,
): SparseV2ParseResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, code: 'invalid_structured_output', message: 'Expected object' }
  }
  const obj = payload as Record<string, unknown>
  let ignoredModelResponseVersion: string | null = null

  for (const key of Object.keys(obj)) {
    if (key === 'changedBlocks') continue
    if (key === 'responseVersion') {
      ignoredModelResponseVersion =
        typeof obj.responseVersion === 'string' ? obj.responseVersion : null
      continue
    }
    // Edge HTTP success may include diagnostics/model/etc — only validate changedBlocks path
    // when this is called on a model-shaped object. For Edge envelope, callers pass
    // { changedBlocks } or legacy { responseVersion, changedBlocks }.
    if (
      key === 'ok' ||
      key === 'model' ||
      key === 'promptVersion' ||
      key === 'diagnostics' ||
      key === 'modelSummary'
    ) {
      continue
    }
    return {
      ok: false,
      code: 'unexpected_fields',
      message: `Unexpected field: ${key}`,
    }
  }

  if (!Array.isArray(obj.changedBlocks)) {
    return {
      ok: false,
      code: 'invalid_structured_output',
      message: 'changedBlocks must be an array',
    }
  }

  const changedBlocks: SparseChangedBlock[] = []
  for (const row of obj.changedBlocks) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return {
        ok: false,
        code: 'invalid_structured_output',
        message: 'Invalid changed block',
      }
    }
    const block = row as Record<string, unknown>
    for (const key of Object.keys(block)) {
      if (!ALLOWED_BLOCK_KEYS.has(key)) {
        return {
          ok: false,
          code: 'unexpected_fields',
          message: `Unexpected block field: ${key}`,
        }
      }
    }
    if (typeof block.blockId !== 'string' || typeof block.text !== 'string') {
      return {
        ok: false,
        code: 'invalid_structured_output',
        message: 'blockId and text required',
      }
    }
    changedBlocks.push({ blockId: block.blockId, text: block.text })
  }

  return {
    ok: true,
    responseVersion: trustedVersion(mode),
    changedBlocks,
    modelSchemaVersion: MODEL_SCHEMA_VERSION,
    ignoredModelResponseVersion,
  }
}

/** Assert prompts never require echoing every source block. */
export function assertSparseOutputContract(promptText: string): boolean {
  const lower = promptText.toLowerCase()
  const forbidsEcho =
    lower.includes('do not return unchanged') ||
    lower.includes('only blocks whose text must change') ||
    lower.includes('only blocks that contain an allowed')
  const doesNotRequireFull =
    !lower.includes('return every document block') &&
    !lower.includes('return all blocks')
  return forbidsEcho && doesNotRequireFull
}

export function isLegacyV1ResponseVersion(version: string): boolean {
  return (
    version === '2026-07-full-ai-v1' || version === '2026-07-guarded-ai-v1'
  )
}

export function parseLegacyV1TransformedBlocks(
  body: Record<string, unknown>,
): TransformedBlock[] | null {
  if (!isLegacyV1ResponseVersion(String(body.responseVersion ?? ''))) {
    return null
  }
  const blocks = body.transformedBlocks
  if (!Array.isArray(blocks)) return null
  const out: TransformedBlock[] = []
  for (const b of blocks) {
    if (!b || typeof b !== 'object') return null
    const row = b as Record<string, unknown>
    if (typeof row.blockId !== 'string' || typeof row.text !== 'string') return null
    out.push({ blockId: row.blockId, text: row.text })
  }
  return out
}
