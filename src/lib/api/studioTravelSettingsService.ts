import { resolveStudioUserId } from '@/lib/api/studioUser'
import { supabase } from '@/lib/supabase'
import { nowIso, throwOnError, toNumber } from '@/lib/supabase/helpers'
import { travelProvider } from '@/services/travelProvider'
import type { GeoPlace, StudioTravelSettings } from '@/types/travel'

interface StudioTravelSettingsRow {
  id: string
  user_id: string
  studio_name: string | null
  street: string | null
  building_number: string | null
  postal_code: string | null
  city: string | null
  country: string
  formatted_address: string | null
  latitude: number | string | null
  longitude: number | string | null
  place_id: string | null
  created_at: string
  updated_at: string
}

function mapRow(row: StudioTravelSettingsRow): StudioTravelSettings {
  return {
    id: row.id,
    userId: row.user_id,
    studioName: row.studio_name,
    street: row.street,
    buildingNumber: row.building_number,
    postalCode: row.postal_code,
    city: row.city,
    country: row.country || 'Polska',
    formattedAddress: row.formatted_address,
    latitude:
      row.latitude == null ? null : toNumber(row.latitude, Number.NaN) || null,
    longitude:
      row.longitude == null ? null : toNumber(row.longitude, Number.NaN) || null,
    placeId: row.place_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface UpsertStudioTravelSettingsInput {
  studioName?: string | null
  street?: string | null
  buildingNumber?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
  /** When set, skips geocode and uses this resolved place. */
  place?: GeoPlace | null
  /** Force geocode from structured address fields. */
  geocode?: boolean
}

function buildAddressLine(input: UpsertStudioTravelSettingsInput): string {
  const parts = [
    [input.street?.trim(), input.buildingNumber?.trim()].filter(Boolean).join(' '),
    [input.postalCode?.trim(), input.city?.trim()].filter(Boolean).join(' '),
    input.country?.trim() || 'Polska',
  ].filter((p) => p.trim())
  return parts.join(', ')
}

export const studioTravelSettingsService = {
  async get(): Promise<StudioTravelSettings | null> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('studio_travel_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    throwOnError(error)
    return data ? mapRow(data as StudioTravelSettingsRow) : null
  },

  /**
   * Upsert the single active studio origin.
   * Geocodes only when address fields change and no explicit place is provided.
   */
  async upsert(
    input: UpsertStudioTravelSettingsInput,
  ): Promise<StudioTravelSettings> {
    const userId = await resolveStudioUserId()
    const existing = await this.get()

    let place = input.place ?? null
    const shouldGeocode =
      Boolean(input.geocode) ||
      (!place &&
        Boolean(
          input.street?.trim() ||
            input.city?.trim() ||
            input.postalCode?.trim(),
        ))

    if (shouldGeocode && !place) {
      const address = buildAddressLine(input)
      if (address.trim()) {
        const resolved = await travelProvider.getCoordinates(address)
        place = {
          placeId: resolved.placeId,
          formattedAddress: resolved.formattedAddress,
          latitude: resolved.lat,
          longitude: resolved.lng,
        }
      }
    }

    const patch = {
      user_id: userId,
      studio_name: input.studioName?.trim() || null,
      street: input.street?.trim() || null,
      building_number: input.buildingNumber?.trim() || null,
      postal_code: input.postalCode?.trim() || null,
      city: input.city?.trim() || null,
      country: input.country?.trim() || 'Polska',
      formatted_address:
        place?.formattedAddress ||
        buildAddressLine(input) ||
        existing?.formattedAddress ||
        null,
      latitude: place?.latitude ?? existing?.latitude ?? null,
      longitude: place?.longitude ?? existing?.longitude ?? null,
      place_id: place?.placeId ?? existing?.placeId ?? null,
      updated_at: nowIso(),
    }

    if (existing) {
      const { data, error } = await supabase
        .from('studio_travel_settings')
        .update(patch)
        .eq('id', existing.id)
        .select('*')
        .single()
      throwOnError(error)
      return mapRow(data as StudioTravelSettingsRow)
    }

    const { data, error } = await supabase
      .from('studio_travel_settings')
      .insert(patch)
      .select('*')
      .single()
    throwOnError(error)
    return mapRow(data as StudioTravelSettingsRow)
  },

  hasCoordinates(settings: StudioTravelSettings | null): boolean {
    return (
      settings != null &&
      settings.latitude != null &&
      settings.longitude != null &&
      Number.isFinite(settings.latitude) &&
      Number.isFinite(settings.longitude)
    )
  },
}
