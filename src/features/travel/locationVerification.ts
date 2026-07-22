import type { WeddingPlace, WeddingPlaceRole } from '@/types/travel'

export type LocationVerificationStatus =
  | 'empty'
  | 'verified'
  | 'needs_verification'

const CORE_ROLES: WeddingPlaceRole[] = [
  'preparation',
  'ceremony',
  'reception',
]

/** Verified = has display text and finite coordinates. */
export function isPlaceVerified(
  place: Pick<WeddingPlace, 'latitude' | 'longitude' | 'formattedAddress'>,
): boolean {
  const hasText = Boolean(place.formattedAddress?.trim())
  return (
    hasText &&
    place.latitude != null &&
    place.longitude != null &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude)
  )
}

export function locationVerificationStatus(
  place: WeddingPlace | null | undefined,
): LocationVerificationStatus {
  if (!place?.formattedAddress?.trim()) return 'empty'
  return isPlaceVerified(place) ? 'verified' : 'needs_verification'
}

export function countPlacesNeedingVerification(
  places: WeddingPlace[],
): number {
  return places.filter(
    (p) =>
      CORE_ROLES.includes(p.role) &&
      locationVerificationStatus(p) === 'needs_verification',
  ).length
}

export function corePlacesNeedingVerification(
  places: WeddingPlace[],
): WeddingPlace[] {
  return places.filter(
    (p) =>
      CORE_ROLES.includes(p.role) &&
      locationVerificationStatus(p) === 'needs_verification',
  )
}
