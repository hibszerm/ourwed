/**
 * Read-only wedding logistics authority for V7.
 *
 * Uses cached travel_segments + wedding places + studio settings.
 * NEVER calls travelService plan rebuild APIs that may mutate travel_segments.
 * Operational day route = studio → ordered places (NO return leg).
 */

import {
  buildTravelFlow,
  summarizeTravelRoute,
  type TravelFlow,
  type TravelFlowLeg,
} from '@/features/travel/travelUi'
import { studioTravelSettingsService } from '@/lib/api/studioTravelSettingsService'
import { travelService } from '@/lib/api/travelService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { metersToDisplayKm } from '@/lib/utils/travelFeeCommercial'
import type {
  StudioTravelSettings,
  TravelPlan,
  TravelSegment,
  WeddingPlace,
} from '@/types/travel'

export type LogisticsRouteSummary = ReturnType<typeof summarizeTravelRoute>

export type WeddingLogisticsSnapshot = {
  flow: TravelFlow
  summary: LogisticsRouteSummary
  places: WeddingPlace[]
  studio: StudioTravelSettings | null
  segments: TravelSegment[]
}

export type LogisticsLegObservation = {
  from_title: string
  to_title: string
  from_role: string | null
  to_role: string | null
  distance_text: string | null
  duration_text: string | null
  distance_meters: number | null
  duration_seconds: number | null
  ok: boolean
}

export type LogisticsLoadOptions = {
  loadPlaces?: (weddingId: string) => Promise<WeddingPlace[]>
  loadStudio?: () => Promise<StudioTravelSettings | null>
  loadCachedSegments?: (weddingId: string) => Promise<TravelSegment[]>
}

function syntheticPlan(
  weddingId: string,
  studio: StudioTravelSettings | null,
  places: WeddingPlace[],
  segments: TravelSegment[],
): TravelPlan {
  return {
    weddingId,
    studio,
    places,
    segments,
    hasError: false,
    errorMessage: null,
    persistenceError: null,
    routeFingerprint: null,
    // Cached segments only — never mark stale (would zero all legs).
    routeStale: false,
  }
}

export async function loadWeddingLogisticsReadOnly(
  weddingId: string,
  options: LogisticsLoadOptions = {},
): Promise<WeddingLogisticsSnapshot> {
  const [studio, places, segments] = await Promise.all([
    options.loadStudio
      ? options.loadStudio()
      : studioTravelSettingsService.get(),
    options.loadPlaces
      ? options.loadPlaces(weddingId)
      : weddingPlaceService.listByWeddingId(weddingId),
    options.loadCachedSegments
      ? options.loadCachedSegments(weddingId)
      : travelService.listCachedSegments(weddingId),
  ])
  const plan = syntheticPlan(weddingId, studio, places, segments)
  const flow = buildTravelFlow(plan, { places })
  const summary = summarizeTravelRoute(flow)
  return { flow, summary, places, studio, segments }
}

export function legObservation(leg: TravelFlowLeg): LogisticsLegObservation {
  const segment = leg.segment
  const ok =
    segment?.status === 'ok' &&
    (segment.distanceMeters != null ||
      Boolean(segment.distanceText) ||
      Boolean(segment.durationText))
  return {
    from_title: leg.origin.title,
    to_title: leg.destination.title,
    from_role: leg.origin.role ?? null,
    to_role: leg.destination.role ?? null,
    distance_text: ok ? segment?.distanceText ?? null : null,
    duration_text: ok ? segment?.durationText ?? null : null,
    distance_meters: ok ? segment?.distanceMeters ?? null : null,
    duration_seconds: ok ? segment?.durationSeconds ?? null : null,
    ok: Boolean(ok),
  }
}

export function longestOkLeg(
  flow: TravelFlow,
): LogisticsLegObservation | null {
  let best: TravelFlowLeg | null = null
  let bestMeters = -1
  for (const leg of flow.routeLegs) {
    const meters = leg.segment?.status === 'ok' ? leg.segment.distanceMeters : null
    if (meters == null || !Number.isFinite(meters)) continue
    if (meters > bestMeters) {
      bestMeters = meters
      best = leg
    }
  }
  return best ? legObservation(best) : null
}

/** Distance/duration only when every adjacent operational leg is ok (UI totalsComplete). */
export function completeRouteTotalsKmMin(summary: LogisticsRouteSummary): {
  distanceKm: number | null
  durationMinutes: number | null
  distanceText: string | null
  durationText: string | null
} {
  if (!summary.totalsComplete) {
    return {
      distanceKm: null,
      durationMinutes: null,
      distanceText: null,
      durationText: null,
    }
  }
  return {
    distanceKm: metersToDisplayKm(summary.distanceMeters),
    durationMinutes: Math.round(summary.durationSeconds / 60),
    distanceText: summary.distanceText,
    durationText: summary.durationText,
  }
}
