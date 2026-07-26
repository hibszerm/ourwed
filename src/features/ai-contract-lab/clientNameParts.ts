/**
 * Generation-only client name part resolution.
 * Prefer structured first/last; fall back to a deterministic fullName split.
 * Never mutates wedding / client records.
 */

import { splitPersonName } from '@/lib/api/weddings/weddingMappers'
import type { Couple } from '@/types/wedding'

export const CLIENT_NAME_PARTS_REQUIRE_REVIEW = 'client_name_parts_require_review'

export type ClientNamePartsSource =
  | 'structured'
  | 'full_name_fallback'
  | 'unavailable'

export type ClientNameParts = {
  firstName: string
  lastName: string
  source: ClientNamePartsSource
  requiresReview: boolean
  reasonCode?: typeof CLIENT_NAME_PARTS_REQUIRE_REVIEW
}

/**
 * Resolve first/last name parts for contract generation.
 * Hyphenated and multi-part surnames stay in lastName (everything after the
 * first whitespace token), matching splitPersonName.
 */
export function resolveClientNameParts(input: {
  firstName?: string | null
  lastName?: string | null
  fullName?: string | null
}): ClientNameParts {
  const first = input.firstName?.trim() ?? ''
  const last = input.lastName?.trim() ?? ''

  if (first && last) {
    return {
      firstName: first,
      lastName: last,
      source: 'structured',
      requiresReview: false,
    }
  }

  if (first || last) {
    return {
      firstName: first,
      lastName: last,
      source: 'structured',
      requiresReview: !first || !last,
      reasonCode:
        !first || !last ? CLIENT_NAME_PARTS_REQUIRE_REVIEW : undefined,
    }
  }

  const full = input.fullName?.trim() ?? ''
  if (!full) {
    return {
      firstName: '',
      lastName: '',
      source: 'unavailable',
      requiresReview: true,
      reasonCode: CLIENT_NAME_PARTS_REQUIRE_REVIEW,
    }
  }

  const split = splitPersonName(full)
  if (!split.first || !split.last) {
    return {
      firstName: '',
      lastName: '',
      source: 'unavailable',
      requiresReview: true,
      reasonCode: CLIENT_NAME_PARTS_REQUIRE_REVIEW,
    }
  }

  return {
    firstName: split.first,
    lastName: split.last,
    source: 'full_name_fallback',
    requiresReview: false,
  }
}

/** Registry keys for generation snapshot — pure, no I/O, no wedding mutation. */
export function clientNameRegistryValues(couple: Couple): Record<string, string> {
  const bride = resolveClientNameParts({
    firstName: couple.partner1FirstName,
    lastName: couple.partner1LastName,
    fullName: couple.partner1,
  })
  const groom = resolveClientNameParts({
    firstName: couple.partner2FirstName,
    lastName: couple.partner2LastName,
    fullName: couple.partner2,
  })
  const out: Record<string, string> = {}
  if (bride.firstName) out.bride_first_name = bride.firstName
  if (bride.lastName) out.bride_last_name = bride.lastName
  if (groom.firstName) out.groom_first_name = groom.firstName
  if (groom.lastName) out.groom_last_name = groom.lastName
  return out
}
