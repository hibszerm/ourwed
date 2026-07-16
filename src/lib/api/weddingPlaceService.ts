import { supabase } from '@/lib/supabase'
import { nowIso, throwOnError, toNumber } from '@/lib/supabase/helpers'
import { travelProvider } from '@/services/travelProvider'
import type { GeoPlace, WeddingPlace, WeddingPlaceRole } from '@/types/travel'

interface WeddingPlaceRow {
  id: string
  wedding_id: string
  role: string
  label: string | null
  place_id: string | null
  formatted_address: string
  latitude: number | string | null
  longitude: number | string | null
  sort_order: number
  created_at: string
  updated_at: string
}

const CORE_ROLES: WeddingPlaceRole[] = [
  'preparation',
  'ceremony',
  'reception',
]

const ROLE_SORT: Record<WeddingPlaceRole, number> = {
  preparation: 10,
  ceremony: 20,
  reception: 30,
  hotel: 40,
  airport: 50,
  other: 100,
}

function mapRow(row: WeddingPlaceRow): WeddingPlace {
  return {
    id: row.id,
    weddingId: row.wedding_id,
    role: row.role as WeddingPlaceRole,
    label: row.label,
    placeId: row.place_id,
    formattedAddress: row.formatted_address,
    latitude:
      row.latitude == null ? null : toNumber(row.latitude, Number.NaN) || null,
    longitude:
      row.longitude == null ? null : toNumber(row.longitude, Number.NaN) || null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface UpsertWeddingPlaceInput {
  weddingId: string
  role: WeddingPlaceRole
  /** Free-text fallback / previous value when place not selected. */
  addressText?: string | null
  place?: GeoPlace | null
  /** Resolve place via geocode when editing. */
  resolve?: boolean
}

function hasCoordinates(place: Pick<WeddingPlace, 'latitude' | 'longitude'>): boolean {
  return (
    place.latitude != null &&
    place.longitude != null &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude)
  )
}

export const weddingPlaceService = {
  async listByWeddingId(weddingId: string): Promise<WeddingPlace[]> {
    const { data, error } = await supabase
      .from('wedding_places')
      .select('*')
      .eq('wedding_id', weddingId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    throwOnError(error)
    return ((data ?? []) as WeddingPlaceRow[]).map(mapRow)
  },

  async getByRole(
    weddingId: string,
    role: WeddingPlaceRole,
  ): Promise<WeddingPlace | null> {
    const { data, error } = await supabase
      .from('wedding_places')
      .select('*')
      .eq('wedding_id', weddingId)
      .eq('role', role)
      .maybeSingle()
    throwOnError(error)
    return data ? mapRow(data as WeddingPlaceRow) : null
  },

  /**
   * Create/update a wedding place. Geocodes only on edit
   * (when resolve=true or coordinates are missing).
   */
  async upsert(input: UpsertWeddingPlaceInput): Promise<WeddingPlace | null> {
    let place = input.place ?? null
    const addressText =
      place?.formattedAddress?.trim() || input.addressText?.trim() || ''

    if (!addressText && !place?.placeId) {
      await this.removeByRole(input.weddingId, input.role)
      return null
    }

    if (input.resolve !== false) {
      const needsCoords =
        place == null ||
        place.latitude == null ||
        place.longitude == null ||
        !Number.isFinite(place.latitude) ||
        !Number.isFinite(place.longitude)
      if (needsCoords && addressText) {
        const resolved = await travelProvider.getCoordinates(addressText)
        place = {
          placeId: resolved.placeId,
          formattedAddress: resolved.formattedAddress,
          latitude: resolved.lat,
          longitude: resolved.lng,
          label: place?.label,
        }
      }
    }

    const formatted =
      place?.formattedAddress?.trim() || addressText
    if (!formatted) {
      await this.removeByRole(input.weddingId, input.role)
      return null
    }

    const existing = await this.getByRole(input.weddingId, input.role)
    const patch = {
      wedding_id: input.weddingId,
      role: input.role,
      label: place?.label?.trim() || existing?.label || null,
      place_id: place?.placeId ?? existing?.placeId ?? null,
      formatted_address: formatted,
      latitude: place?.latitude ?? existing?.latitude ?? null,
      longitude: place?.longitude ?? existing?.longitude ?? null,
      sort_order: ROLE_SORT[input.role] ?? 100,
      updated_at: nowIso(),
    }

    if (existing) {
      const { data, error } = await supabase
        .from('wedding_places')
        .update(patch)
        .eq('id', existing.id)
        .select('*')
        .single()
      throwOnError(error)
      return mapRow(data as WeddingPlaceRow)
    }

    const { data, error } = await supabase
      .from('wedding_places')
      .insert(patch)
      .select('*')
      .single()
    throwOnError(error)
    return mapRow(data as WeddingPlaceRow)
  },

  async removeByRole(
    weddingId: string,
    role: WeddingPlaceRole,
  ): Promise<void> {
    const { error } = await supabase
      .from('wedding_places')
      .delete()
      .eq('wedding_id', weddingId)
      .eq('role', role)
    throwOnError(error)
  },

  /**
   * Sync core places from free-text wedding location fields (compatibility).
   * Only geocodes when text changed vs stored place.
   */
  async syncCoreFromText(
    weddingId: string,
    locations: {
      preparation?: string | null
      ceremony?: string | null
      reception?: string | null
    },
    options?: { resolveChanged?: boolean },
  ): Promise<WeddingPlace[]> {
    const resolveChanged = options?.resolveChanged ?? true
    const existing = await this.listByWeddingId(weddingId)
    const byRole = new Map(existing.map((p) => [p.role, p]))

    const pairs: { role: WeddingPlaceRole; text: string }[] = [
      { role: 'preparation', text: locations.preparation?.trim() || '' },
      { role: 'ceremony', text: locations.ceremony?.trim() || '' },
      { role: 'reception', text: locations.reception?.trim() || '' },
    ]

    for (const { role, text } of pairs) {
      const prev = byRole.get(role)
      if (!text) {
        if (prev) await this.removeByRole(weddingId, role)
        continue
      }
      const changed = !prev || prev.formattedAddress.trim() !== text
      await this.upsert({
        weddingId,
        role,
        addressText: text,
        place: changed
          ? null
          : {
              placeId: prev.placeId,
              formattedAddress: prev.formattedAddress,
              latitude: prev.latitude,
              longitude: prev.longitude,
              label: prev.label,
            },
        resolve: changed && resolveChanged,
      })
    }

    return this.listByWeddingId(weddingId)
  },

  coreRoles(): WeddingPlaceRole[] {
    return [...CORE_ROLES]
  },

  hasCoordinates,
}
