/**
 * Pure helpers for travel_segments identity + map/persistence isolation.
 * Mirrors migration 20260725250000_travel_segments_wedding_sequence_unique.sql
 */

/** Must match unique index travel_segments_wedding_sequence_uidx. */
export const TRAVEL_SEGMENTS_ON_CONFLICT = 'wedding_id,sequence' as const

export interface TravelSegmentDedupeCandidate {
  id: string
  wedding_id: string
  sequence: number
  distance_meters: number | null
  duration_seconds: number | null
  provider: string | null
  updated_at: string | null
  created_at: string | null
}

/** Sort key documentation — use compareTravelSegmentDedupe for ordering. */
export function travelSegmentDedupeHasRoute(
  row: TravelSegmentDedupeCandidate,
): boolean {
  return row.distance_meters != null && row.duration_seconds != null
}

export function compareTravelSegmentDedupe(
  a: TravelSegmentDedupeCandidate,
  b: TravelSegmentDedupeCandidate,
): number {
  const hasRouteA =
    a.distance_meters != null && a.duration_seconds != null ? 0 : 1
  const hasRouteB =
    b.distance_meters != null && b.duration_seconds != null ? 0 : 1
  if (hasRouteA !== hasRouteB) return hasRouteA - hasRouteB

  const providerA = (a.provider ?? '').toLowerCase() === 'google' ? 0 : 1
  const providerB = (b.provider ?? '').toLowerCase() === 'google' ? 0 : 1
  if (providerA !== providerB) return providerA - providerB

  const upd = (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
  if (upd !== 0) return upd
  const cre = (b.created_at ?? '').localeCompare(a.created_at ?? '')
  if (cre !== 0) return cre
  return a.id.localeCompare(b.id)
}

/**
 * Keep one row per (wedding_id, sequence). Deletes are the non-winners only.
 */
export function dedupeTravelSegmentsByWeddingSequence(
  rows: TravelSegmentDedupeCandidate[],
): { keep: TravelSegmentDedupeCandidate[]; dropIds: string[] } {
  const groups = new Map<string, TravelSegmentDedupeCandidate[]>()
  for (const row of rows) {
    const key = `${row.wedding_id}:${row.sequence}`
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  const keep: TravelSegmentDedupeCandidate[] = []
  const dropIds: string[] = []
  for (const list of groups.values()) {
    const sorted = [...list].sort(compareTravelSegmentDedupe)
    keep.push(sorted[0]!)
    for (const dup of sorted.slice(1)) dropIds.push(dup.id)
  }
  return { keep, dropIds }
}

/**
 * Map visibility: coordinates win over persistence / route-calc failures.
 * Google Maps JS load failure is handled inside TravelMap separately.
 */
export function shouldRenderTravelMap(options: {
  hasStopCoordinates: boolean
  persistenceFailed?: boolean
  routeCalculationFailed?: boolean
}): boolean {
  return options.hasStopCoordinates
}
