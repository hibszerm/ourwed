import { studioTravelSettingsService } from '@/lib/api/studioTravelSettingsService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { withDevPerf } from '@/lib/performance/devPerf'
import { weddingPlaceRouteLabel } from '@/features/travel/weddingLocationModel'
import {
  buildAdjacentRoutePairs,
  buildOrderedWeddingDayRouteStops,
  computeRouteInputFingerprint,
  type WeddingDayRoutePair,
} from '@/features/travel/weddingDayRouteStops'
import { logOperationalOrder } from '@/features/wedding-day/operationalOrderDebug'
import { supabase } from '@/lib/supabase'
import { nowIso, throwOnError, toNumber } from '@/lib/supabase/helpers'
import { TRAVEL_SEGMENTS_ON_CONFLICT } from '@/lib/travel/travelSegmentsIdentity'
import {
  TravelProviderError,
  travelProvider,
} from '@/services/travelProvider'
import type {
  StudioTravelSettings,
  TravelEndpointKind,
  TravelMode,
  TravelPlan,
  TravelSegment,
  TravelSegmentStatus,
  WeddingPlace,
} from '@/types/travel'

export { TRAVEL_SEGMENTS_ON_CONFLICT } from '@/lib/travel/travelSegmentsIdentity'
export {
  CANONICAL_ROUTE_ROLE_ORDER,
  buildOrderedWeddingDayRouteStops,
  computeRouteInputFingerprint,
} from '@/features/travel/weddingDayRouteStops'

interface TravelSegmentRow {
  id: string
  wedding_id: string
  sequence: number
  origin_kind: string
  origin_wedding_place_id: string | null
  destination_kind: string
  destination_wedding_place_id: string | null
  endpoints_hash: string
  distance_meters: number | string | null
  distance_text: string | null
  duration_seconds: number | string | null
  duration_text: string | null
  travel_mode: string
  provider: string
  status: string
  error_message: string | null
  calculated_at: string | null
  created_at: string
  updated_at: string
}

type SegmentWrite = Omit<TravelSegmentRow, 'id' | 'created_at' | 'updated_at'>

interface PlannedLeg {
  sequence: number
  pairKey: string
  originKind: TravelEndpointKind
  originPlace: WeddingPlace | null
  destinationKind: TravelEndpointKind
  destinationPlace: WeddingPlace | null
  originLat: number
  originLng: number
  destLat: number
  destLng: number
  endpointsHash: string
  labelFrom: string
  labelTo: string
}

/** In-flight revision per wedding — newer rebuilds win over stale async responses. */
const routeRevisionByWedding = new Map<string, number>()

function nextRouteRevision(weddingId: string): number {
  const next = (routeRevisionByWedding.get(weddingId) ?? 0) + 1
  routeRevisionByWedding.set(weddingId, next)
  return next
}

function isCurrentRevision(weddingId: string, revision: number): boolean {
  return routeRevisionByWedding.get(weddingId) === revision
}

const ROUTE_PROVIDER = 'google'

