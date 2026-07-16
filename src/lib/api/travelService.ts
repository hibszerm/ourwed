import { studioTravelSettingsService } from '@/lib/api/studioTravelSettingsService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { supabase } from '@/lib/supabase'
import { nowIso, throwOnError, toNumber } from '@/lib/supabase/helpers'
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
  WeddingPlaceRole,
} from '@/types/travel'

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

interface EndpointRef {
  kind: TravelEndpointKind
  place: WeddingPlace | null
  label: string
  lat: number
  lng: number
}

interface PlannedLeg {
  sequence: number
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

/** Preferred stop order for the wedding day route. */
const STOP_ORDER: Array<'studio' | WeddingPlaceRole> = [
  'studio',
  'preparation',
  'ceremony',
  'reception',
]

const ROUTE_PROVIDER = 'geoapify'

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

function endpointFingerprint(
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

function studioEndpoint(
  studio: StudioTravelSettings | null,
): EndpointRef | null {
  if (!studioTravelSettingsService.hasCoordinates(studio)) return null
  return {
    kind: 'studio',
    place: null,
    label: studio!.studioName || studio!.formattedAddress || 'Studio',
    lat: studio!.latitude!,
    lng: studio!.longitude!,
  }
}

function placeEndpoint(place: WeddingPlace | undefined): EndpointRef | null {
  if (!place || !weddingPlaceService.hasCoordinates(place)) return null
  return {
    kind: 'wedding_place',
    place,
    label: place.label || place.formattedAddress,
    lat: place.latitude!,
    lng: place.longitude!,
  }
}

/**
 * Build consecutive legs across available stops (skip missing locations).
 * Example: Studio → Ceremony → Reception when Preparation is absent.
 */
function buildPlannedLegs(
  studio: StudioTravelSettings | null,
  places: WeddingPlace[],
): PlannedLeg[] {
  const byRole = new Map(places.map((p) => [p.role, p]))
  const resolve = (key: 'studio' | WeddingPlaceRole): EndpointRef | null =>
    key === 'studio' ? studioEndpoint(studio) : placeEndpoint(byRole.get(key))

  const chain: EndpointRef[] = []
  for (const key of STOP_ORDER) {
    const endpoint = resolve(key)
    if (endpoint) chain.push(endpoint)
  }

  const legs: PlannedLeg[] = []
  for (let i = 0; i < chain.length - 1; i++) {
    const from = chain[i]
    const to = chain[i + 1]
    legs.push({
      sequence: i,
      originKind: from.kind,
      originPlace: from.place,
      destinationKind: to.kind,
      destinationPlace: to.place,
      originLat: from.lat,
      originLng: from.lng,
      destLat: to.lat,
      destLng: to.lng,
      endpointsHash: [
        endpointFingerprint(from.kind, from.place, studio),
        endpointFingerprint(to.kind, to.place, studio),
      ].join('>'),
      labelFrom: from.label,
      labelTo: to.label,
    })
  }
  return legs
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
    cached.sequence === leg.sequence &&
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
  throwOnError(error)
  return ((data ?? []) as TravelSegmentRow[]).map(mapSegment)
}

/**
 * Persist planned legs: drop obsolete sequences, upsert by (wedding_id, sequence).
 */
async function syncSegments(
  weddingId: string,
  rows: SegmentWrite[],
): Promise<TravelSegment[]> {
  const keepSequences = rows.map((r) => r.sequence)

  if (keepSequences.length === 0) {
    const { error } = await supabase
      .from('travel_segments')
      .delete()
      .eq('wedding_id', weddingId)
    throwOnError(error)
    return []
  }

  const { error: delError } = await supabase
    .from('travel_segments')
    .delete()
    .eq('wedding_id', weddingId)
    .not('sequence', 'in', `(${keepSequences.join(',')})`)
  throwOnError(delError)

  const { data, error } = await supabase
    .from('travel_segments')
    .upsert(rows, { onConflict: 'wedding_id,sequence' })
    .select('*')
    .order('sequence', { ascending: true })
  throwOnError(error)
  return ((data ?? []) as TravelSegmentRow[]).map(mapSegment)
}

function allLegsCached(
  planned: PlannedLeg[],
  cachedBySequence: Map<number, TravelSegment>,
): boolean {
  if (planned.length === 0) return true
  return planned.every((leg) =>
    cachedLegReusable(leg, cachedBySequence.get(leg.sequence)),
  )
}

/**
 * Travel Planning service — routing provider + DB cache.
 * Consumers should only use TravelPlan; never call the provider directly.
 */
export const travelService = {
  /**
   * Load travel plan for a wedding.
   * Unchanged legs are reused from travel_segments; only dirty legs hit the provider.
   */
  async getPlan(
    weddingId: string,
    options?: { forceRefresh?: boolean; travelMode?: TravelMode },
  ): Promise<TravelPlan> {
    const travelMode = options?.travelMode ?? 'DRIVE'
    const forceRefresh = Boolean(options?.forceRefresh)

    const [studio, places, cached] = await Promise.all([
      studioTravelSettingsService.get(),
      weddingPlaceService.listByWeddingId(weddingId),
      listCachedSegments(weddingId),
    ])

    const planned = buildPlannedLegs(studio, places)
    const cachedBySequence = new Map(cached.map((s) => [s.sequence, s]))

    if (planned.length === 0) {
      if (cached.length > 0) {
        await syncSegments(weddingId, [])
      }
      return {
        weddingId,
        studio,
        places,
        segments: [],
        hasError: false,
        errorMessage: null,
      }
    }

    if (!forceRefresh && allLegsCached(planned, cachedBySequence)) {
      const segments = planned
        .map((leg) => cachedBySequence.get(leg.sequence)!)
        .filter(Boolean)
      // Drop any obsolete cached sequences still in DB
      if (cached.length !== segments.length) {
        await syncSegments(weddingId, segments.map(segmentToWrite))
      }
      return {
        weddingId,
        studio,
        places,
        segments,
        hasError: false,
        errorMessage: null,
      }
    }

    const rows: SegmentWrite[] = []
    let firstError: string | null = null

    for (const leg of planned) {
      const previous = cachedBySequence.get(leg.sequence)
      if (!forceRefresh && cachedLegReusable(leg, previous)) {
        rows.push(segmentToWrite(previous!))
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
        if (!firstError) firstError = message
        rows.push(
          errorWrite(
            weddingId,
            leg,
            travelMode,
            'Unable to calculate this route.',
          ),
        )
      }
    }

    let segments: TravelSegment[]
    try {
      segments = await syncSegments(weddingId, rows)
    } catch {
      segments = rows.map((row, index) =>
        mapSegment({
          ...row,
          id: cachedBySequence.get(row.sequence)?.id ?? `local-${index}`,
          created_at: nowIso(),
          updated_at: nowIso(),
        }),
      )
    }

    return {
      weddingId,
      studio,
      places,
      segments,
      hasError: segments.some((s) => s.status === 'error'),
      errorMessage: firstError,
    }
  },

  /**
   * Recalculate after location edits.
   * Default: only dirty legs (hash change). Pass forceRefresh to re-route all.
   */
  async recalculate(
    weddingId: string,
    options?: { forceRefresh?: boolean },
  ): Promise<TravelPlan> {
    return this.getPlan(weddingId, {
      forceRefresh: options?.forceRefresh ?? false,
    })
  },

  async invalidate(weddingId: string): Promise<void> {
    const { error } = await supabase
      .from('travel_segments')
      .delete()
      .eq('wedding_id', weddingId)
    throwOnError(error)
  },

  segmentLabel(
    segment: TravelSegment,
    places: WeddingPlace[],
    studio: StudioTravelSettings | null,
  ): { from: string; to: string } {
    const placeName = (id: string | null) => {
      if (!id) return '—'
      const place = places.find((p) => p.id === id)
      return place?.label || place?.formattedAddress || '—'
    }
    const studioName =
      studio?.studioName || studio?.formattedAddress || 'Studio'

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
