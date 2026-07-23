import type { TravelPlan, TravelSegment } from '@/types/travel'
import { isPlaceVerified } from '@/features/travel/locationVerification'

export interface TravelStop {
  key: string
  title: string
  address: string
  placeId: string | null
  latitude: number | null
  longitude: number | null
  kind: 'studio' | 'wedding_place'
  role?: string
}

/** Present stops in route order (missing / unverified locations skipped). */
export interface TravelFlowStop extends TravelStop {
  isSet: true
  markerIndex: number
}

export interface TravelFlow {
  stops: TravelFlowStop[]
  /** Legs[i] sits between stops[i] and stops[i + 1]. */
  legs: Array<TravelSegment | null>
  hasAnyLocation: boolean
}

const ROLE_TITLES: Record<string, string> = {
  preparation: 'Przygotowania',
  ceremony: 'Ceremonia',
  reception: 'Przyjęcie',
}

/**
 * Build UI flow from plan — only verified stops (with coordinates), consecutive legs.
 * Matches travelService skip-ahead routing.
 */
export function buildTravelFlow(plan: TravelPlan): TravelFlow {
  const byRole = new Map(plan.places.map((p) => [p.role, p]))
  const stops: TravelFlowStop[] = []

  const studio = plan.studio
  if (
    studio &&
    (studio.formattedAddress || studio.studioName) &&
    studio.latitude != null &&
    studio.longitude != null &&
    Number.isFinite(studio.latitude) &&
    Number.isFinite(studio.longitude)
  ) {
    stops.push({
      key: 'studio',
      title: 'Firma',
      address: studio.formattedAddress || studio.studioName || 'Firma',
      placeId: studio.placeId,
      latitude: studio.latitude,
      longitude: studio.longitude,
      kind: 'studio',
      isSet: true,
      markerIndex: stops.length + 1,
    })
  }

  for (const role of ['preparation', 'ceremony', 'reception'] as const) {
    const place = byRole.get(role)
    if (!place || !isPlaceVerified(place)) continue
    stops.push({
      key: place.id,
      title: ROLE_TITLES[role] ?? role,
      address: place.formattedAddress,
      placeId: place.placeId,
      latitude: place.latitude,
      longitude: place.longitude,
      kind: 'wedding_place',
      role,
      isSet: true,
      markerIndex: stops.length + 1,
    })
  }

  const sortedSegments = [...plan.segments].sort(
    (a, b) => a.sequence - b.sequence,
  )
  const legs: Array<TravelSegment | null> = []
  for (let i = 0; i < Math.max(0, stops.length - 1); i++) {
    legs.push(sortedSegments[i] ?? null)
  }

  return {
    stops,
    legs,
    hasAnyLocation: stops.length > 0,
  }
}

export function formatTotalDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  const km = meters / 1000
  return `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`
}

export function formatTotalDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h} godz. ${m} min` : `${h} godz.`
}

export function sumTravelTotals(segments: TravelSegment[]): {
  distanceMeters: number
  durationSeconds: number
  distanceText: string
  durationText: string
} {
  const distanceMeters = segments.reduce(
    (sum, s) => sum + (s.distanceMeters ?? 0),
    0,
  )
  const durationSeconds = segments.reduce(
    (sum, s) => sum + (s.durationSeconds ?? 0),
    0,
  )
  return {
    distanceMeters,
    durationSeconds,
    distanceText: formatTotalDistance(distanceMeters),
    durationText: formatTotalDuration(durationSeconds),
  }
}

/** Google Maps navigation URL for one-click full-route open (not Directions API). */
export function openFullRouteUrl(stops: TravelStop[]): string | null {
  const usable = stops.filter(
    (s) =>
      (s.latitude != null &&
        s.longitude != null &&
        Number.isFinite(s.latitude) &&
        Number.isFinite(s.longitude)) ||
      s.address.trim().length > 0,
  )
  if (usable.length < 2) return null

  const point = (s: TravelStop): string => {
    if (
      s.latitude != null &&
      s.longitude != null &&
      Number.isFinite(s.latitude) &&
      Number.isFinite(s.longitude)
    ) {
      return `${s.latitude},${s.longitude}`
    }
    return s.address.trim()
  }

  const origin = encodeURIComponent(point(usable[0]))
  const destination = encodeURIComponent(point(usable[usable.length - 1]))
  const middle = usable.slice(1, -1)
  const waypoints =
    middle.length > 0
      ? `&waypoints=${middle.map((s) => encodeURIComponent(point(s))).join('%7C')}`
      : ''

  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints}&travelmode=driving`
}

export function stopsWithCoordinates(
  stops: TravelStop[],
): Array<TravelStop & { latitude: number; longitude: number }> {
  return stops.filter(
    (s): s is TravelStop & { latitude: number; longitude: number } =>
      s.latitude != null &&
      s.longitude != null &&
      Number.isFinite(s.latitude) &&
      Number.isFinite(s.longitude),
  )
}