function mapSegment(row: TravelSegmentRow): TravelSegment {
  return {
    id: row.id,
    weddingId: row.wedding_id,
    sequence: row.sequence,
    originKind: row.origin_kind as TravelEndpointKind,
    originWeddingPlaceId: row.origin_wedding_place_id,
    destinationKind: row.destination_kind as TravelEndpointKind,
    destinationWeddingPlaceId: row.destination_wedding_place_id,
    endpointsHash: row.endpoints_hash,
    distanceMeters:
      row.distance_meters == null
        ? null
        : toNumber(row.distance_meters, Number.NaN) || null,
    distanceText: row.distance_text,
    durationSeconds:
      row.duration_seconds == null
        ? null
        : toNumber(row.duration_seconds, Number.NaN) || null,
    durationText: row.duration_text,
    travelMode: (row.travel_mode as TravelMode) || 'DRIVE',
    provider: row.provider,
    status: (row.status as TravelSegmentStatus) || 'ok',
    errorMessage: row.error_message,
    calculatedAt: row.calculated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function pairToPlannedLeg(pair: WeddingDayRoutePair): PlannedLeg {
  return {
    sequence: pair.sequence,
    pairKey: pair.pairKey,
    originKind: pair.from.kind,
    originPlace: pair.from.place,
    destinationKind: pair.to.kind,
    destinationPlace: pair.to.place,
    originLat: pair.from.latitude,
    originLng: pair.from.longitude,
    destLat: pair.to.latitude,
    destLng: pair.to.longitude,
    endpointsHash: pair.endpointsHash,
    labelFrom: pair.from.title,
    labelTo: pair.to.title,
  }
}

/**
 * Full sequential rebuild: N eligible stops → exactly N-1 adjacent directional legs.
 */
function buildPlannedLegs(
  studio: StudioTravelSettings | null,
  places: WeddingPlace[],
  orderedPlaceIds?: string[],
): { legs: PlannedLeg[]; fingerprint: string } {
  const stops = buildOrderedWeddingDayRouteStops({
    studio,
    places,
    orderedPlaceIds,
  })
  const pairs = buildAdjacentRoutePairs(stops, studio)
  return {
    legs: pairs.map(pairToPlannedLeg),
    fingerprint: computeRouteInputFingerprint(stops),
  }
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  const km = meters / 1000
  return `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`
}

function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h} godz. ${m} min` : `${h} godz.`
}

function cachedLegReusable(
  leg: PlannedLeg,
  cached: TravelSegment | undefined,
): boolean {
  return (
    cached != null &&
    cached.endpointsHash === leg.endpointsHash &&
    cached.status === 'ok' &&
    cached.distanceMeters != null &&
    cached.durationSeconds != null
  )
}

function segmentToWrite(segment: TravelSegment): SegmentWrite {
  return {
    wedding_id: segment.weddingId,
    sequence: segment.sequence,
    origin_kind: segment.originKind,
    origin_wedding_place_id: segment.originWeddingPlaceId,
    destination_kind: segment.destinationKind,
    destination_wedding_place_id: segment.destinationWeddingPlaceId,
    endpoints_hash: segment.endpointsHash,
    distance_meters: segment.distanceMeters,
    distance_text: segment.distanceText,
    duration_seconds: segment.durationSeconds,
    duration_text: segment.durationText,
    travel_mode: segment.travelMode,
    provider: segment.provider || ROUTE_PROVIDER,
    status: segment.status,
    error_message: segment.errorMessage,
    calculated_at: segment.calculatedAt,
  }
}

function okWrite(
  weddingId: string,
  leg: PlannedLeg,
  travelMode: TravelMode,
  distanceMeters: number,
  durationSeconds: number,
): SegmentWrite {
  return {
    wedding_id: weddingId,
    sequence: leg.sequence,
    origin_kind: leg.originKind,
    origin_wedding_place_id: leg.originPlace?.id ?? null,
    destination_kind: leg.destinationKind,
    destination_wedding_place_id: leg.destinationPlace?.id ?? null,
    endpoints_hash: leg.endpointsHash,
    distance_meters: distanceMeters,
    distance_text: formatDistance(distanceMeters),
    duration_seconds: durationSeconds,
    duration_text: formatDuration(durationSeconds),
    travel_mode: travelMode,
    provider: ROUTE_PROVIDER,
    status: 'ok',
    error_message: null,
    calculated_at: nowIso(),
  }
}

function errorWrite(
  weddingId: string,
  leg: PlannedLeg,
  travelMode: TravelMode,
  message: string,
): SegmentWrite {
  return {
    wedding_id: weddingId,
    sequence: leg.sequence,
    origin_kind: leg.originKind,
    origin_wedding_place_id: leg.originPlace?.id ?? null,
    destination_kind: leg.destinationKind,
    destination_wedding_place_id: leg.destinationPlace?.id ?? null,
    endpoints_hash: leg.endpointsHash,
    distance_meters: null,
    distance_text: null,
    duration_seconds: null,
    duration_text: null,
    travel_mode: travelMode,
    provider: ROUTE_PROVIDER,
    status: 'error',
    error_message: message,
    calculated_at: nowIso(),
  }
}

async function listCachedSegments(weddingId: string): Promise<TravelSegment[]> {
  const { data, error } = await supabase
    .from('travel_segments')
    .select('*')
    .eq('wedding_id', weddingId)
    .order('sequence', { ascending: true })
  if (error) {
    console.error('[travel_segments] list failed', {
      weddingId,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
    // Optional cache — never treat a 400 as "no segments" silently without logging.
    // Return empty so travel UI / unrelated flows can continue.
    return []
  }
  return ((data ?? []) as TravelSegmentRow[]).map(mapSegment)
}

/**
 * Persist planned legs: exact sync by (wedding_id, sequence).
 * Drops obsolete sequences for this wedding, then upserts current legs.
 * Requires unique index travel_segments_wedding_sequence_uidx.
 */
async function syncSegments(
  weddingId: string,
  rows: SegmentWrite[],
): Promise<TravelSegment[]> {
  // Exact sync: remove all prior legs for this wedding, then upsert the plan.
  // Safer than `.not('sequence', 'in', ...)` which can 400 on PostgREST filter syntax.
  // Scoped to this wedding_id only — never deletes another wedding's segments.
  const { error: delError } = await supabase
    .from('travel_segments')
    .delete()
    .eq('wedding_id', weddingId)
  if (delError) {
    console.error('[travel_segments] delete failed', {
      weddingId,
      message: delError.message,
      details: delError.details,
      hint: delError.hint,
      code: delError.code,
    })
    throwOnError(delError)
  }

  if (rows.length === 0) return []

  const { data, error } = await supabase
    .from('travel_segments')
    .upsert(rows, {
      onConflict: TRAVEL_SEGMENTS_ON_CONFLICT,
      ignoreDuplicates: false,
    })
    .select('*')
    .order('sequence', { ascending: true })
  if (error) {
    console.error('[travel_segments] upsert failed', {
      weddingId,
      rowCount: rows.length,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      sample: rows[0],
    })
    throwOnError(error)
  }
  return ((data ?? []) as TravelSegmentRow[]).map(mapSegment)
}

function segmentsFromWrites(
  rows: SegmentWrite[],
  cachedBySequence: Map<number, TravelSegment>,
): TravelSegment[] {
  return rows.map((row, index) =>
    mapSegment({
      ...row,
      id: cachedBySequence.get(row.sequence)?.id ?? `local-${index}`,
      created_at: nowIso(),
      updated_at: nowIso(),
    }),
  )
}

function persistenceFailureMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  return 'Nie udało się zapisać wyliczonej trasy.'
}

/**
 * Exact sync with soft-fail: route UI keeps in-memory segments when DB write fails.
 */
async function syncSegmentsOrLocal(
  weddingId: string,
  rows: SegmentWrite[],
  cachedBySequence: Map<number, TravelSegment>,
): Promise<{ segments: TravelSegment[]; persistenceError: string | null }> {
  try {
    const segments = await syncSegments(weddingId, rows)
    return { segments, persistenceError: null }
  } catch (err) {
    const persistenceError = persistenceFailureMessage(err)
    console.error('[travel_segments] persistence soft-fail', {
      weddingId,
      rowCount: rows.length,
      message: persistenceError,
    })
    return {
      segments: segmentsFromWrites(rows, cachedBySequence),
      persistenceError,
    }
  }
}

function allLegsCached(
  planned: PlannedLeg[],
  cachedByHash: Map<string, TravelSegment>,
): boolean {
  if (planned.length === 0) return true
  return planned.every((leg) =>
    cachedLegReusable(leg, cachedByHash.get(leg.endpointsHash)),
  )
}

/**
 * Travel Planning service — routing provider + DB cache.
 * Consumers should only use TravelPlan; never call the provider directly.
 */
export const travelService = {
  /**
   * Load travel plan for a wedding.
   * Full adjacent rebuild from ordered stops; reusable ok legs matched by endpointsHash.
   *
   * Pass `places` after a committed reorder so calculation cannot race a stale
   * listByWeddingId read — the provided array is the operational source of truth.
   */
  async getPlan(
    weddingId: string,
    options?: {
      forceRefresh?: boolean
      travelMode?: TravelMode
      /** Committed operational places (custom sort_order). */
      places?: WeddingPlace[]
      /** Exact place-id sequence; wins over sort_order when provided. */
      orderedPlaceIds?: string[]
    },
  ): Promise<TravelPlan> {
    const travelMode = options?.travelMode ?? 'DRIVE'
    const forceRefresh = Boolean(options?.forceRefresh)
    const revision = nextRouteRevision(weddingId)

    const [studio, listedPlaces, cached] = await Promise.all([
      studioTravelSettingsService.get(),
      options?.places
        ? Promise.resolve(options.places)
        : weddingPlaceService.listByWeddingId(weddingId),
      listCachedSegments(weddingId),
    ])
    const places = options?.places ?? listedPlaces
    const orderedPlaceIds =
      options?.orderedPlaceIds ??
      (options?.places ? options.places.map((p) => p.id) : undefined)
    logOperationalOrder({
      source: 'travelService.getPlan',
      weddingId,
      places,
      note: options?.places
        ? `explicit-places forceRefresh=${forceRefresh}`
        : `listed-places forceRefresh=${forceRefresh}`,
      extra: { orderedPlaceIds },
    })

    if (!isCurrentRevision(weddingId, revision)) {
      return {
        weddingId,
        studio,
        places,
        segments: [],
        hasError: false,
        errorMessage: null,
        persistenceError: null,
        routeFingerprint: null,
        routeStale: true,
      }
    }

    const { legs: planned, fingerprint } = buildPlannedLegs(
      studio,
      places,
      orderedPlaceIds,
    )
    const cachedBySequence = new Map(cached.map((s) => [s.sequence, s]))
    const cachedByHash = new Map(
      cached.filter((s) => s.endpointsHash).map((s) => [s.endpointsHash, s]),
    )

    if (planned.length === 0) {
      let persistenceError: string | null = null
      if (cached.length > 0) {
        ;({ persistenceError } = await syncSegmentsOrLocal(
          weddingId,
          [],
          cachedBySequence,
        ))
      }
      if (!isCurrentRevision(weddingId, revision)) {
        return {
          weddingId,
          studio,
          places,
          segments: [],
          hasError: false,
          errorMessage: null,
          persistenceError: null,
          routeFingerprint: fingerprint,
          routeStale: true,
        }
      }
      return {
        weddingId,
        studio,
        places,
        segments: [],
        hasError: false,
        errorMessage: null,
        persistenceError,
        routeFingerprint: fingerprint,
        routeStale: false,
      }
    }

    if (!forceRefresh && allLegsCached(planned, cachedByHash)) {
      const segments = planned
        .map((leg) => cachedByHash.get(leg.endpointsHash)!)
        .filter(Boolean)
        .map((seg, index) => ({ ...seg, sequence: index }))
      let persistenceError: string | null = null
      if (
        cached.length !== segments.length ||
        segments.some((s, i) => s.sequence !== planned[i]?.sequence)
      ) {
        ;({ persistenceError } = await syncSegmentsOrLocal(
          weddingId,
          segments.map((s, i) =>
            segmentToWrite({ ...s, sequence: planned[i]!.sequence }),
          ),
          cachedBySequence,
        ))
      }
      if (!isCurrentRevision(weddingId, revision)) {
        return {
          weddingId,
          studio,
          places,
          segments,
          hasError: false,
          errorMessage: null,
          persistenceError: null,
          routeFingerprint: fingerprint,
          routeStale: true,
        }
      }
      return {
        weddingId,
        studio,
        places,
        segments,
        hasError: false,
        errorMessage: null,
        persistenceError,
        routeFingerprint: fingerprint,
        routeStale: false,
      }
    }

    const rows: SegmentWrite[] = []
    let firstError: string | null = null

    for (const leg of planned) {
      if (!isCurrentRevision(weddingId, revision)) {
        return {
          weddingId,
          studio,
          places,
          segments: [],
          hasError: false,
          errorMessage: null,
          persistenceError: null,
          routeFingerprint: fingerprint,
          routeStale: true,
        }
      }

      const previous = cachedByHash.get(leg.endpointsHash)
      if (!forceRefresh && cachedLegReusable(leg, previous)) {
        rows.push(
          segmentToWrite({
            ...previous!,
            sequence: leg.sequence,
          }),
        )
        continue
      }

      try {
        const result = await travelProvider.getRoute(
          { lat: leg.originLat, lng: leg.originLng },
          { lat: leg.destLat, lng: leg.destLng },
        )
        rows.push(
          okWrite(
            weddingId,
            leg,
            travelMode,
            result.distanceMeters,
            result.durationSeconds,
          ),
        )
      } catch (err) {
        const message =
          err instanceof TravelProviderError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Nie udało się wyliczyć trasy.'
        console.warn('[travel] segment calculation failed', {
          weddingId,
          routeFingerprint: fingerprint,
          pairKey: leg.pairKey,
          from: leg.labelFrom,
          to: leg.labelTo,
          category:
            err instanceof TravelProviderError ? err.name : 'unknown',
          message,
        })
        if (!firstError) firstError = message
        rows.push(
          errorWrite(
            weddingId,
            leg,
            travelMode,
            'Nie udało się obliczyć tego odcinka',
          ),
        )
      }
    }

    if (!isCurrentRevision(weddingId, revision)) {
      return {
        weddingId,
        studio,
        places,
        segments: [],
        hasError: false,
        errorMessage: null,
        persistenceError: null,
        routeFingerprint: fingerprint,
        routeStale: true,
      }
    }

    const { segments, persistenceError } = await syncSegmentsOrLocal(
      weddingId,
      rows,
      cachedBySequence,
    )

    return {
      weddingId,
      studio,
      places,
      segments,
      hasError: segments.some((s) => s.status === 'error'),
      errorMessage: firstError,
      persistenceError,
      routeFingerprint: fingerprint,
      routeStale: false,
    }
  },

  /**
   * Recalculate after location edits or committed operational reorder.
   * Default: only dirty legs (hash change). Pass forceRefresh to re-route all.
   * Pass `places` after reorder so the new order is used even if a concurrent
   * list read would race.
   */
  async recalculate(
    weddingId: string,
    options?: {
      forceRefresh?: boolean
      places?: WeddingPlace[]
      orderedPlaceIds?: string[]
    },
  ): Promise<TravelPlan> {
    return withDevPerf('travelService.recalculate', async () => {
      logOperationalOrder({
        source: 'travelService.recalculate',
        weddingId,
        places: options?.places,
        note: `forceRefresh=${options?.forceRefresh ?? false}`,
        extra: { orderedPlaceIds: options?.orderedPlaceIds },
      })
      return this.getPlan(weddingId, {
        forceRefresh: options?.forceRefresh ?? false,
        places: options?.places,
        orderedPlaceIds: options?.orderedPlaceIds,
      })
    })
  },

  async invalidate(weddingId: string): Promise<void> {
    nextRouteRevision(weddingId)
    const { error } = await supabase
      .from('travel_segments')
      .delete()
      .eq('wedding_id', weddingId)
    throwOnError(error)
  },

  /**
   * Read-only cached segments — never recalculates or calls the route provider.
   * Safe for Brief / offline aggregates that must not trigger Google Routes.
   */
  async listCachedSegments(weddingId: string): Promise<TravelSegment[]> {
    return listCachedSegments(weddingId)
  },

  segmentLabel(
    segment: TravelSegment,
    places: WeddingPlace[],
    studio: StudioTravelSettings | null,
  ): { from: string; to: string } {
    const placeName = (id: string | null) => {
      if (!id) return '—'
      const place = places.find((p) => p.id === id)
      if (!place) return '—'
      return weddingPlaceRouteLabel(place, place.formattedAddress || '—')
    }
    const studioName =
      studio?.studioName?.trim() ||
      studio?.formattedAddress?.trim() ||
      'Baza firmy'

    return {
      from:
        segment.originKind === 'studio'
          ? studioName
          : placeName(segment.originWeddingPlaceId),
      to:
        segment.destinationKind === 'studio'
          ? studioName
          : placeName(segment.destinationWeddingPlaceId),
    }
  },
}
