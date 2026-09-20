/**
 * CG4 — deterministic party placeholder completeness.
 *
 * Known structural party placeholders (template vocabulary) are replaced with
 * canonical clients.displayNames from the transformation dataset.
 *
 * Does not invent second parties. Does not rewrite arbitrary legal prose
 * without an explicit placeholder slot.
 */

import type {
  ContractTransformationDataset,
  TransformedBlock,
} from '../types'
import { fingerprintText } from './normalize'
import type { DeterministicRepair } from './types'

/** Structural party placeholders used by OurWed contract templates / CG fixtures. */
export const KNOWN_PARTY_PLACEHOLDERS = ['PLACEHOLDER_STRONY'] as const

export function documentHasUnresolvedPartyPlaceholder(text: string): boolean {
  return KNOWN_PARTY_PLACEHOLDERS.some((p) => text.includes(p))
}

/**
 * Replace known party placeholders with canonical displayNames.
 */
export function repairCanonicalPartyPlaceholders(input: {
  blocks: TransformedBlock[]
  dataset: ContractTransformationDataset
}): { blocks: TransformedBlock[]; repairs: DeterministicRepair[] } {
  const repairs: DeterministicRepair[] = []
  const display = input.dataset.clients.displayNames?.trim()
  if (!display) {
    return { blocks: input.blocks, repairs }
  }

  const blocks = input.blocks.map((b) => ({ ...b }))
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!
    if (!documentHasUnresolvedPartyPlaceholder(b.text)) continue
    let next = b.text
    for (const ph of KNOWN_PARTY_PLACEHOLDERS) {
      if (next.includes(ph)) {
        next = next.split(ph).join(display)
      }
    }
    if (next === b.text) continue
    repairs.push({
      repairCode: 'insert_canonical_party_placeholder',
      blockId: b.blockId,
      canonicalField: 'customer.names',
      beforeFingerprint: fingerprintText(b.text),
      afterFingerprint: fingerprintText(next),
    })
    blocks[i] = { ...b, text: next }
  }

  return { blocks, repairs }
}
