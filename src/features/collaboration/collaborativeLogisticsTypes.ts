import type { StudioTravelSettings, TravelPlan, TravelSegment, WeddingPlace } from '@/types/travel'

export interface CollaborativeLogisticsProjection {
  wedding_id: string
  access_version: string
  logistics_level: 1 | 2
  route_contract_version: 1
  provider: 'google'
  travel_mode: 'DRIVE'
  wedding_route_input_version: string
  studio_origin_version: string
  topology_token: string
  route_stale: boolean
  places: WeddingPlace[]
  studio: Pick<StudioTravelSettings, 'studioName' | 'street' | 'buildingNumber' | 'postalCode' | 'city' | 'country' | 'formattedAddress' | 'latitude' | 'longitude' | 'placeId'> | null
  route_stops: Array<{ id: string; kind: 'studio' | 'wedding_place'; role: string; place_id: string | null; latitude: number | null; longitude: number | null; order: number }>
  route_topology: Array<{ sequence: number; origin_kind: string; origin_wedding_place_id: string | null; destination_kind: string; destination_wedding_place_id: string | null; endpoints_hash: string }>
  segments: TravelSegment[]
}

/**
 * Selects the single owner-parity row represented by a canonical Logistics
 * form slot. Canonical preparation wins over its legacy alias; historical
 * siblings are ordered by owner sort order and stable persisted identity.
 */
export function selectCanonicalLogisticsPlace(
  places: WeddingPlace[],
  role: WeddingPlace['role'],
): WeddingPlace | null {
  const matching = places.filter((place) => place.role === role
    || (role === 'bride_preparation' && place.role === 'preparation'))
  matching.sort((left, right) => {
    const leftLegacy = left.role === 'preparation' ? 1 : 0
    const rightLegacy = right.role === 'preparation' ? 1 : 0
    return leftLegacy - rightLegacy
      || left.sortOrder - right.sortOrder
      || left.createdAt.localeCompare(right.createdAt)
      || left.id.localeCompare(right.id)
  })
  return matching[0] ?? null
}

export function collaborativeProjectionToTravelPlan(value: CollaborativeLogisticsProjection): TravelPlan {
  const studio = value.studio ? {
    id: 'shared-owner-studio-origin', userId: 'owner', ...value.studio,
    createdAt: '', updatedAt: '',
  } : null
  return {
    weddingId: value.wedding_id,
    studio,
    places: value.places,
    segments: value.segments,
    hasError: value.segments.some((segment) => segment.status === 'error'),
    errorMessage: null,
    persistenceError: null,
    routeStale: value.route_stale,
  }
}
