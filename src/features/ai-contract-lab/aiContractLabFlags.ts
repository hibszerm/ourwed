/** Feature flag for the isolated AI Contract Lab prototype. */
export function isAiContractLabEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_AI_CONTRACT_LAB === 'true'
}

export function getAiContractLabWeddingIdOverride(): string | null {
  const raw = import.meta.env.VITE_AI_CONTRACT_LAB_WEDDING_ID?.trim()
  return raw || null
}

export const AI_CONTRACT_LAB_WEDDING_STORAGE_KEY =
  'ourwed:ai-contract-lab-wedding-id'

export const AI_CONTRACT_LAB_MAX_BYTES = 20 * 1024 * 1024
