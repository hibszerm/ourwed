import { blockFactOwner } from '../quality/partyOwnership'
import type { TransformDocumentBlock } from '../types'

/** Detect stale identities only on customer-owned source surfaces that have a target-backed stale token. */
export function hasStaleMappedCustomerToken(input: {
  staleTokens: readonly string[]
  sourceBlocks: readonly TransformDocumentBlock[]
  finalBlocks: readonly { blockId: string; text: string }[]
}): boolean {
  const finalById = new Map(input.finalBlocks.map((block) => [block.blockId, block.text]))
  for (const source of input.sourceBlocks) {
    if (blockFactOwner(source) !== 'CUSTOMER') continue
    const finalText = finalById.get(source.blockId)
    if (finalText === undefined) continue
    if (input.staleTokens.some((token) => token.trim() && source.text.includes(token) && finalText.includes(token))) return true
  }
  return false
}
