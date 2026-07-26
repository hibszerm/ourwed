/**
 * AI Contract Lab — Edge Function configuration.
 * Must stay in sync with src/features/ai-contract-lab/aiContractLabPayload.ts constants.
 */

export const PROVIDER_TIMEOUT_MS = 120_000
export const FALLBACK_CONTRACT_MODEL = 'gpt-5-mini'
export const MAX_BODY_ANCHORS = 500
export const MAX_ANCHOR_CHARACTERS = 120_000
export const MAX_SERIALIZED_PAYLOAD_BYTES = Math.floor(1.5 * 1024 * 1024)
export const CONTEXT_CHARS = 240

export const AI_CONTRACT_LAB_EDGE_CONFIG = {
  analysisVersion: '1.0.0',
  providerTimeoutMs: PROVIDER_TIMEOUT_MS,
  maxAnchors: MAX_BODY_ANCHORS,
  maxAnchorCharacters: MAX_ANCHOR_CHARACTERS,
  maxSerializedPayloadBytes: MAX_SERIALIZED_PAYLOAD_BYTES,
  contextChars: CONTEXT_CHARS,
  defaultModel: FALLBACK_CONTRACT_MODEL,
} as const

export type ResolvedModel = {
  model: string
  source: 'env' | 'fallback'
}

/** Laboratory uses OPENAI_CONTRACT_MODEL only — never OPENAI_MODEL. */
export function resolveContractLabModel(): ResolvedModel {
  const raw = Deno.env.get('OPENAI_CONTRACT_MODEL')?.trim()
  if (raw) return { model: raw, source: 'env' }
  return { model: FALLBACK_CONTRACT_MODEL, source: 'fallback' }
}

export function computeMaxOutputTokens(anchorCount: number): number {
  // Phase A semantic maps can list many roles — avoid truncated JSON (422).
  return Math.min(16_000, Math.max(4_000, 2_000 + anchorCount * 100))
}

export function shouldAttachLowReasoning(model: string): boolean {
  return /^gpt-5/i.test(model.trim())
}
