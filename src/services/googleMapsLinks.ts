/**
 * Shared Google Maps URL builders (no API key — public maps links only).
 */

export interface MapsLinkPlace {
  placeId?: string | null
  latitude?: number | null
  longitude?: number | null
  formattedAddress?: string | null
  address?: string | null
}

export type NavigationDestination = {
  formattedAddress?: string | null
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
 * Intentionally omits origin and waypoints.
 */
export function buildGoogleMapsNavigationUrl(
  destination: NavigationDestination,
): string | null {
  const placeId = destination.placeId
    ? stripPlaceIdPrefix(destination.placeId)
    : ''

  let destinationParam = ''
  if (hasCoords(destination)) {
    destinationParam = `${destination.latitude},${destination.longitude}`
  } else if ((destination.formattedAddress || '').trim()) {
    destinationParam = (destination.formattedAddress || '').trim()
  } else if (placeId) {
    // placeId alone is not enough for Maps URLs — use place_id: fallback value.
    destinationParam = `place_id:${placeId}`
  }

  if (!destinationParam) return null

  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('destination', destinationParam)
  if (placeId) {
    url.searchParams.set('destination_place_id', placeId)
  }
  url.searchParams.set('travelmode', 'driving')
  url.searchParams.set('dir_action', 'navigate')
  return url.toString()
}
