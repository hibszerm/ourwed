/**
 * READ-ONLY route calculation for Assistant V3.
 * Uses travelProvider.getRoute + studioTravelSettings — never mutates travel fee state.
 */

import { studioTravelSettingsService } from '@/lib/api/studioTravelSettingsService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { metersToDisplayKm } from '@/lib/utils/travelFeeCommercial'
import { travelProvider } from '@/services/travelProvider'
import type { WeddingPlace } from '@/types/travel'
import type { AssistantRefStore } from '../orchestration/refs'

export type RouteOriginSpec =
  | { kind: 'studio_start' }
  | { kind: 'place_ref'; placeRef: string }

export type CalculateRouteInput = {
  origin: RouteOriginSpec
  destinationRef?: string | null
  destinationPlaceId?: string | null
  weddingId?: string | null
  destinationRole?:
    | 'bride_preparation'
    | 'groom_preparation'
    | 'ceremony'
    | 'reception'
    | null
}

export type CalculateRouteResult =
  | {
      ok: true
      distanceKm: number
      durationMinutes: number
      routeComplete: true
      provenance: ['calculate_route']
    }
  | {
      ok: false
      routeComplete: false
      reason:
        | 'missing_studio_start'
        | 'missing_destination'
        | 'missing_coordinates'
        | 'route_failed'
        | 'invalid_ref'
      message: string
      provenance: ['calculate_route']
    }

type LatLng = {
  lat: number
  lng: number
  placeId?: string | null
  address?: string
}

function placeCoords(place: WeddingPlace): LatLng | null {
  if (
    place.latitude == null ||
    place.longitude == null ||
    !Number.isFinite(place.latitude) ||
    !Number.isFinite(place.longitude)
  ) {
    return null
  }
  return {
    lat: place.latitude,
    lng: place.longitude,
    placeId: place.placeId,
    address: place.formattedAddress || '',
  }
}

async function resolveDestinationPlace(
  input: CalculateRouteInput,
  refs: AssistantRefStore | null,
): Promise<WeddingPlace | null> {
  if (input.destinationRef && refs) {
    const entry = refs.resolve(input.destinationRef)
    if (!entry || entry.kind !== 'place') return null
    const weddingId =
      (typeof entry.meta?.weddingId === 'string' && entry.meta.weddingId) ||
      input.weddingId
    if (!weddingId) return null
    const list = await weddingPlaceService.listByWeddingId(weddingId)
    return list.find((p) => p.id === entry.entityId) ?? null
  }
  if (input.destinationPlaceId && input.weddingId) {
    const list = await weddingPlaceService.listByWeddingId(input.weddingId)
    return list.find((p) => p.id === input.destinationPlaceId) ?? null
  }
  if (input.weddingId && input.destinationRole) {
    const list = await weddingPlaceService.listByWeddingId(input.weddingId)
    if (input.destinationRole === 'bride_preparation') {
      return (
        list.find((p) => p.role === 'bride_preparation') ??
        list.find((p) => p.role === 'preparation') ??
        null
      )
    }
    return list.find((p) => p.role === input.destinationRole) ?? null
  }
  return null
}

async function resolveOriginLatLng(
  origin: RouteOriginSpec,
  refs: AssistantRefStore | null,
  weddingId: string | null | undefined,
): Promise<
  | { ok: true; latLng: LatLng }
  | { ok: false; result: CalculateRouteResult }
