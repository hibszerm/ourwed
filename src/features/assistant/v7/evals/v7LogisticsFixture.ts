/**
 * Deterministic V7 logistics fixtures — cached segments only (no provider).
 */

import {
  buildTravelFlow,
  summarizeTravelRoute,
} from '@/features/travel/travelUi'
import type {
  StudioTravelSettings,
  TravelSegment,
  WeddingPlace,
} from '@/types/travel'
import type { WeddingLogisticsSnapshot } from '../../v6/adapters/logisticsAuthority'

const WEDDING_ID = 'w-julia-adam'

function studioReady(): StudioTravelSettings {
  return {
    id: 'studio-1',
    userId: 'tenant-a',
    studioName: 'Studio OurWed',
    street: 'Testowa',
    buildingNumber: '1',
    postalCode: '00-001',
    city: 'Warszawa',
    country: 'PL',
    formattedAddress: 'ul. Testowa 1, Warszawa',
    latitude: 52.23,
    longitude: 21.01,
    placeId: 'studio-place',
    freeDistanceKm: 50,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function place(
  id: string,
  role: WeddingPlace['role'],
  label: string,
  address: string,
  lat: number,
  lng: number,
  sortOrder: number,
): WeddingPlace {
  return {
    id,
    weddingId: WEDDING_ID,
    role,
    label,
    placeId: `pid-${id}`,
    formattedAddress: address,
    latitude: lat,
    longitude: lng,
    sortOrder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

/** Canonical role order: groom → bride → ceremony → reception */
export const V7_LOGISTICS_PLACES: WeddingPlace[] = [
  place(
    'p-groom',
    'groom_preparation',
    'Przygotowania pan młody',
    'ul. Pan Młody 1, Kraków',
    50.06,
    19.94,
    1000,
  ),
  place(
    'p-bride',
    'bride_preparation',
    'Przygotowania panna młoda',
    'ul. Panna Młoda 2, Kraków',
    50.07,
    19.95,
    1001,
  ),
  place(
    'p-ceremony',
    'ceremony',
    'Kościół',
    'pl. Kościelny 1, Kraków',
    50.08,
    19.96,
    1002,
  ),
  place(
    'p-reception',
    'reception',
    'Sala',
    'ul. Weselna 10, Kraków',
    50.1,
    19.98,
    1003,
  ),
]

function seg(
  sequence: number,
  originKind: TravelSegment['originKind'],
  originId: string | null,
  destKind: TravelSegment['destinationKind'],
  destId: string | null,
  meters: number,
  seconds: number,
  distanceText: string,
  durationText: string,
  status: TravelSegment['status'] = 'ok',
): TravelSegment {
  return {
    id: `seg-${sequence}`,
    weddingId: WEDDING_ID,
    sequence,
    originKind,
    originWeddingPlaceId: originId,
    destinationKind: destKind,
    destinationWeddingPlaceId: destId,
    endpointsHash: `hash-${sequence}`,
    distanceMeters: status === 'ok' ? meters : null,
    distanceText: status === 'ok' ? distanceText : null,
    durationSeconds: status === 'ok' ? seconds : null,
    durationText: status === 'ok' ? durationText : null,
    travelMode: 'DRIVE',
    provider: 'google',
    status,
    errorMessage: status === 'ok' ? null : 'provider_error',
    calculatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

/** Complete operational route: studio → groom → bride → ceremony → reception */
export const V7_LOGISTICS_SEGMENTS_COMPLETE: TravelSegment[] = [
  seg(0, 'studio', null, 'wedding_place', 'p-groom', 12000, 1200, '12 km', '20 min'),
  seg(1, 'wedding_place', 'p-groom', 'wedding_place', 'p-bride', 3500, 480, '3,5 km', '8 min'),
  seg(2, 'wedding_place', 'p-bride', 'wedding_place', 'p-ceremony', 8000, 900, '8 km', '15 min'),
  seg(3, 'wedding_place', 'p-ceremony', 'wedding_place', 'p-reception', 15000, 1500, '15 km', '25 min'),
]

/** Incomplete: missing ceremony → reception */
export const V7_LOGISTICS_SEGMENTS_INCOMPLETE: TravelSegment[] = [
  V7_LOGISTICS_SEGMENTS_COMPLETE[0]!,
  V7_LOGISTICS_SEGMENTS_COMPLETE[1]!,
  V7_LOGISTICS_SEGMENTS_COMPLETE[2]!,
]

export function buildLogisticsSnapshot(input?: {
  segments?: TravelSegment[]
  places?: WeddingPlace[]
  studio?: StudioTravelSettings | null
}): WeddingLogisticsSnapshot {
  const studio = input?.studio === undefined ? studioReady() : input.studio
  const places = input?.places ?? V7_LOGISTICS_PLACES
  const segments = input?.segments ?? V7_LOGISTICS_SEGMENTS_COMPLETE
  const plan = {
    weddingId: WEDDING_ID,
    studio,
    places,
    segments,
    hasError: false,
    errorMessage: null,
    persistenceError: null,
    routeFingerprint: null,
    routeStale: false,
  }
  const flow = buildTravelFlow(plan, { places })
  const summary = summarizeTravelRoute(flow)
  return { flow, summary, places, studio, segments }
}
