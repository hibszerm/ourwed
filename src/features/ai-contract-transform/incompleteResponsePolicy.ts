/**
 * Incomplete-response retry + output-token policy (mirrors Edge Function prompts).
 */

export const HARD_MAX_OUTPUT_TOKENS = 16_384
export const NORMAL_MAX_OUTPUT_TOKENS = 8_192
export const MIN_MAX_OUTPUT_TOKENS = 4_096
export const RETRY_MAX_OUTPUT_TOKENS = 12_288

/** Previous v1 full-echo budgets (for diagnostics / report). */
export const LEGACY_V1_BASE_MAX_OUTPUT_TOKENS = 4_000

export function computeMaxOutputTokens(input: {
  blockCount: number
  characterCount: number
  attempt: 1 | 2
}): number {
  if (input.attempt === 2) {
    const largeDoc =
      input.blockCount >= 40 || input.characterCount >= 12_000
    return largeDoc ? HARD_MAX_OUTPUT_TOKENS : RETRY_MAX_OUTPUT_TOKENS
  }
  return Math.min(
    HARD_MAX_OUTPUT_TOKENS,
    Math.max(MIN_MAX_OUTPUT_TOKENS, NORMAL_MAX_OUTPUT_TOKENS),
  )
}

/** One controlled retry only for incomplete + max_output_tokens. */
export function shouldRetryIncomplete(input: {
  attempt: number
  incompleteReason: string | null | undefined
}): boolean {
  return input.attempt === 1 && input.incompleteReason === 'max_output_tokens'
}

/**
 * Estimate structured JSON output tokens if the model echoed every block (v1).
 * Rough heuristic: ~1 token per 4 chars of JSON payload.
 */
export function estimateFullEchoOutputTokens(input: {
  blocks: Array<{ blockId: string; text: string }>
}): number {
  const payload = JSON.stringify({
    responseVersion: '2026-07-full-ai-v1',
    transformedBlocks: input.blocks.map((b) => ({
      blockId: b.blockId,
      text: b.text,
    })),
  })
  return Math.ceil(payload.length / 4)
}

/**
 * Estimate sparse changedBlocks output size.
 */
export function estimateSparseOutputTokens(input: {
  changedBlocks: Array<{ blockId: string; text: string }>
  responseVersion: string
}): number {
  const payload = JSON.stringify({
    responseVersion: input.responseVersion,
    changedBlocks: input.changedBlocks,
  })
  return Math.ceil(payload.length / 4)
}
