import { CollaborativeReadError, collaborativeReadError } from '@/features/collaboration/collaborativeReadError'
import { supabase } from '@/lib/supabase'
import { travelProvider } from '@/services/travelProvider'
import { collaborativeProjectionToTravelPlan, type CollaborativeLogisticsProjection } from './collaborativeLogisticsTypes'
import type { TravelPlan, TravelSegment } from '@/types/travel'

const ROOT_KEYS = ['access_version','logistics_level','places','provider','route_contract_version','route_stale','route_stops','route_topology','segments','studio','studio_origin_version','topology_token','travel_mode','wedding_id','wedding_route_input_version']
const PLACE_KEYS = ['address_version','created_at','formatted_address','id','label','latitude','longitude','name_version','place_id','resolution_state','role','sort_order','updated_at']
const STUDIO_KEYS = ['building_number','city','country','formatted_address','latitude','longitude','place_id','postal_code','street','studio_name']
const SEGMENT_KEYS = ['calculated_at','created_at','destination_kind','destination_wedding_place_id','distance_meters','distance_text','duration_seconds','duration_text','endpoints_hash','error_message','id','origin_kind','origin_wedding_place_id','provider','sequence','status','travel_mode','updated_at','wedding_id']
const STOP_KEYS = ['id','kind','latitude','longitude','order','place_id','role']
const TOPOLOGY_KEYS = ['destination_kind','destination_wedding_place_id','endpoints_hash','origin_kind','origin_wedding_place_id','sequence']

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CollaborativeReadError('UNKNOWN')
  const row = value as Record<string, unknown>
  const actual = Object.keys(row).sort()
  if (actual.length !== keys.length || actual.some((key, i) => key !== keys[i])) throw new CollaborativeReadError('UNKNOWN')
  return row
}
function string(value: unknown): value is string
function string(value: unknown, nullable: true): value is string | null
function string(value: unknown, nullable = false): value is string | null { return typeof value === 'string' || (nullable && value === null) }
function number(value: unknown): value is number
function number(value: unknown, nullable: true): value is number | null
function number(value: unknown, nullable = false): value is number | null { return (typeof value === 'number' && Number.isFinite(value)) || (nullable && value === null) }
function generation(value: unknown): value is string { return typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) }

