/** AI Contract Experiment — structured mapping Edge configuration. */

export const AI_CONTRACT_MAPPING_PROMPT_VERSION = '2026-07-v3'

export const PROVIDER_TIMEOUT_MS = 120_000
export const FALLBACK_MAPPING_MODEL = 'gpt-4.1-mini'

export const MAX_BLOCKS = 600
export const MAX_BLOCK_TEXT_CHARS = 4_000
export const MAX_TOTAL_SOURCE_CHARS = 120_000
export const MAX_SERIALIZED_PAYLOAD_BYTES = Math.floor(1.5 * 1024 * 1024)

/**
 * max_output_tokens budget for compact v3 structured output.
 *
 * Formula:
 *   base overhead
 *   + estimated occurrences × per-occurrence tokens
 *   × variance multiplier (larger / denser contracts)
 *   + reasoning-model headroom (gpt-5 hidden reasoning shares the limit)
 *
 * Measured v3 compact field ≈ 25 tokens each (chars/4 heuristic).
 * For 47 blocks (~40 occurrences): ~400 + 1000 = 1400 × 1.75 ≈ 2450 + 2500 reasoning ≈ 4950.
 */
export const MAPPING_OUTPUT_TOKEN_CONFIG = {
  baseOverheadTokens: 400,
  tokensPerFieldOccurrence: 25,
  varianceMultiplier: 1.75,
  reasoningModelHeadroom: 2_500,
  floor: 4_000,
  ceiling: 16_000,
} as const

export const STRUCTURED_MAPPING_EDGE_CONFIG = {
  promptVersion: AI_CONTRACT_MAPPING_PROMPT_VERSION,
  providerTimeoutMs: PROVIDER_TIMEOUT_MS,
  maxBlocks: MAX_BLOCKS,
  maxBlockTextChars: MAX_BLOCK_TEXT_CHARS,
  maxTotalSourceChars: MAX_TOTAL_SOURCE_CHARS,
  maxSerializedPayloadBytes: MAX_SERIALIZED_PAYLOAD_BYTES,
  defaultModel: FALLBACK_MAPPING_MODEL,
  maxOutputTokens: MAPPING_OUTPUT_TOKEN_CONFIG,
} as const

export type ResolvedMappingModel = {
  model: string
  source: 'env' | 'fallback'
}

/** Laboratory mapping uses OPENAI_CONTRACT_MAPPING_MODEL, then OPENAI_CONTRACT_MODEL. */
export function resolveMappingModel(): ResolvedMappingModel {
  const mapping = Deno.env.get('OPENAI_CONTRACT_MAPPING_MODEL')?.trim()
  if (mapping) return { model: mapping, source: 'env' }
  const contract = Deno.env.get('OPENAI_CONTRACT_MODEL')?.trim()
  if (contract) return { model: contract, source: 'env' }
  return { model: FALLBACK_MAPPING_MODEL, source: 'fallback' }
}

export function shouldAttachLowReasoning(model: string): boolean {
  return /^gpt-5/i.test(model.trim())
}

export function computeMaxOutputTokens(blockCount: number, model?: string): number {
  const estimatedOccurrences = Math.ceil(blockCount * 0.9)
  const estimated =
    MAPPING_OUTPUT_TOKEN_CONFIG.baseOverheadTokens +
    estimatedOccurrences * MAPPING_OUTPUT_TOKEN_CONFIG.tokensPerFieldOccurrence
  const withVariance = Math.ceil(
    estimated * MAPPING_OUTPUT_TOKEN_CONFIG.varianceMultiplier,
  )
  const reasoning =
    model && shouldAttachLowReasoning(model)
      ? MAPPING_OUTPUT_TOKEN_CONFIG.reasoningModelHeadroom
      : 0
  return Math.min(
    MAPPING_OUTPUT_TOKEN_CONFIG.ceiling,
    Math.max(MAPPING_OUTPUT_TOKEN_CONFIG.floor, withVariance + reasoning),
  )
}
