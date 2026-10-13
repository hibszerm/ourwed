import { supabase } from '@/lib/supabase'
import { throwOnError, toNumber } from '@/lib/supabase/helpers'
import { listOwnedWeddingIds } from '@/lib/api/ownership'
import { logOperationalOrder } from '@/features/wedding-day/operationalOrderDebug'
import { travelProvider } from '@/services/travelProvider'
import type { GeoPlace, WeddingPlace, WeddingPlaceRole } from '@/types/travel'
import { devErrorArgs } from '@/lib/debug/devConsole'

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
  'bride_preparation',
  'groom_preparation',
  'ceremony',
  'reception',
]

/** Normalize legacy preparation role → bride_preparation (bride-primary historical semantics). */
export function normalizeWeddingPlaceRole(role: string): WeddingPlaceRole {
  if (role === 'preparation') return 'bride_preparation'
  return role as WeddingPlaceRole
}

function mapRow(row: WeddingPlaceRow): WeddingPlace {
  return {
    id: row.id,
    weddingId: row.wedding_id,
    role: normalizeWeddingPlaceRole(row.role),
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
    const map = await this.listByWeddingIds([weddingId])
    const listed = map.get(weddingId) ?? []
    logOperationalOrder({
      source: 'weddingPlaceService.listByWeddingId',
      weddingId,
      places: listed,
      note: 'db',
    })
    return listed
  },

  /** Batch load places for many weddings — one query (list/dashboard hydrate). */
  async listByWeddingIds(
    weddingIds: string[],
  ): Promise<Map<string, WeddingPlace[]>> {
    const map = new Map<string, WeddingPlace[]>()
    if (weddingIds.length === 0) return map
    for (const id of weddingIds) map.set(id, [])

    const { data, error } = await supabase
      .from('wedding_places')
      .select('*')
      .in('wedding_id', weddingIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    throwOnError(error)

    for (const row of (data ?? []) as WeddingPlaceRow[]) {
      const place = mapRow(row)
      const list = map.get(place.weddingId) ?? []
      list.push(place)
      map.set(place.weddingId, list)
    }
    return map
  },

  async getByRole(
    weddingId: string,
    role: WeddingPlaceRole,
  ): Promise<WeddingPlace | null> {
    const roles =
      role === 'bride_preparation'
        ? (['bride_preparation', 'preparation'] as const)
        : ([role] as const)

    for (const r of roles) {
      const { data, error } = await supabase
        .from('wedding_places')
        .select('*')
        .eq('wedding_id', weddingId)
        .eq('role', r)
        .maybeSingle()
      throwOnError(error)
      if (data) return mapRow(data as WeddingPlaceRow)
    }
    return null
  },

  /**
   * Create/update a wedding place. Geocodes only on edit
   * (when resolve=true or coordinates are missing).
   */
  async upsert(input: UpsertWeddingPlaceInput): Promise<WeddingPlace | null> {
    let place = input.place ?? null
    const addressText =
      place?.formattedAddress?.trim() || input.addressText?.trim() || ''
    const explicitName =
      place != null && place.label !== undefined
        ? place.label?.trim() || null
        : undefined

    if (!addressText && !place?.placeId && !explicitName) {
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
      place?.formattedAddress?.trim() || addressText || ''
    // formatted_address is NOT NULL — empty string allowed for name-only rows.
    if (!formatted && !(place?.label?.trim() || explicitName)) {
      await this.removeByRole(input.weddingId, input.role)
      return null
    }

    const existing = await this.getByRole(input.weddingId, input.role)
    // When `place` is provided, its fields win — including explicit nulls
    // (unresolved / needs verification). Do not fall back to stale coords.
    // label: undefined means preserve existing; null/'' clears; string sets.
    const nextLabel =
      place == null
        ? existing?.label || null
        : place.label === undefined
          ? existing?.label || null
          : place.label?.trim() || null

    const { data, error } = await supabase.rpc('mutate_owner_wedding_places', {
      p_wedding_id: input.weddingId,
      p_action: 'upsert',
      p_payload: {
        role: input.role,
        formatted_address: formatted || existing?.formattedAddress || '',
        has_location: place != null,
        place_id: place?.placeId ?? null,
        latitude: place?.latitude ?? null,
        longitude: place?.longitude ?? null,
        label: nextLabel,
        label_supplied: place != null && place.label !== undefined,
      },
    })
    throwOnError(error)
    const mapped = mapRow(data as WeddingPlaceRow)
    logOperationalOrder({
      source: 'weddingPlaceService.upsert',
      weddingId: input.weddingId,
      places: [mapped],
      note: existing ? 'owner-command-update' : 'owner-command-insert',
    })
    return mapped
  },

  /**
   * Approval-only: insert initial places for a brand-new wedding in one batch.
   * No getByRole / listByWeddingId probes — caller guarantees empty roles.
   * Uses deterministic ROUTE_ROLE_SORT values (catalog order, not operational reorder).
   * Never geocodes.
   */
  async insertInitialWeddingPlaces(
    weddingId: string,
    places: Array<{
      role: WeddingPlaceRole
      place: GeoPlace
    }>,
  ): Promise<WeddingPlace[]> {
    if (places.length === 0) return []

    const rows = places.map(({ role, place }) => {
      const formatted =
        place.formattedAddress?.trim() || place.label?.trim() || ''
      return {
        role,
        label: place.label?.trim() || null,
        place_id: place.placeId ?? null,
        formatted_address: formatted,
        latitude: place.latitude,
        longitude: place.longitude,
      }
    })

    const { data, error } = await supabase.rpc('mutate_owner_wedding_places', {
      p_wedding_id: weddingId,
      p_action: 'insert_initial',
      p_payload: { places: rows },
    })

    throwOnError(error)

    const mapped = ((data ?? []) as WeddingPlaceRow[]).map(mapRow)
    logOperationalOrder({
      source: 'weddingPlaceService.insertInitialWeddingPlaces',
      weddingId,
      places: mapped,
      note: 'approval-batch-insert',
    })
    return mapped
  },

  /**
   * Persist operational stop order.
   * Writes unique sort_order values in the OPERATIONAL_SORT_BASE range so the
   * route engine treats them as custom (never confused with role catalogs).
   * Returns the re-fetched place list in the new order.
   * Does not recalculate travel — caller must rebuild the plan after commit.
   */
  async reorder(
    weddingId: string,
    orderedPlaceIds: string[],
  ): Promise<WeddingPlace[]> {
    const existing = await this.listByWeddingId(weddingId)
    const byId = new Map(existing.map((p) => [p.id, p]))
    const uniqueIds = [...new Set(orderedPlaceIds.filter((id) => byId.has(id)))]
    if (uniqueIds.length === 0) return existing

    const remaining = existing
      .filter((p) => !uniqueIds.includes(p.id))
      .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
    const fullOrder = [...uniqueIds, ...remaining.map((p) => p.id)]

    const { error } = await supabase.rpc('mutate_owner_wedding_places', {
      p_wedding_id: weddingId,
      p_action: 'reorder',
      p_payload: { ordered_place_ids: fullOrder },
    })
    throwOnError(error)
    const listed = await this.listByWeddingId(weddingId)
    const listedIds = listed.map((p) => p.id)
    const expectedIds = fullOrder.filter((id) => listedIds.includes(id))
    const ok =
      expectedIds.length === listed.length &&
      expectedIds.every((id, i) => listed[i]?.id === id)
    logOperationalOrder({
      source: 'weddingPlaceService.reorder',
      weddingId,
      places: listed,
      note: ok ? 'persisted+verified' : 'list-order-mismatch',
      extra: {
        requestedIds: uniqueIds,
        fullOrder,
        writes: fullOrder.map((id, i) => ({
          id,
          sort_order: 1000 + i * 1000,
        })),
      },
    })
    if (!ok) {
      devErrorArgs('[wedding_places] reorder list order mismatch', {
        weddingId,
        expectedIds,
        listedIds,
      })
      throw new Error(
        'Zapisana kolejność planu dnia nie zgadza się z odczytem z bazy.',
      )
    }
    return listed
  },

  async removeByRole(
    weddingId: string,
    role: WeddingPlaceRole,
  ): Promise<void> {
    const { error } = await supabase.rpc('mutate_owner_wedding_places', {
      p_wedding_id: weddingId,
      p_action: 'delete_role',
      p_payload: { role },
    })
    throwOnError(error)
  },

  /**
   * Sync core places from free-text wedding location fields (compatibility).
   * Only geocodes when text changed vs stored place.
   */
  async syncCoreFromText(
    weddingId: string,
    locations: {
      bridePreparation?: string | null
      groomPreparation?: string | null
      /** @deprecated Use bridePreparation — mapped to bride_preparation. */
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
      {
        role: 'bride_preparation',
        text:
          locations.bridePreparation?.trim() ||
          locations.preparation?.trim() ||
          '',
      },
      {
        role: 'groom_preparation',
        text: locations.groomPreparation?.trim() || '',
      },
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

  /**
   * Core places that have address text but no coordinates (need photographer verification).
   */
  async listNeedingVerification(): Promise<WeddingPlace[]> {
    const weddingIds = await listOwnedWeddingIds()
    if (weddingIds.length === 0) return []

    const { data, error } = await supabase
      .from('wedding_places')
      .select('*')
      .in('wedding_id', weddingIds)
      .in('role', CORE_ROLES)
      .order('wedding_id', { ascending: true })
    throwOnError(error)
    return ((data ?? []) as WeddingPlaceRow[])
      .map(mapRow)
      .filter(
        (p) =>
          Boolean(p.formattedAddress.trim()) &&
          (p.latitude == null ||
            p.longitude == null ||
            !Number.isFinite(p.latitude) ||
            !Number.isFinite(p.longitude)),
      )
  },
}
