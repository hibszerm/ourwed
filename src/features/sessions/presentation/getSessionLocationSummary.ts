import { getLocationLocality } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import { isMeaningfulVenueName } from '@/features/travel/weddingLocationModel'
import type { SessionLocation } from '@/types/session'

/**
 * Compact session location for lists/cards: place name + locality.
 * Never prefers a long street as the primary label when a place name exists.
 */
export function getSessionLocationSummary(
  location?: SessionLocation | null,
): string | null {
  if (!location) return null

  const name = location.name?.trim() || ''
  const formatted =
    location.formattedAddress?.trim() || location.address?.trim() || ''
  const locality = getLocationLocality({
    formattedAddress: formatted || null,
  })

  const meaningfulName = isMeaningfulVenueName(name, formatted)
    ? name
    : ''

  if (meaningfulName && locality && !meaningfulName.includes(locality)) {
    return `${meaningfulName}, ${locality}`
  }
  if (meaningfulName) return meaningfulName
  if (locality) return locality
  if (formatted) {
    // Avoid dumping a long street as the only label when possible —
    // locality extraction already tried; fall back to first segment.
    const first = formatted.split(',')[0]?.trim()
    return first || formatted
  }
  return null
}