> {
  if (origin.kind === 'studio_start') {
    const studio = await studioTravelSettingsService.get()
    if (
      !studio ||
      studio.latitude == null ||
      studio.longitude == null ||
      !Number.isFinite(studio.latitude) ||
      !Number.isFinite(studio.longitude)
    ) {
      return {
        ok: false,
        result: {
          ok: false,
          routeComplete: false,
          reason: 'missing_studio_start',
          message:
            'Znam cel, ale nie mogę policzyć trasy — brakuje potwierdzonego punktu startowego studia.',
          provenance: ['calculate_route'],
        },
      }
    }
    return {
      ok: true,
      latLng: {
        lat: studio.latitude,
        lng: studio.longitude,
        placeId: studio.placeId,
        address: studio.formattedAddress ?? undefined,
      },
    }
  }

  const entry = refs?.resolve(origin.placeRef)
  if (!entry || entry.kind !== 'place') {
    return {
      ok: false,
      result: {
        ok: false,
        routeComplete: false,
        reason: 'invalid_ref',
        message:
          'Nie mogę policzyć trasy — niepoprawne odniesienie do miejsca.',
        provenance: ['calculate_route'],
      },
    }
  }
  const wid =
    (typeof entry.meta?.weddingId === 'string' && entry.meta.weddingId) ||
    weddingId
  if (!wid) {
    return {
      ok: false,
      result: {
        ok: false,
        routeComplete: false,
        reason: 'invalid_ref',
        message: 'Nie mogę policzyć trasy — brak kontekstu zlecenia.',
        provenance: ['calculate_route'],
      },
    }
  }
  const list = await weddingPlaceService.listByWeddingId(wid)
  const place = list.find((p) => p.id === entry.entityId)
  const coords = place ? placeCoords(place) : null
  if (!coords) {
    return {
      ok: false,
      result: {
        ok: false,
        routeComplete: false,
        reason: 'missing_coordinates',
        message:
          'Nie mogę policzyć trasy — brak współrzędnych punktu startowego.',
        provenance: ['calculate_route'],
      },
    }
  }
  return { ok: true, latLng: coords }
}

export async function calculateAssistantRoute(
  input: CalculateRouteInput,
  refs: AssistantRefStore | null = null,
): Promise<CalculateRouteResult> {
  const originResolved = await resolveOriginLatLng(
    input.origin,
    refs,
    input.weddingId,
  )
  if (!originResolved.ok) return originResolved.result

  const destPlace = await resolveDestinationPlace(input, refs)
  if (!destPlace) {
    return {
      ok: false,
      routeComplete: false,
      reason: 'missing_destination',
      message:
        'Nie mam jeszcze wpisanego miejsca docelowego, więc nie policzę trasy.',
      provenance: ['calculate_route'],
    }
  }
  const destCoords = placeCoords(destPlace)
  if (!destCoords) {
    return {
      ok: false,
      routeComplete: false,
      reason: 'missing_coordinates',
      message:
        'Znam miejsce, ale nie mogę policzyć trasy — brakuje współrzędnych lokalizacji.',
      provenance: ['calculate_route'],
    }
  }

  try {
    const route = await travelProvider.getRoute(
      originResolved.latLng,
      destCoords,
    )
    return {
      ok: true,
      distanceKm: metersToDisplayKm(route.distanceMeters),
      durationMinutes: Math.round(route.durationSeconds / 60),
      routeComplete: true,
      provenance: ['calculate_route'],
    }
  } catch {
    return {
      ok: false,
      routeComplete: false,
      reason: 'route_failed',
      message:
        'Nie udało się teraz wyliczyć trasy. Spróbuj ponownie za chwilę.',
      provenance: ['calculate_route'],
    }
  }
}

export function formatRouteDistanceAnswer(input: {
  distanceKm: number
  durationMinutes?: number | null
  destinationLabel: string
  fromStudio?: boolean
}): string {
  const km = input.distanceKm.toLocaleString('pl-PL', {
    maximumFractionDigits: 1,
  })
  const from = input.fromStudio ? ' ze studia' : ''
  if (
    typeof input.durationMinutes === 'number' &&
    Number.isFinite(input.durationMinutes) &&
    input.durationMinutes > 0
  ) {
    return `Do ${input.destinationLabel} masz około ${km} km${from} (ok. ${input.durationMinutes} min).`
  }
  return `Do ${input.destinationLabel} masz około ${km} km${from}.`
}
