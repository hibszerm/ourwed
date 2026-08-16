/**
 * Attach cached road travel legs between consecutive Plan dnia stops.
 * Read-only: never calculates routes or calls providers.
 */

import { isPlaceVerified } from '@/features/travel/locationVerification'
import type { OperationalDayStop } from '@/features/wedding-day/operationalDayPlan'
import type {
  BriefTimelineItem,
  BriefTravelFromPrevious,
} from '@/features/wedding-brief/types'
import type { TravelSegment, WeddingPlace } from '@/types/travel'

/** Skip near-zero legs (same pin / trivial hop). */
const MIN_USEFUL_DISTANCE_METERS = 50

function sameVerifiedLocation(a: WeddingPlace, b: WeddingPlace): boolean {
  if (a.id === b.id) return true
  const aPid = a.placeId?.trim()
  const bPid = b.placeId?.trim()
  if (aPid && bPid && aPid === bPid) return true
  if (
    a.latitude != null &&
    a.longitude != null &&
    b.latitude != null &&
    b.longitude != null &&
    Number.isFinite(a.latitude) &&
    Number.isFinite(b.latitude) &&
    Math.abs(a.latitude - b.latitude) < 1e-5 &&
    Math.abs(a.longitude - b.longitude) < 1e-5
  ) {
    return true
  }
  return false
}

function findCachedWeddingPlaceLeg(
  segments: TravelSegment[],
  originPlaceId: string,
  destinationPlaceId: string,
): TravelSegment | null {
  return (
    segments.find(
      (s) =>
        s.originKind === 'wedding_place' &&
        s.destinationKind === 'wedding_place' &&
        s.originWeddingPlaceId === originPlaceId &&
        s.destinationWeddingPlaceId === destinationPlaceId &&
        s.status === 'ok',
    ) ?? null
  )
}

function toTravelFromPrevious(
  segment: TravelSegment,
): BriefTravelFromPrevious | undefined {
  if (segment.distanceMeters == null || segment.durationSeconds == null) {
    return undefined
  }
  if (
    !Number.isFinite(segment.distanceMeters) ||
    !Number.isFinite(segment.durationSeconds)
  ) {
    return undefined
  }
  if (segment.distanceMeters < MIN_USEFUL_DISTANCE_METERS) {
    return undefined
  }
  return {
    distanceMeters: segment.distanceMeters,
    durationSeconds: segment.durationSeconds,
  }
}

/**
 * Map operational wedding-place stops (+ optional cached segments) → Brief timeline.
 * Travel appears only when both consecutive stops are verified and a cached ok segment exists.
 */
export function buildBriefTimelineWithTravel(input: {
  stops: OperationalDayStop[]
  places: WeddingPlace[]
  segments?: TravelSegment[]
}): BriefTimelineItem[] {
  const weddingStops = input.stops.filter((s) => s.kind === 'wedding_place')
  const placeById = new Map(input.places.map((p) => [p.id, p]))
  const segments = input.segments ?? []

  return weddingStops.map((stop, index) => {
    const item: BriefTimelineItem = {
      time: stop.time || '',
      title: stop.title,
      placeName: stop.placeName,
      shortAddress: stop.address,
      untimed: !stop.time,
    }
    if (index === 0 || segments.length === 0) return item

    const prev = weddingStops[index - 1]!
    const prevPlace = placeById.get(prev.key)
    const currPlace = placeById.get(stop.key)
    if (!prevPlace || !currPlace) return item
    if (!isPlaceVerified(prevPlace) || !isPlaceVerified(currPlace)) return item
    if (sameVerifiedLocation(prevPlace, currPlace)) return item

    const segment = findCachedWeddingPlaceLeg(segments, prev.key, stop.key)
    if (!segment) return item
    const travel = toTravelFromPrevious(segment)
    if (!travel) return item
    return { ...item, travelFromPrevious: travel }
  })
}
