/**
 * Travel Planning types — studio origin, wedding places, cached route segments.
 */

export type WeddingPlaceRole =
  | 'preparation'
  | 'ceremony'
  | 'reception'
  | 'hotel'
  | 'airport'
  | 'other'

export type TravelEndpointKind = 'studio' | 'wedding_place'

export type TravelMode = 'DRIVE' | 'WALK' | 'BICYCLE' | 'TRANSIT'

export type TravelSegmentStatus = 'ok' | 'error' | 'stale'

/** Resolved place payload used across settings + wedding locations. */
export interface GeoPlace {
  placeId: string | null
  formattedAddress: string
  latitude: number | null
  longitude: number | null
  label?: string | null
}

export interface StudioTravelSettings {
  id: string
  userId: string
  studioName: string | null
  street: string | null
  buildingNumber: string | null
  postalCode: string | null
  city: string | null
  country: string
  formattedAddress: string | null
  latitude: number | null
  longitude: number | null
  placeId: string | null
  createdAt: string
  updatedAt: string
}

export interface WeddingPlace {
  id: string
  weddingId: string
  role: WeddingPlaceRole
  label: string | null
  placeId: string | null
  formattedAddress: string
  latitude: number | null
  longitude: number | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface TravelSegment {
  id: string
  weddingId: string
  sequence: number
  originKind: TravelEndpointKind
  originWeddingPlaceId: string | null
  destinationKind: TravelEndpointKind
  destinationWeddingPlaceId: string | null
  endpointsHash: string
  distanceMeters: number | null
  distanceText: string | null
  durationSeconds: number | null
  durationText: string | null
  travelMode: TravelMode
  provider: string
  status: TravelSegmentStatus
  errorMessage: string | null
  calculatedAt: string | null
  createdAt: string
  updatedAt: string
}

/** Ordered travel plan for a wedding day (studio → places…). */
export interface TravelPlan {
  weddingId: string
  studio: StudioTravelSettings | null
  places: WeddingPlace[]
  segments: TravelSegment[]
  /** True when any segment failed or routing was unavailable. */
  hasError: boolean
  errorMessage: string | null
}
