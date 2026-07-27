/**
 * Deterministic preparation-location normalization for contracts.
 */

import { formatPolishPostalAddress } from '@/lib/utils/formatPolishPostalAddress'
import type { Wedding } from '@/types/wedding'

export type PreparationPerson = 'bride' | 'groom' | 'shared'

export type PreparationLocationEntry = {
  person: PreparationPerson
  label: string
  address: string
}

function normalizeAddressText(raw: string | null | undefined): string {
  const t = raw?.trim() || ''
  if (!t) return ''
  return formatPolishPostalAddress({ fullAddress: t })
}

function addressesEqual(a: string, b: string): boolean {
  return a.replace(/\s+/g, ' ').trim().toLowerCase() ===
    b.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Build structured preparation locations from wedding snapshot fields.
 * Never silently drops a distinct groom/bride address.
 */
export function buildPreparationLocationEntries(
  wedding: Pick<
    Wedding,
    | 'bridePreparationLocation'
    | 'groomPreparationLocation'
    | 'preparationLocation'
  >,
): PreparationLocationEntry[] {
  const brideRaw =
    wedding.bridePreparationLocation?.trim() ||
    wedding.preparationLocation?.trim() ||
    ''
  const groomRaw = wedding.groomPreparationLocation?.trim() || ''
  const bride = normalizeAddressText(brideRaw)
  const groom = normalizeAddressText(groomRaw)

  if (bride && groom) {
    if (addressesEqual(bride, groom)) {
      return [
        {
          person: 'shared',
          label: 'Przygotowania Pary Młodej',
          address: bride,
        },
      ]
    }
    return [
      {
        person: 'bride',
        label: 'Przygotowania Panny Młodej',
        address: bride,
      },
      {
        person: 'groom',
        label: 'Przygotowania Pana Młodego',
        address: groom,
      },
    ]
  }

  if (bride) {
    return [
      {
        person: wedding.groomPreparationLocation ? 'bride' : 'shared',
        label: wedding.groomPreparationLocation
          ? 'Przygotowania Panny Młodej'
          : 'Przygotowania',
        address: bride,
      },
    ]
  }

  if (groom) {
    return [
      {
        person: 'groom',
        label: 'Przygotowania Pana Młodego',
        address: groom,
      },
    ]
  }

  return []
}

/**
 * Polish display fragment for preparation clauses (no trailing period).
 * Matches common template phrasing around “przygotowań … które odbędą się …”.
 */
export function formatPreparationLocationsDisplayText(
  entries: PreparationLocationEntry[],
): string {
  if (entries.length === 0) return ''
  if (entries.length === 1) {
    const e = entries[0]!
    if (e.person === 'bride') {
      return `przygotowań Panny Młodej, które odbędą się pod adresem ${e.address}`
    }
    if (e.person === 'groom') {
      return `przygotowań Pana Młodego, które odbędą się pod adresem ${e.address}`
    }
    return `przygotowań, które odbędą się pod adresem ${e.address}`
  }

  const bride = entries.find((e) => e.person === 'bride')
  const groom = entries.find((e) => e.person === 'groom')
  if (bride && groom) {
    return `przygotowań Panny Młodej pod adresem ${bride.address} oraz przygotowań Pana Młodego pod adresem ${groom.address}`
  }
  return entries.map((e) => `${e.label}: ${e.address}`).join('; ')
}
