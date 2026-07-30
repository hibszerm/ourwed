/**
 * Canonical Wedding Day route stop ordering and adjacency.
 * Explicit operational order is the source of truth — not hard-coded bride/groom assumptions.
 */

import { weddingPlaceRouteLabel } from '@/features/travel/weddingLocationModel'
import type {
  StudioTravelSettings,
  TravelEndpointKind,
  WeddingPlace,
  WeddingPlaceRole,
} from '@/types/travel'

/** Operational day-route order (groom prep before bride — Plan dnia / product default). */
export const CANONICAL_ROUTE_ROLE_ORDER: ReadonlyArray<
  'studio' | WeddingPlaceRole
> = [
  'studio',
  'groom_preparation',
  'bride_preparation',
  'ceremony',
  'reception',
  'hotel',
  'airport',
  'other',
]

/** Sort orders written on upsert — lower = earlier on the route. */
export const ROUTE_ROLE_SORT: Record<WeddingPlaceRole, number> = {
  groom_preparation: 10,
  bride_preparation: 15,
  /** @deprecated Legacy — treated like bride preparation. */
  preparation: 15,
  ceremony: 20,
  reception: 30,
  hotel: 40,
  airport: 50,
  other: 100,
}

export type WeddingDayRouteStop = {
  /** Stable stop id: `studio` or wedding_place.id */
  id: string
  kind: TravelEndpointKind
  role: 'studio' | WeddingPlaceRole
  title: string
  place: WeddingPlace | null
  latitude: number
  longitude: number
  order: number
  routeEligible: true
}

export type WeddingDayRoutePair = {
  sequence: number
  from: WeddingDayRouteStop
  to: WeddingDayRouteStop
  /** Directional identity: `${fromId}::${toId}` */
  pairKey: string
  endpointsHash: string
}

