/**
 * Shared Google Maps URL builders (no API key — public maps links only).
 */

export interface MapsLinkPlace {
  placeId?: string | null
  latitude?: number | null
  longitude?: number | null
  formattedAddress?: string | null
  address?: string | null
  label?: string | null
  street?: string | null
  buildingNumber?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
}

export type NavigationDestination = {
  /** Preferred complete postal / formatted address. */
  formattedAddress?: string | null
  /** Venue / place display name — may prefix the postal address, never replace it. */
  label?: string | null
  address?: string | null
  street?: string | null
  buildingNumber?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
  /**
   * Stored for maps/routes elsewhere — never passed as destination_place_id
   * in direct “Nawiguj” links.
   */
  placeId?: string | null
  latitude?: number | null
  longitude?: number | null
}

function hasCoords(p: {
  latitude?: number | null
  longitude?: number | null
}): boolean {
  return (
    p.latitude != null &&
    p.longitude != null &&
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude)
  )
}

function stripPlaceIdPrefix(placeId: string): string {
  return placeId.replace(/^google:/, '').trim()
}

function assembleAddressParts(dest: NavigationDestination): string {
  const line1 = [dest.street?.trim(), dest.buildingNumber?.trim()]
    .filter(Boolean)
    .join(' ')
    .trim()
  const cityLine = [dest.postalCode?.trim(), dest.city?.trim()]
    .filter(Boolean)
    .join(' ')
    .trim()
  const country = dest.country?.trim() || ''
  return [line1, cityLine, country].filter(Boolean).join(', ').trim()
}

/**
 * Resolve the destination text for direct Google Maps navigation.
 * Prefers a complete postal address; never returns coords or place_id.
 */
export function resolveNavigationDestinationAddress(
  dest: NavigationDestination,
): string | null {
  const formatted = (dest.formattedAddress || '').trim()
  const assembled = assembleAddressParts(dest)
  const legacy = (dest.address || '').trim()
  const postal = formatted || assembled || legacy
  const label = (dest.label || '').trim()

  if (postal) {
    if (
      label &&
      label.toLowerCase() !== postal.toLowerCase() &&
      !postal.toLowerCase().includes(label.toLowerCase())
    ) {
      return `${label}, ${postal}`
    }
    return postal
  }

  // Last fallback: non-empty label only (better than empty Maps). Callers may still disable.
  return label || null
}

function pointQuery(p: MapsLinkPlace): string {
  if (hasCoords(p)) return `${p.latitude},${p.longitude}`
  const placeId = p.placeId ? stripPlaceIdPrefix(p.placeId) : ''
  if (placeId) return `place_id:${placeId}`
  return (p.formattedAddress || p.address || '').trim()
}

/** Open a single place in Google Maps. */
export function googleMapsPlaceUrl(place: MapsLinkPlace): string | null {
  const q = pointQuery(place)
  if (!q) return null
  const url = new URL('https://www.google.com/maps/search/')
  url.searchParams.set('api', '1')
  url.searchParams.set('query', q)
  return url.toString()
}

/** Driving directions URL for an ordered list of stops (external nav). */
export function googleMapsDirectionsUrl(
  stops: MapsLinkPlace[],
): string | null {
  const usable = stops.filter((s) => pointQuery(s).length > 0)
  if (usable.length < 2) return null

  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('origin', pointQuery(usable[0]))
  url.searchParams.set('destination', pointQuery(usable[usable.length - 1]))
  url.searchParams.set('travelmode', 'driving')
  const middle = usable.slice(1, -1)
  if (middle.length > 0) {
    url.searchParams.set(
      'waypoints',
      middle.map((s) => pointQuery(s)).join('|'),
    )
  }
  return url.toString()
}

/**
 * Direct navigation from the device's current/relevant location to one destination.
 * Uses the complete stored address string — never destination_place_id / coords-first.
 * Intentionally omits origin and waypoints.
 */
export function buildGoogleMapsNavigationUrl(
  destination: NavigationDestination,
): string | null {
  const destinationParam = resolveNavigationDestinationAddress(destination)
  if (!destinationParam) return null

  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('destination', destinationParam)
  url.searchParams.set('travelmode', 'driving')
  url.searchParams.set('dir_action', 'navigate')
  return url.toString()
}
