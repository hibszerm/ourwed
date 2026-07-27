/**
 * Product wedding generation uses the sparse Full-AI changedBlocks pipeline
 * (Mode A download policy — not Comparison Lab Mode B guarded blocking).
 * Set VITE_USE_SPARSE_WEDDING_CONTRACT_GENERATION=false to emergency-rollback
 * to the legacy slot-based transformContract path (already-analyzed templates only).
 */

export function isSparseWeddingContractGenerationEnabled(): boolean {
  const env =
    typeof import.meta !== 'undefined'
      ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
          .env
      : undefined
  const raw = env?.VITE_USE_SPARSE_WEDDING_CONTRACT_GENERATION
  if (raw === 'false' || raw === '0') return false
  return true
}