export function parseCollaborativeLogisticsProjection(input: unknown, weddingId: string): CollaborativeLogisticsProjection {
  const row = record(input, ROOT_KEYS)
  if (row.wedding_id !== weddingId || (row.logistics_level !== 1 && row.logistics_level !== 2)
    || (row.access_version !== 'owner' && !generation(row.access_version)) || row.route_contract_version !== 1 || row.provider !== 'google'
    || row.travel_mode !== 'DRIVE' || !generation(row.wedding_route_input_version)
    || !generation(row.studio_origin_version) || typeof row.topology_token !== 'string'
    || !/^[0-9a-f]{64}$/.test(row.topology_token) || typeof row.route_stale !== 'boolean'
    || !Array.isArray(row.places) || !Array.isArray(row.route_stops)
    || !Array.isArray(row.route_topology) || !Array.isArray(row.segments)) throw new CollaborativeReadError('UNKNOWN')
  const places = row.places.map((item) => {
    const p = record(item, PLACE_KEYS)
    if (!string(p.id) || !string(p.label, true) || !string(p.formatted_address) || !string(p.place_id, true)
      || !number(p.latitude, true) || !number(p.longitude, true) || !number(p.sort_order)
      || !string(p.created_at) || !string(p.updated_at) || !['bride_preparation','groom_preparation','ceremony','reception','preparation','hotel','airport','other'].includes(String(p.role))
      || !['empty','verified','needs_verification'].includes(String(p.resolution_state))
      || !generation(p.address_version) || !generation(p.name_version)) throw new CollaborativeReadError('UNKNOWN')
    return { id: p.id, weddingId, role: p.role as never, label: p.label, placeId: p.place_id, formattedAddress: p.formatted_address,
      latitude: p.latitude, longitude: p.longitude, sortOrder: p.sort_order, createdAt: p.created_at, updatedAt: p.updated_at,
      addressVersion: p.address_version, nameVersion: p.name_version }
  })
  let studio: CollaborativeLogisticsProjection['studio'] = null
  if (row.studio !== null) {
    const s = record(row.studio, STUDIO_KEYS)
    if (!string(s.studio_name, true) || !string(s.street, true) || !string(s.building_number, true)
      || !string(s.postal_code, true) || !string(s.city, true) || !string(s.country, true)
      || !string(s.formatted_address, true) || !number(s.latitude, true) || !number(s.longitude, true) || !string(s.place_id, true)) throw new CollaborativeReadError('UNKNOWN')
    studio = { studioName: s.studio_name, street: s.street, buildingNumber: s.building_number, postalCode: s.postal_code,
      city: s.city, country: s.country ?? 'Polska', formattedAddress: s.formatted_address, latitude: s.latitude,
      longitude: s.longitude, placeId: s.place_id }
  }
  const route_stops = row.route_stops.map((item) => {
    const s = record(item, STOP_KEYS)
    if (!string(s.id) || !['studio','wedding_place'].includes(String(s.kind)) || !string(s.role)
      || !string(s.place_id, true) || !number(s.latitude, true) || !number(s.longitude, true) || !number(s.order)) throw new CollaborativeReadError('UNKNOWN')
    return { id: s.id, kind: s.kind as 'studio'|'wedding_place', role: s.role, place_id: s.place_id,
      latitude: s.latitude, longitude: s.longitude, order: s.order }
  })
  const route_topology = row.route_topology.map((item) => {
    const t = record(item, TOPOLOGY_KEYS)
    if (!number(t.sequence) || !string(t.origin_kind) || !string(t.origin_wedding_place_id, true)
      || !string(t.destination_kind) || !string(t.destination_wedding_place_id, true) || !string(t.endpoints_hash)) throw new CollaborativeReadError('UNKNOWN')
    return { sequence: t.sequence, origin_kind: t.origin_kind, origin_wedding_place_id: t.origin_wedding_place_id,
      destination_kind: t.destination_kind, destination_wedding_place_id: t.destination_wedding_place_id, endpoints_hash: t.endpoints_hash }
  })
  const segments: TravelSegment[] = row.segments.map((item) => {
    const s = record(item, SEGMENT_KEYS)
    if (!string(s.id) || s.wedding_id !== weddingId || !number(s.sequence) || !string(s.origin_kind)
      || !string(s.origin_wedding_place_id, true) || !string(s.destination_kind) || !string(s.destination_wedding_place_id, true)
      || !string(s.endpoints_hash) || !number(s.distance_meters, true) || !string(s.distance_text, true)
      || !number(s.duration_seconds, true) || !string(s.duration_text, true) || !string(s.travel_mode)
      || !string(s.provider) || !['ok','error','stale'].includes(String(s.status)) || !string(s.error_message, true)
      || !string(s.calculated_at, true) || !string(s.created_at) || !string(s.updated_at)) throw new CollaborativeReadError('UNKNOWN')
    return { id: s.id, weddingId, sequence: s.sequence, originKind: s.origin_kind as TravelSegment['originKind'],
      originWeddingPlaceId: s.origin_wedding_place_id, destinationKind: s.destination_kind as TravelSegment['destinationKind'],
      destinationWeddingPlaceId: s.destination_wedding_place_id, endpointsHash: s.endpoints_hash,
      distanceMeters: s.distance_meters, distanceText: s.distance_text, durationSeconds: s.duration_seconds,
      durationText: s.duration_text, travelMode: s.travel_mode as TravelSegment['travelMode'], provider: s.provider,
      status: s.status as TravelSegment['status'], errorMessage: s.error_message, calculatedAt: s.calculated_at,
      createdAt: s.created_at, updatedAt: s.updated_at }
  })
  return { wedding_id: weddingId, access_version: row.access_version, logistics_level: row.logistics_level,
    route_contract_version: 1, provider: 'google', travel_mode: 'DRIVE', wedding_route_input_version: row.wedding_route_input_version,
    studio_origin_version: row.studio_origin_version, topology_token: row.topology_token, route_stale: row.route_stale,
    places, studio, route_stops, route_topology, segments }
}

