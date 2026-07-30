import {
  CANONICAL_ROUTE_ROLE_ORDER,
  segmentMatchesPair,
  buildAdjacentRoutePairs,
  buildOrderedWeddingDayRouteStops,
} from '@/features/travel/weddingDayRouteStops'
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
  /** Venue / place name when distinct from the postal address. */
  address: string
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
  /** Why metrics are missing, when segment is absent or failed. */
  failureReason: TravelLegFailureReason | null
}

export type TravelLegFailureReason =
  | 'pending'
  | 'missing_origin_coords'
  | 'missing_destination_coords'
  | 'provider_error'
  | 'stale'
  | 'unavailable'

export interface TravelFlow {
  stops: TravelFlowStop[]
  /** Legs[i] sits between stops[i] and stops[i + 1]. */
  legs: Array<TravelSegment | null>
  /** Same legs with explicit origin/destination ownership. */
  routeLegs: TravelFlowLeg[]
  hasAnyLocation: boolean
  hasTravelBase: boolean
  baseStatus: TravelBaseStatus
  routeFingerprint: string | null
  routeStale: boolean
  /** True when every adjacent pair has an ok segment. */
  routeComplete: boolean
}

const ROLE_TITLES: Record<string, string> = {
  bride_preparation: 'Przygotowania Panny Młodej',
  groom_preparation: 'Przygotowania Pana Młodego',
  /** Legacy display only — migrated rows normalize to bride_preparation. */
  preparation: 'Przygotowania — starszy zapis',
  ceremony: 'Ceremonia',
  reception: 'Przyjęcie weselne',
  hotel: 'Hotel',
  airport: 'Lotnisko',
  other: 'Inna lokalizacja',
}

const ROLE_NAV_LABELS: Record<string, string> = {
  bride_preparation: 'Nawiguj do przygotowań Panny Młodej',
  groom_preparation: 'Nawiguj do przygotowań Pana Młodego',
  preparation: 'Nawiguj do przygotowań (starszy zapis)',
  ceremony: 'Nawiguj do ceremonii',
  reception: 'Nawiguj na przyjęcie weselne',
  studio: 'Nawiguj do bazy firmy',
}

/** Wedding place roles in canonical route order (no studio). */
export const STOP_ROLES = CANONICAL_ROUTE_ROLE_ORDER.filter(
  (r): r is Exclude<(typeof CANONICAL_ROUTE_ROLE_ORDER)[number], 'studio'> =>
    r !== 'studio',
)

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

export function travelLegFailureMessage(
  reason: TravelLegFailureReason | null,
): string {
  switch (reason) {
    case 'missing_origin_coords':
      return 'Brak współrzędnych miejsca początkowego'
    case 'missing_destination_coords':
      return 'Brak współrzędnych miejsca docelowego'
    case 'provider_error':
      return 'Nie udało się obliczyć tego odcinka'
    case 'stale':
      return 'Trasa wymaga ponownego przeliczenia'
    case 'pending':
      return 'Trasa jest liczona…'
    case 'unavailable':
      return 'Trasa niedostępna'
    default:
      return '—'
  }
}

/**
 * Build UI flow from plan — ordered eligible stops, legs matched by endpoint identity.
 */
export function buildTravelFlow(plan: TravelPlan): TravelFlow {
  const ordered = buildOrderedWeddingDayRouteStops({
    studio: plan.studio,
    places: plan.places,
  })
  // Prefer verified (address + coords) for UI markers; keep engine-eligible if verified fails.
  const stops: TravelFlowStop[] = []
  const baseStatus = getTravelBaseStatus(plan.studio)

  for (const stop of ordered) {
    if (stop.kind === 'studio') {
      const studio = plan.studio!
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
      continue
    }
    const place = stop.place
    if (!place || !isPlaceVerified(place)) {
      // Engine used coords-only; still show when we have coords for map consistency.
      if (!place) continue
    }
    const role = stop.role
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
      markerIndex: stops.filter((s) => s.kind === 'wedding_place').length + 1,
    })
  }

  const pairs = buildAdjacentRoutePairs(ordered, plan.studio)
  const legs: Array<TravelSegment | null> = []
  const routeLegs: TravelFlowLeg[] = []

  for (let i = 0; i < Math.max(0, stops.length - 1); i++) {
    const origin = stops[i]!
    const destination = stops[i + 1]!
    const pair = pairs.find(
      (p) =>
        p.from.id === origin.key &&
        p.to.id === destination.key,
    )
    const segment =
      (pair
        ? plan.segments.find((s) => segmentMatchesPair(s, pair))
        : null) ??
      plan.segments.find(
        (s) =>
          (origin.kind === 'studio'
            ? s.originKind === 'studio'
            : s.originWeddingPlaceId === origin.key) &&
          (destination.kind === 'studio'
            ? s.destinationKind === 'studio'
            : s.destinationWeddingPlaceId === destination.key),
      ) ??
      null

    legs.push(segment)

    let failureReason: TravelLegFailureReason | null = null
    if (plan.routeStale) {
      failureReason = 'stale'
    } else if (!segment) {
      failureReason = 'unavailable'
    } else if (segment.status === 'error') {
      failureReason = 'provider_error'
    } else if (segment.status !== 'ok') {
      failureReason = 'pending'
    }

    routeLegs.push({
      origin,
      destination,
      segment,
      label: formatRouteLegLabel(origin.title, destination.title),
      failureReason:
        segment?.status === 'ok' &&
        (segment.durationText || segment.distanceText)
          ? null
          : failureReason,
    })
  }

  const routeComplete =
    !plan.routeStale &&
    routeLegs.length > 0 &&
    routeLegs.every(
      (leg) =>
        leg.segment?.status === 'ok' &&
        (leg.segment.durationText || leg.segment.distanceText),
    )

  return {
    stops,
    legs,
    routeLegs,
    hasAnyLocation: stops.length > 0,
    hasTravelBase: stops.some((s) => s.kind === 'studio'),
    baseStatus,
    routeFingerprint: plan.routeFingerprint ?? null,
    routeStale: Boolean(plan.routeStale),
    routeComplete,
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
  /** False when any required adjacent leg failed / is missing. */
  totalsComplete: boolean
} {
  const okSegments = flow.routeLegs
    .map((leg) => leg.segment)
    .filter(
      (s): s is TravelSegment =>
        s != null && s.status === 'ok' && s.distanceMeters != null,
    )
  const totalsComplete =
    flow.routeComplete &&
    flow.routeLegs.length > 0 &&
    okSegments.length === flow.routeLegs.length
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
    totalsComplete,
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
