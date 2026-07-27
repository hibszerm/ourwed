/**
 * Party ownership classification for indexed document blocks.
 */

import type { ProtectedDocumentRange } from './protectedDocumentRanges'
import type { IndexedDocxBlock } from './types'

export type DocumentBlockPartyClassification =
  | 'client_only'
  | 'provider_only'
  | 'mixed'
  | 'neutral'
  | 'unknown'

const CLIENT_MARKERS =
  /Zamawiaj|Klient|Narzecz|Usługobiorc|Państwo Młod|zam\.|tel\.\s*\d/i

const PROVIDER_IDENTITY_MARKERS =
  /Filmograf|Fotograf|studio|NIP|REGON|rachunek|IBAN|\d{2}(?:\s\d{4}){6}/i

const PROVIDER_ROLE_WORDS = /Wykonawc|Usługodawc/i

const DYNAMIC_WEDDING_MARKERS =
  /\d{1,2}\.\d{1,2}\.\d{4}|\d[\d\s]*\s*zł|słownie|tysiąc|tysięcy|złotych/i

const PROVIDER_PROTECTED_CLASSIFICATIONS = new Set<ProtectedDocumentRange['classification']>([
  'provider_identity',
  'provider_address',
  'provider_nip',
  'provider_regon',
  'provider_phone',
  'provider_bank_account',
])

export function classifyDocumentBlock(input: {
  block: IndexedDocxBlock
  protectedRanges: ProtectedDocumentRange[]
}): DocumentBlockPartyClassification {
  const text = input.block.text
  const hasClient = CLIENT_MARKERS.test(text)
  const hasProviderIdentity =
    PROVIDER_IDENTITY_MARKERS.test(text) ||
    input.protectedRanges.some((r) =>
      PROVIDER_PROTECTED_CLASSIFICATIONS.has(r.classification),
    )
  const hasProviderRole = PROVIDER_ROLE_WORDS.test(text)
  const hasDynamicCandidate = DYNAMIC_WEDDING_MARKERS.test(text)

  if (hasClient && !hasProviderIdentity) {
    return 'client_only'
  }

  if (hasProviderIdentity && hasDynamicCandidate) {
    return 'mixed'
  }

  if (hasProviderIdentity) {
    return 'provider_only'
  }

  if (hasProviderRole && !hasClient && !hasDynamicCandidate) {
    return 'neutral'
  }

  if (!hasClient && !hasProviderRole && !hasDynamicCandidate) {
    return 'neutral'
  }

  if (hasClient && !hasProviderIdentity) return 'client_only'

  return 'unknown'
}
