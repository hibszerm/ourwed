import type {
  StudioTravelSettings,
  TravelPlan,
  TravelSegment,
} from '@/types/travel'
import { isPlaceVerified } from '@/features/travel/locationVerification'
import { weddingPlaceRouteLabel } from '@/features/travel/weddingLocationModel'
import {
  buildGoogleMapsNavigationUrl,
  googleMapsDirectionsUrl,
} from '@/services/googleMapsLinks'

export const TRAVEL_BASE_FALLBACK_NAME = 'Baza firmy'
export const TRAVEL_SETTINGS_PATH = '/ustawienia/podroz'

export type TravelBaseStatus = 'missing' | 'incomplete' | 'ready'

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
  /**
   * Map/list marker: travel base uses 0 ("Start"); wedding locations are 1…n.
   */
  markerIndex: number
}

/** One ordered hop in the day route (base and/or wedding locations). */
export interface TravelFlowLeg {
  origin: TravelFlowStop
  destination: TravelFlowStop
  segment: TravelSegment | null
  label: string
}

export interface TravelFlow {
  stops: TravelFlowStop[]
  /** Legs[i] sits between stops[i] and stops[i + 1]. */
  legs: Array<TravelSegment | null>
  /** Same legs with explicit origin/destination ownership. */
  routeLegs: TravelFlowLeg[]
  hasAnyLocation: boolean
  hasTravelBase: boolean
  baseStatus: TravelBaseStatus
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
  studio: 'Nawiguj do bazy firmy',
}

const STOP_ROLES = [
  'bride_preparation',
  'groom_preparation',
  'ceremony',
  'reception',
] as const

export function getTravelBaseDisplayName(
  studio: StudioTravelSettings | null | undefined,
): string {
  const name = studio?.studioName?.trim()
  return name || TRAVEL_BASE_FALLBACK_NAME
}

export function getTravelBaseAddress(
  studio: StudioTravelSettings | null | undefined,
): string {
  if (!studio) return ''
  return (
    studio.formattedAddress?.trim() ||
    [studio.street, studio.buildingNumber].filter(Boolean).join(' ').trim() ||
    [studio.postalCode, studio.city].filter(Boolean).join(' ').trim() ||
    ''
  )
}

export function getTravelBaseStatus(
  studio: StudioTravelSettings | null | undefined,
): TravelBaseStatus {
  if (!studio) return 'missing'
  const hasCoords =
    studio.latitude != null &&
    studio.longitude != null &&
    Number.isFinite(studio.latitude) &&
    Number.isFinite(studio.longitude)
  if (hasCoords) return 'ready'
  const hasAnyAddressSignal = Boolean(
    studio.formattedAddress?.trim() ||
      studio.street?.trim() ||
      studio.city?.trim() ||
      studio.postalCode?.trim() ||
      studio.studioName?.trim() ||
      studio.placeId?.trim(),
  )
  return hasAnyAddressSignal ? 'incomplete' : 'missing'
}

export function formatRouteLegLabel(fromTitle: string, toTitle: string): string {
  return `${fromTitle} → ${toTitle}`
}

/**
 * Build UI flow from plan — only verified stops (with coordinates), consecutive legs.
 * Matches travelService skip-ahead routing. Travel base is first when geocoded.
 */
export function buildTravelFlow(plan: TravelPlan): TravelFlow {
  const byRole = new Map(plan.places.map((p) => [p.role, p]))
  // Compat: legacy preparation place fills bride slot when bride_preparation absent.
  if (!byRole.has('bride_preparation') && byRole.has('preparation')) {
    byRole.set('bride_preparation', byRole.get('preparation')!)
  }
  const stops: TravelFlowStop[] = []
  const baseStatus = getTravelBaseStatus(plan.studio)

  const studio = plan.studio
  if (baseStatus === 'ready' && studio) {
    const title = getTravelBaseDisplayName(studio)
    stops.push({
      key: 'studio',
      title,
      address: getTravelBaseAddress(studio) || title,
      label: studio.studioName,
      placeId: studio.placeId,
      latitude: studio.latitude,
      longitude: studio.longitude,
      kind: 'studio',
      role: 'studio',
      navigateLabel: ROLE_NAV_LABELS.studio,
      isSet: true,
      markerIndex: 0,
    })
  }

  let weddingMarker = 1
  for (const role of STOP_ROLES) {
    const place = byRole.get(role)
    if (!place || !isPlaceVerified(place)) continue
    const roleTitle = ROLE_TITLES[role] ?? role
    stops.push({
      key: place.id,
      title: weddingPlaceRouteLabel(place, roleTitle),
      address: place.formattedAddress,
      label: place.label,
      placeId: place.placeId,
      latitude: place.latitude,
      longitude: place.longitude,
      kind: 'wedding_place',
      role,
      navigateLabel: ROLE_NAV_LABELS[role] ?? `Nawiguj do: ${roleTitle}`,
      isSet: true,
      markerIndex: weddingMarker++,
    })
  }

  const sortedSegments = [...plan.segments].sort(
    (a, b) => a.sequence - b.sequence,
  )
  const legs: Array<TravelSegment | null> = []
  const routeLegs: TravelFlowLeg[] = []
  for (let i = 0; i < Math.max(0, stops.length - 1); i++) {
    const segment = sortedSegments[i] ?? null
    legs.push(segment)
    const origin = stops[i]
    const destination = stops[i + 1]
    routeLegs.push({
      origin,
      destination,
      segment,
      label: formatRouteLegLabel(origin.title, destination.title),
    })
  }

  return {
    stops,
    legs,
    routeLegs,
    hasAnyLocation: stops.length > 0,
    hasTravelBase: stops.some((s) => s.kind === 'studio'),
    baseStatus,
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

/** Canonical day-route totals from one leg collection (UI + map + summary). */
export function summarizeTravelRoute(flow: TravelFlow): {
  okSegments: TravelSegment[]
  distanceMeters: number
  durationSeconds: number
  distanceText: string
  durationText: string
  includesBaseLeg: boolean
  /** True when base is ready and included — full daily route, not event-only. */
  isCompleteDayRoute: boolean
  distanceLabel: string
  durationLabel: string
} {
  const okSegments = flow.routeLegs
    .map((leg) => leg.segment)
    .filter(
      (s): s is TravelSegment =>
        s != null && s.status === 'ok' && s.distanceMeters != null,
    )
  const totals = sumTravelTotals(okSegments)
  const includesBaseLeg = flow.routeLegs.some(
    (leg) =>
      leg.origin.kind === 'studio' &&
      leg.segment?.status === 'ok' &&
      leg.segment.distanceMeters != null,
  )
  /** Base is on the route — totals represent the full day chain when present. */
  const isCompleteDayRoute = flow.hasTravelBase
  return {
    okSegments,
    ...totals,
    includesBaseLeg,
    isCompleteDayRoute,
    distanceLabel: isCompleteDayRoute
      ? 'Łączny dystans'
      : 'Trasa między lokalizacjami',
    durationLabel: isCompleteDayRoute
      ? 'Szacowany czas jazdy'
      : 'Czas jazdy między lokalizacjami',
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