function isValidLatLng(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

export function endpointFingerprint(
  kind: TravelEndpointKind,
  place: WeddingPlace | null,
  studio: StudioTravelSettings | null,
): string {
  if (kind === 'studio') {
    return [
      'studio',
      studio?.placeId ?? '',
      studio?.latitude ?? '',
      studio?.longitude ?? '',
    ].join(':')
  }
  return [
    'place',
    place?.id ?? '',
    place?.placeId ?? '',
    place?.latitude ?? '',
    place?.longitude ?? '',
  ].join(':')
}

export function routePairKey(fromId: string, toId: string): string {
  return `${fromId}::${toId}`
}

function studioStop(
  studio: StudioTravelSettings | null,
): WeddingDayRouteStop | null {
  if (!studio || !isValidLatLng(studio.latitude, studio.longitude)) return null
  return {
    id: 'studio',
    kind: 'studio',
    role: 'studio',
    title: studio.studioName || studio.formattedAddress || 'Baza firmy',
    place: null,
    latitude: studio.latitude!,
    longitude: studio.longitude!,
    order: 0,
    routeEligible: true,
  }
}

function placeStop(
  place: WeddingPlace,
  order: number,
): WeddingDayRouteStop | null {
  if (!isValidLatLng(place.latitude, place.longitude)) return null
  const role = place.role === 'preparation' ? 'bride_preparation' : place.role
  return {
    id: place.id,
    kind: 'wedding_place',
    role,
    title: weddingPlaceRouteLabel(
      place,
      place.label || place.formattedAddress,
    ),
    place,
    latitude: place.latitude!,
    longitude: place.longitude!,
    order,
    routeEligible: true,
  }
}

/**
 * Build ordered route-eligible stops.
 *
 * Uses CANONICAL_ROUTE_ROLE_ORDER as the operational source of truth.
 * When places carry a custom sequential sortOrder (future drag-reorder),
 * that order wins for wedding places after studio.
 */
export function buildOrderedWeddingDayRouteStops(input: {
  studio: StudioTravelSettings | null
  places: WeddingPlace[]
}): WeddingDayRouteStop[] {
  const { studio, places } = input
  const stops: WeddingDayRouteStop[] = []

  const start = studioStop(studio)
  if (start) stops.push(start)

  const byRole = new Map<string, WeddingPlace>()
  for (const place of places) {
    const role = place.role === 'preparation' ? 'bride_preparation' : place.role
    if (!byRole.has(role)) byRole.set(role, place)
  }

  const usesCustomOrder = placesHaveCustomSequentialOrder(places)

  let order = start ? 1 : 0
  if (usesCustomOrder) {
    const sorted = [...places].sort((a, b) => a.sortOrder - b.sortOrder)
    const seen = new Set<string>()
    for (const place of sorted) {
      const role = place.role === 'preparation' ? 'bride_preparation' : place.role
      if (seen.has(role)) continue
      seen.add(role)
      const stop = placeStop(place, order)
      if (!stop) continue
      stops.push(stop)
      order += 1
    }
    return stops
  }

  for (const key of CANONICAL_ROUTE_ROLE_ORDER) {
    if (key === 'studio') continue
    const place = byRole.get(key)
    if (!place) continue
    const stop = placeStop(place, order)
    if (!stop) continue
    stops.push(stop)
    order += 1
  }

  return stops
}

/**
 * Known role→sort catalogs (current + legacy bride-first). Matching any of these
 * means “use CANONICAL_ROUTE_ROLE_ORDER”, not DB sort as operational order.
 */
const ROLE_SORT_CATALOGS: ReadonlyArray<Partial<Record<WeddingPlaceRole, number>>> =
  [
    ROUTE_ROLE_SORT,
    {
      // Legacy engine ordered bride before groom.
      bride_preparation: 10,
      groom_preparation: 15,
      preparation: 10,
      ceremony: 20,
      reception: 30,
      hotel: 40,
      airport: 50,
      other: 100,
    },
  ]

/**
 * True when sortOrder values encode a deliberate sequence (unique ascending)
 * that differs from known role catalogs — ready for future manual reorder.
 */
function placesHaveCustomSequentialOrder(places: WeddingPlace[]): boolean {
  if (places.length < 2) return false
  const orders = places.map((p) => p.sortOrder)
  const unique = new Set(orders)
  if (unique.size !== places.length) return false
  const matchesCatalog = ROLE_SORT_CATALOGS.some((catalog) =>
    places.every((p) => p.sortOrder === (catalog[p.role] ?? 100)),
  )
  if (matchesCatalog) return false
  return true
}

export function buildAdjacentRoutePairs(
  stops: WeddingDayRouteStop[],
  studio: StudioTravelSettings | null,
): WeddingDayRoutePair[] {
  const pairs: WeddingDayRoutePair[] = []
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i]!
    const to = stops[i + 1]!
    pairs.push({
      sequence: i,
      from,
      to,
      pairKey: routePairKey(from.id, to.id),
      endpointsHash: [
        endpointFingerprint(from.kind, from.place, studio),
        endpointFingerprint(to.kind, to.place, studio),
      ].join('>'),
    })
  }
  return pairs
}

/** Fingerprint of the full ordered eligible stop list (order + coords). */
export function computeRouteInputFingerprint(
  stops: WeddingDayRouteStop[],
): string {
  return stops
    .map(
      (s) =>
        `${s.id}|${s.order}|${s.latitude.toFixed(5)}|${s.longitude.toFixed(5)}`,
    )
    .join(';')
}

export function segmentMatchesPair(
  segment: {
    originKind: TravelEndpointKind
    originWeddingPlaceId: string | null
    destinationKind: TravelEndpointKind
    destinationWeddingPlaceId: string | null
    endpointsHash?: string
  },
  pair: WeddingDayRoutePair,
): boolean {
  if (segment.endpointsHash && segment.endpointsHash === pair.endpointsHash) {
    return true
  }
  const originOk =
    segment.originKind === pair.from.kind &&
    (pair.from.kind === 'studio'
      ? true
      : segment.originWeddingPlaceId === pair.from.id)
  const destOk =
    segment.destinationKind === pair.to.kind &&
    (pair.to.kind === 'studio'
      ? true
      : segment.destinationWeddingPlaceId === pair.to.id)
  return originOk && destOk
}
