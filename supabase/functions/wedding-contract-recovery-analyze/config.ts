export const WEDDING_CONTRACT_RECOVERY_PROMPT_VERSION = '2026-07-recovery-v2'
export const WEDDING_CONTRACT_RECOVERY_RESPONSE_VERSION = '2026-07-recovery-v2'

export const RECOVERY_EDGE_CONFIG = {
  providerTimeoutMs: 120_000,
  maxInputChars: 120_000,
}

/**
 * Recovery-specific model only.
 * Do not inherit OPENAI_CONTRACT_MODEL / OPENAI_MODEL — those default other
 * endpoints to gpt-4.1-mini and would silently change recovery quality.
 */
export function resolveRecoveryModel(): string {
  return (
    Deno.env.get('OPENAI_CONTRACT_RECOVERY_MODEL')?.trim() ||
    'gpt-5-mini'
  )
}

export function shouldAttachLowReasoning(model: string): boolean {
  return /^gpt-5/i.test(model)
}

export function computeMaxOutputTokens(model: string): number {
  const base = 10_000
  return shouldAttachLowReasoning(model) ? base + 4_000 : base
}
