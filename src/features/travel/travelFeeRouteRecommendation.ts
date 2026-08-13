/**
 * Commercial round-trip distance recommendation for travel fee.
 *
 * Operational day route remains studio → ordered wedding places (NO return).
 * Pricing recommendation wants studio → … → studio without mutating
 * wedding_places / travel_segments / Cockpit order.
 */

import {
  buildTravelFlow,
  summarizeTravelRoute,
  type TravelFlow,
} from '@/features/travel/travelUi'
import { travelProvider } from '@/services/travelProvider'
import type { TravelPlan } from '@/types/travel'
import {
  metersToDisplayKm,
  suggestTravelFeeFromFreeKm,
  type TravelFeeStatus,
} from '@/lib/utils/travelFeeCommercial'

export interface TravelFeeRoundTripRecommendation {
  /** Outbound operational totals are complete/current. */
  outboundComplete: boolean
  outboundMeters: number
  /** Return leg meters when successfully fetched; null if unavailable. */
  returnMeters: number | null
  /** outbound + return when both known; otherwise null. */
  roundTripMeters: number | null
  roundTripKm: number | null
  freeDistanceKm: number | null
  /** Suggestion only — never auto-applied. */
  suggestion: 'included' | 'manual' | null
  /** True when a Google Routes call is needed for the return leg. */
  needsReturnFetch: boolean
  lastPlaceId: string | null
  routeFingerprint: string | null
}

export function summarizeOutboundTravelFeeDistance(
  plan: TravelPlan,
  options?: {
    places?: TravelPlan['places']
    orderedPlaceIds?: string[]
  },
): {
  flow: TravelFlow
  outboundComplete: boolean
  outboundMeters: number
  lastPlaceId: string | null
  lastLat: number | null
  lastLng: number | null
  studioLat: number | null
  studioLng: number | null
  studioPlaceId: string | null
  routeFingerprint: string | null
} {
  const flow = buildTravelFlow(plan, options)
  const summary = summarizeTravelRoute(flow)
  const weddingStops = flow.stops.filter((s) => s.kind === 'wedding_place')
  const last = weddingStops[weddingStops.length - 1] ?? null
  return {
    flow,
    outboundComplete: summary.totalsComplete,
    outboundMeters: summary.totalsComplete ? summary.distanceMeters : 0,
    lastPlaceId: last?.key && last.key !== 'studio' ? last.key : null,
    lastLat: last?.latitude ?? null,
    lastLng: last?.longitude ?? null,
    studioLat: plan.studio?.latitude ?? null,
    studioLng: plan.studio?.longitude ?? null,
    studioPlaceId: plan.studio?.placeId ?? null,
    routeFingerprint: flow.routeFingerprint,
  }
}

/**
 * Fetch last place → studio return distance. Does NOT write travel_segments.
 * Returns null when coords missing or provider fails.
 */
export async function fetchTravelFeeReturnLegMeters(input: {
  lastLat: number
  lastLng: number
  lastPlaceId?: string | null
  lastAddress?: string | null
  studioLat: number
  studioLng: number
  studioPlaceId?: string | null
  studioAddress?: string | null
}): Promise<number | null> {
  try {
    const route = await travelProvider.getRoute(
      {
        lat: input.lastLat,
        lng: input.lastLng,
        placeId: input.lastPlaceId,
        address: input.lastAddress ?? undefined,
      },
      {
        lat: input.studioLat,
        lng: input.studioLng,
        placeId: input.studioPlaceId,
        address: input.studioAddress ?? undefined,
      },
    )
    if (
      route.distanceMeters == null ||
      !Number.isFinite(route.distanceMeters) ||
      route.distanceMeters < 0
    ) {
      return null
    }
    return route.distanceMeters
  } catch {
    return null
  }
}

export function buildTravelFeeRoundTripRecommendation(input: {
  outboundComplete: boolean
  outboundMeters: number
  returnMeters: number | null
  freeDistanceKm: number | null | undefined
  status: TravelFeeStatus
  routeFingerprint: string | null
  lastPlaceId: string | null
  canFetchReturn: boolean
}): TravelFeeRoundTripRecommendation {
  const roundTripMeters =
    input.outboundComplete &&
    input.returnMeters != null &&
    Number.isFinite(input.returnMeters)
      ? input.outboundMeters + input.returnMeters
      : null

  return {
    outboundComplete: input.outboundComplete,
    outboundMeters: input.outboundComplete ? input.outboundMeters : 0,
    returnMeters: input.returnMeters,
    roundTripMeters,
    roundTripKm:
      roundTripMeters != null ? metersToDisplayKm(roundTripMeters) : null,
    freeDistanceKm:
      input.freeDistanceKm != null && Number.isFinite(input.freeDistanceKm)
        ? input.freeDistanceKm
        : null,
    suggestion: suggestTravelFeeFromFreeKm({
      freeDistanceKm: input.freeDistanceKm,
      roundTripDistanceMeters: roundTripMeters,
      status: input.status,
    }),
    needsReturnFetch:
      input.outboundComplete &&
      input.returnMeters == null &&
      input.canFetchReturn,
    lastPlaceId: input.lastPlaceId,
    routeFingerprint: input.routeFingerprint,
  }
}
