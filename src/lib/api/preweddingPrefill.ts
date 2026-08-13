/**
 * Pure prefill builder for pre-wedding questionnaires (no Supabase).
 * Location mappings prefer structured wedding_places (name + address + geo).
 */

import type { PrefillValue } from '@/types/preweddingQuestionnaire'
import type { GeoPlace, WeddingPlace, WeddingPlaceRole } from '@/types/travel'
import type { Wedding } from '@/types/wedding'

const PLACE_ROLE_TO_MAPPING: Partial<Record<WeddingPlaceRole, string>> = {
  bride_preparation: 'bridePreparationLocation',
  preparation: 'bridePreparationLocation',
  groom_preparation: 'groomPreparationLocation',
  ceremony: 'ceremonyLocation',
  reception: 'receptionVenue',
}

function weddingPlaceToPrefillGeo(place: WeddingPlace): GeoPlace {
  const label = place.label?.trim() || null
  const address = place.formattedAddress?.trim() || ''
  return {
    placeId: place.placeId ?? null,
    formattedAddress: address || label || '',
    latitude: place.latitude ?? null,
    longitude: place.longitude ?? null,
    label: label && label !== address ? label : label,
    provider: place.placeId ? 'google' : null,
  }
}

/**
 * Prefill for newly prepared questionnaires.
 * Legacy wedding.*Location strings are used only when no place row exists.
 */
export function buildPrefill(
  wedding: Wedding,
  places: WeddingPlace[] = [],
): Record<string, PrefillValue> {
  const prefill: Record<string, PrefillValue> = {}
  if (wedding.date) prefill.weddingDate = wedding.date
  if (wedding.couple.partner1) prefill.brideName = wedding.couple.partner1
  if (wedding.couple.partner1Phone || wedding.couple.phone) {
    prefill.bridePhone = wedding.couple.partner1Phone || wedding.couple.phone
  }
  if (wedding.couple.partner2) prefill.groomName = wedding.couple.partner2
  if (wedding.couple.partner2Phone) prefill.groomPhone = wedding.couple.partner2Phone
  if (wedding.ceremonyTime) prefill.ceremonyTime = wedding.ceremonyTime

  for (const place of places) {
    const mapping = PLACE_ROLE_TO_MAPPING[place.role]
    if (!mapping) continue
    if (!(place.formattedAddress || '').trim() && !(place.label || '').trim()) {
      continue
    }
    // First place per role wins (list is typically ordered).
    if (prefill[mapping] != null) continue
    prefill[mapping] = weddingPlaceToPrefillGeo(place)
  }

  if (
    prefill.bridePreparationLocation == null &&
    wedding.bridePreparationLocation
  ) {
    prefill.bridePreparationLocation = wedding.bridePreparationLocation
  }
  if (
    prefill.groomPreparationLocation == null &&
    wedding.groomPreparationLocation
  ) {
    prefill.groomPreparationLocation = wedding.groomPreparationLocation
  }
  if (prefill.ceremonyLocation == null && wedding.ceremonyLocation) {
    prefill.ceremonyLocation = wedding.ceremonyLocation
  }
  if (prefill.receptionVenue == null && wedding.receptionLocation) {
    prefill.receptionVenue = wedding.receptionLocation
  }
  return prefill
}
