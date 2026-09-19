/**
 * V6-DR1 — Bounded wedding place detail selectors (typed enum only).
 */

export const V6_WEDDING_PLACE_DETAIL_SELECTORS = [
  'ceremony_place',
  'ceremony_address',
  'reception_place',
  'reception_address',
  'bride_preparation_place',
  'bride_preparation_address',
  'groom_preparation_place',
  'groom_preparation_address',
] as const

export type V6WeddingPlaceDetailSelector =
  (typeof V6_WEDDING_PLACE_DETAIL_SELECTORS)[number]

export type V6WeddingPlaceRole =
  | 'ceremony'
  | 'reception'
  | 'bride_preparation'
  | 'groom_preparation'

export type V6WeddingPlaceDetailField = 'place' | 'address'

export function isV6WeddingPlaceDetailSelector(
  raw: unknown,
): raw is V6WeddingPlaceDetailSelector {
  return (
    typeof raw === 'string' &&
    (V6_WEDDING_PLACE_DETAIL_SELECTORS as readonly string[]).includes(raw)
  )
}

export function parseWeddingPlaceDetailSelector(
  raw: unknown,
):
  | { ok: true; selector: V6WeddingPlaceDetailSelector }
  | { ok: false; detail: string } {
  if (!isV6WeddingPlaceDetailSelector(raw)) {
    return { ok: false, detail: `unknown_detail_selector:${String(raw)}` }
  }
  return { ok: true, selector: raw }
}

export function weddingPlaceDetailRole(
  selector: V6WeddingPlaceDetailSelector,
): V6WeddingPlaceRole {
  if (selector.startsWith('ceremony_')) return 'ceremony'
  if (selector.startsWith('reception_')) return 'reception'
  if (selector.startsWith('bride_preparation_')) return 'bride_preparation'
  return 'groom_preparation'
}

export function weddingPlaceDetailField(
  selector: V6WeddingPlaceDetailSelector,
): V6WeddingPlaceDetailField {
  return selector.endsWith('_address') ? 'address' : 'place'
}

export function weddingPlaceDetailTitle(
  selector: V6WeddingPlaceDetailSelector,
): string {
  switch (selector) {
    case 'ceremony_place':
      return 'Miejsce ceremonii'
    case 'ceremony_address':
      return 'Adres ceremonii'
    case 'reception_place':
      return 'Miejsce wesela'
    case 'reception_address':
      return 'Adres wesela'
    case 'bride_preparation_place':
      return 'Przygotowania panny młodej'
    case 'bride_preparation_address':
      return 'Adres przygotowań panny młodej'
    case 'groom_preparation_place':
      return 'Przygotowania pana młodego'
    case 'groom_preparation_address':
      return 'Adres przygotowań pana młodego'
  }
}
