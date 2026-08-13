/**
 * Canonical Wedding Day route stop ordering and adjacency.
 * Explicit operational order is the source of truth — not hard-coded bride/groom assumptions.
 */

import { weddingPlaceRouteLabel } from '@/features/travel/weddingLocationModel'
import {
  assertRouteInputMatchesOperationalOrder,
  logOperationalOrder,
} from '@/features/wedding-day/operationalOrderDebug'
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

/**
 * Studio-committed operational order uses this base so values can never be
 * mistaken for ROLE_SORT / legacy catalogs (10/15/20/30).
 * Bride-first after reorder → 1000, 2000, 3000, 4000.
 */
export const OPERATIONAL_SORT_BASE = 1000
export const OPERATIONAL_SORT_STEP = 1000

export function operationalSortOrderAt(index: number): number {
  return OPERATIONAL_SORT_BASE + index * OPERATIONAL_SORT_STEP
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
 * Preserve an explicit id sequence (drag draft / committed reorder).
 * Does NOT re-sort by sort_order — array order is authoritative.
 */
export function orderPlacesByExplicitIds(
  places: WeddingPlace[],
  orderedIds: string[],
): WeddingPlace[] {
  const byId = new Map(places.map((p) => [p.id, p]))
  const out: WeddingPlace[] = []
  const seen = new Set<string>()
  for (const id of orderedIds) {
    const place = byId.get(id)
    if (!place || seen.has(id)) continue
    seen.add(id)
    out.push(place)
  }
  return out
}

/**
 * Build ordered route-eligible stops.
 *
 * Wedding places: `orderedPlaceIds` when provided (exact sequence), else
 * `getOperationalOrderedPlaces` (persisted sort_order / catalog fallback).
 * Studio is always first when present.
 */
export function buildOrderedWeddingDayRouteStops(input: {
  studio: StudioTravelSettings | null
  places: WeddingPlace[]
  /** When set, this id sequence wins over sort_order / catalog. */
  orderedPlaceIds?: string[]
}): WeddingDayRouteStop[] {
  const { studio, places, orderedPlaceIds } = input
  const stops: WeddingDayRouteStop[] = []

  const start = studioStop(studio)
  if (start) stops.push(start)

  const orderedPlaces = orderedPlaceIds?.length
    ? orderPlacesByExplicitIds(places, orderedPlaceIds)
    : getOperationalOrderedPlaces(places)

  let order = start ? 1 : 0
  for (const place of orderedPlaces) {
    const stop = placeStop(place, order)
    if (!stop) continue
    stops.push(stop)
    order += 1
  }

  logOperationalOrder({
    source: 'buildOrderedWeddingDayRouteStops',
    weddingId: places[0]?.weddingId ?? '',
    places: orderedPlaces,
    note: orderedPlaceIds?.length
      ? `explicit-ids stops=${stops.map((s) => s.id).join('>')}`
      : `stops=${stops.map((s) => s.id).join('>')}`,
  })
  assertRouteInputMatchesOperationalOrder({
    weddingId: places[0]?.weddingId ?? '',
    operationalPlaceIds: orderedPlaces.map((p) => p.id),
    routeStopIds: stops.map((s) => s.id),
  })

  return stops
}

/**
 * Sole place-order resolver for Plan dnia, travel, manual recalc, and Brief.
 * Studio is not included — callers prepend it when present.
 *
 * Alias: prefer this name at call sites; `orderWeddingDayPlaces` is the same fn.
 */
export function getOperationalOrderedPlaces(
  places: WeddingPlace[],
): WeddingPlace[] {
  return orderWeddingDayPlaces(places)
}

/**
 * Wedding places in operational day order (custom sort_order or role catalog).
 * Studio is not included — it is always first when present.
 */
export function orderWeddingDayPlaces(places: WeddingPlace[]): WeddingPlace[] {
  if (places.length === 0) return []

  if (placesHaveCustomSequentialOrder(places)) {
    const sorted = [...places].sort((a, b) => {
      const d = Number(a.sortOrder) - Number(b.sortOrder)
      if (d !== 0) return d
      return a.id.localeCompare(b.id)
    })
    const seen = new Set<string>()
    const out: WeddingPlace[] = []
    for (const place of sorted) {
      const role = place.role === 'preparation' ? 'bride_preparation' : place.role
      if (seen.has(role)) continue
      seen.add(role)
      out.push(place)
    }
    logOperationalOrder({
      source: 'orderWeddingDayPlaces',
      weddingId: places[0]?.weddingId ?? '',
      places: out,
      note: 'custom sort_order',
    })
    return out
  }

  const byRole = new Map<string, WeddingPlace>()
  for (const place of places) {
    const role = place.role === 'preparation' ? 'bride_preparation' : place.role
    if (!byRole.has(role)) byRole.set(role, place)
  }

  const out: WeddingPlace[] = []
  for (const key of CANONICAL_ROUTE_ROLE_ORDER) {
    if (key === 'studio') continue
    const place = byRole.get(key)
    if (place) out.push(place)
  }
  logOperationalOrder({
    source: 'orderWeddingDayPlaces',
    weddingId: places[0]?.weddingId ?? '',
    places: out,
    note: 'catalog role fallback',
  })
  return out
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
 * True when sortOrder values encode a deliberate operational sequence.
 *
 * - Any place in the OPERATIONAL_SORT_BASE range means a studio reorder was
 *   committed — always honor numeric sort_order (never snap back to roles).
 * - Unique sort orders that match a known role catalog → catalog defaults.
 * - Any other unique non-catalog sequence → sort_order is authoritative.
 */
export function placesHaveCustomSequentialOrder(places: WeddingPlace[]): boolean {
  if (places.length < 2) return false
  const orders = places.map((p) => Number(p.sortOrder))
  if (orders.some((n) => !Number.isFinite(n))) return false

  // Once reorder (or an operational insert) has written ≥1000, never revert
  // to groom→bride→ceremony→reception role reconstruction.
  if (orders.some((n) => n >= OPERATIONAL_SORT_BASE)) return true

  const unique = new Set(orders)
  if (unique.size !== places.length) return false

  const matchesCatalog = ROLE_SORT_CATALOGS.some((catalog) =>
    places.every((p) => Number(p.sortOrder) === (catalog[p.role] ?? 100)),
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