function formatDistance(meters: number) { return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0).replace('.', ',')} km` }
function formatDuration(seconds: number) { const min = Math.round(seconds / 60); const h = Math.floor(min / 60); const rem = min % 60; return h ? `${h} godz. ${rem} min` : `${min} min` }

export const collaborativeLogisticsService = {
  async get(weddingId: string) {
    const { data, error } = await supabase.rpc('get_collaborative_wedding_logistics_v3', { p_wedding_id: weddingId })
    if (error) throw collaborativeReadError(error, true)
    return parseCollaborativeLogisticsProjection(data, weddingId)
  },
  async savePlace(weddingId: string, accessVersion: string, place: { id: string | null; role: string; label: string | null; address: string; placeId: string | null; latitude: number | null; longitude: number | null; addressVersion: string; nameVersion: string }) {
    const { data, error } = await supabase.rpc('mutate_collaborative_wedding_logistics_v3', {
      p_wedding_id: weddingId, p_expected_access_version: accessVersion, p_action: 'upsert_place',
      p_payload: { place_row_id: place.id, role: place.role, label: place.label, formatted_address: place.address,
        place_id: place.placeId, latitude: place.latitude, longitude: place.longitude,
        expected_address_version: place.addressVersion, expected_name_version: place.nameVersion },
    })
    if (error) throw collaborativeReadError(error, true)
    return data
  },
  async recalculate(weddingId: string, projection: CollaborativeLogisticsProjection): Promise<TravelPlan> {
    const stops = new Map(projection.route_stops.map((stop) => [stop.id, stop]))
    const segments = await Promise.all(projection.route_topology.map(async (leg): Promise<Record<string, unknown>> => {
      const origin = leg.origin_kind === 'studio' ? stops.get('studio') : stops.get(leg.origin_wedding_place_id ?? '')
      const destination = leg.destination_kind === 'studio' ? stops.get('studio') : stops.get(leg.destination_wedding_place_id ?? '')
      if (!origin || !destination || origin.latitude === null || origin.longitude === null || destination.latitude === null || destination.longitude === null) {
        throw new Error('ROUTE_TOPOLOGY_INVALID')
      }
      const base = { wedding_id: weddingId, sequence: leg.sequence, origin_kind: leg.origin_kind,
        origin_wedding_place_id: leg.origin_wedding_place_id, destination_kind: leg.destination_kind,
        destination_wedding_place_id: leg.destination_wedding_place_id, endpoints_hash: leg.endpoints_hash,
        travel_mode: 'DRIVE', provider: 'google', calculated_at: new Date().toISOString() }
      try {
        const route = await travelProvider.getRoute({ lat: origin.latitude, lng: origin.longitude, placeId: origin.place_id },
          { lat: destination.latitude, lng: destination.longitude, placeId: destination.place_id })
        return { ...base, distance_meters: Math.round(route.distanceMeters), distance_text: route.distanceLabel ?? formatDistance(route.distanceMeters),
          duration_seconds: Math.round(route.durationSeconds), duration_text: route.durationLabel ?? formatDuration(route.durationSeconds), status: 'ok', error_message: null }
      } catch {
        return { ...base, distance_meters: null, distance_text: null, duration_seconds: null, duration_text: null,
          status: 'error', error_message: 'Nie udało się obliczyć tego odcinka' }
      }
    }))
    const { error } = await supabase.rpc('mutate_collaborative_wedding_logistics_v3', {
      p_wedding_id: weddingId, p_expected_access_version: projection.access_version, p_action: 'replace_route_segments',
      p_payload: { route_contract_version: 1, expected_wedding_route_input_version: projection.wedding_route_input_version,
        expected_studio_origin_version: projection.studio_origin_version, provider: 'google', travel_mode: 'DRIVE',
        topology_token: projection.topology_token, segments },
    })
    if (error) throw collaborativeReadError(error, true)
    const refreshed = await this.get(weddingId)
    return { ...collaborativeProjectionToTravelPlan(refreshed), hasError: refreshed.segments.some((segment) => segment.status === 'error') }
  },
}
