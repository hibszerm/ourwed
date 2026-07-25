import type { TravelPlan, TravelSegment } from '@/types/travel'
import { isPlaceVerified } from '@/features/travel/locationVerification'
import {
  buildGoogleMapsNavigationUrl,
  googleMapsDirectionsUrl,
} from '@/services/googleMapsLinks'

export interface TravelStop {
  key: string
  title: string
  address: string
  /** Venue / place name when distinct from the postal address. */
  label?: string | null
  placeId: string | null
  latitude: number | null
  longitude: number | null
  kind: 'studio' | 'wedding_place'
  role?: string
  /** Accessible navigation label. */
  navigateLabel: string
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
  bride_preparation: 'Przygotowania Panny Młodej',
  groom_preparation: 'Przygotowania Pana Młodego',
  /** Legacy display only — migrated rows normalize to bride_preparation. */
  preparation: 'Przygotowania — starszy zapis',
  ceremony: 'Ceremonia',
  reception: 'Przyjęcie weselne',
}

const ROLE_NAV_LABELS: Record<string, string> = {
  bride_preparation: 'Nawiguj do przygotowań Panny Młodej',
  groom_preparation: 'Nawiguj do przygotowań Pana Młodego',
  preparation: 'Nawiguj do przygotowań (starszy zapis)',
  ceremony: 'Nawiguj do ceremonii',
  reception: 'Nawiguj na przyjęcie weselne',
  studio: 'Nawiguj do firmy',
}

const STOP_ROLES = [
  'bride_preparation',
  'groom_preparation',
  'ceremony',
  'reception',
] as const

/**
 * Build UI flow from plan — only verified stops (with coordinates), consecutive legs.
 * Matches travelService skip-ahead routing.
 */
export function buildTravelFlow(plan: TravelPlan): TravelFlow {
  const byRole = new Map(plan.places.map((p) => [p.role, p]))
  // Compat: legacy preparation place fills bride slot when bride_preparation absent.
  if (!byRole.has('bride_preparation') && byRole.has('preparation')) {
    byRole.set('bride_preparation', byRole.get('preparation')!)
  }
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
      label: studio.studioName,
      placeId: studio.placeId,
      latitude: studio.latitude,
      longitude: studio.longitude,
      kind: 'studio',
      role: 'studio',
      navigateLabel: ROLE_NAV_LABELS.studio,
      isSet: true,
      markerIndex: stops.length + 1,
    })
  }

  for (const role of STOP_ROLES) {
    const place = byRole.get(role)
    if (!place || !isPlaceVerified(place)) continue
    stops.push({
      key: place.id,
      title: ROLE_TITLES[role] ?? role,
      address: place.formattedAddress,
      label: place.label,
      placeId: place.placeId,
      latitude: place.latitude,
      longitude: place.longitude,
      kind: 'wedding_place',
      role,
      navigateLabel: ROLE_NAV_LABELS[role] ?? `Nawiguj do: ${ROLE_TITLES[role] ?? role}`,
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
  const rounded = Math.round(km * 10) / 10
  if (Number.isInteger(rounded)) return `${rounded} km`
  return `${rounded.toFixed(1).replace('.', ',')} km`
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

/** @deprecated Prefer per-stop buildGoogleMapsNavigationUrl / navigateToStopUrl. */
export function openFullRouteUrl(stops: TravelStop[]): string | null {
  return googleMapsDirectionsUrl(
    stops.map((s) => ({
      placeId: s.placeId,
      latitude: s.latitude,
      longitude: s.longitude,
      address: s.address,
      formattedAddress: s.address,
    })),
  )
}

/** Direct navigation URL for one travel stop (current position → destination). */
export function navigateToStopUrl(stop: TravelStop): string | null {
  return buildGoogleMapsNavigationUrl({
    formattedAddress: stop.address,
    label: stop.label ?? stop.title,
    placeId: stop.placeId,
    latitude: stop.latitude,
    longitude: stop.longitude,
  })
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
