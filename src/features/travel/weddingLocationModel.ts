/**
 * Canonical Wedding location name vs address rules.
 * Persisted semantic name = wedding_places.label; address = formatted_address.
 */

import type { AddressSuggestion, NormalizedAddress } from '@/services/addressAutocompleteProvider'
import type { GeoPlace, WeddingPlace } from '@/types/travel'

export interface WeddingLocationDisplay {
  /** Venue name, or address when no meaningful name, or type fallback. */
  primary: string
  /** Address line when primary is a distinct venue name; otherwise null. */
  secondary: string | null
}

export interface MapPlaceSelectionInput {
  resolved: NormalizedAddress
  /** Autocomplete primary text (e.g. "Villa Love") or Place Details displayName. */
  suggestionLabel?: string | null
  /** Place Details / provider types when available. */
  placeTypes?: string[] | null
  /**
   * Existing venue name to keep when selecting a pure address
   * and the user has not cleared the name.
   */
  preserveName?: string | null
  /** When true, keep preserveName even if the selection is a named venue. */
  nameManuallyEdited?: boolean
}

const NAMED_PLACE_TYPES = new Set([
  'establishment',
  'point_of_interest',
  'premise',
  'subpremise',
  'lodging',
  'restaurant',
  'cafe',
  'bar',
  'church',
  'place_of_worship',
  'hindu_temple',
  'mosque',
  'synagogue',
  'cemetery',
  'funeral_home',
  'park',
  'tourist_attraction',
  'museum',
  'art_gallery',
  'stadium',
  'spa',
  'gym',
  'beauty_salon',
  'hair_care',
  'store',
  'shopping_mall',
  'university',
  'school',
  'hospital',
  'wedding_venue',
  'banquet_hall',
  'event_venue',
  'community_center',
  'convention_center',
])

const ADDRESS_LIKE_TYPES = new Set([
  'street_address',
  'route',
  'intersection',
  'plus_code',
  'premise', // handled carefully with name heuristics
  'subpremise',
  'postal_code',
  'geocode',
  'political',
  'country',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'locality',
  'sublocality',
  'neighborhood',
  'colloquial_area',
])

function normalizeCompare(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.,;:!?()'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstAddressSegment(formattedAddress: string | null | undefined): string {
  return (formattedAddress ?? '').split(',')[0]?.trim() || ''
}

function buildStreetLine(addr: Pick<NormalizedAddress, 'street' | 'buildingNumber'>): string {
  return [addr.street?.trim(), addr.buildingNumber?.trim()].filter(Boolean).join(' ')
}

/** True when candidate looks like a street/postal/city fragment, not a venue. */
export function isAddressLikeName(
  candidate: string | null | undefined,
  formattedAddress?: string | null,
  addressParts?: Pick<
    NormalizedAddress,
    'street' | 'buildingNumber' | 'postalCode' | 'city' | 'country' | 'region'
  >,
): boolean {
  const raw = candidate?.trim()
  if (!raw) return true

  const n = normalizeCompare(raw)
  if (!n) return true

  const formatted = formattedAddress?.trim() || ''
  const nFormatted = normalizeCompare(formatted)
  if (nFormatted && (n === nFormatted || nFormatted.startsWith(n + ',') || nFormatted.startsWith(n + ' '))) {
    // Equal to full address or its leading segment only when segment is street-like below.
    if (n === nFormatted) return true
  }

  const first = normalizeCompare(firstAddressSegment(formatted))
  if (first && n === first) {
    // "Lwowska 78" as name when address starts with that — treat as address duplicate.
    return true
  }

  if (addressParts) {
    const streetLine = normalizeCompare(buildStreetLine(addressParts))
    if (streetLine && n === streetLine) return true
    const streetOnly = normalizeCompare(addressParts.street ?? '')
    if (streetOnly && n === streetOnly) return true
    const city = normalizeCompare(addressParts.city ?? '')
    if (city && n === city) return true
    const postal = normalizeCompare(addressParts.postalCode ?? '')
    if (postal && n === postal) return true
    const country = normalizeCompare(addressParts.country ?? '')
    if (country && n === country) return true
    const region = normalizeCompare(addressParts.region ?? '')
    if (region && n === region) return true
  }

  // Pure house number / postal patterns
  if (/^\d+[a-z]?$/i.test(raw)) return true
  if (/^\d{2}-\d{3}$/.test(raw)) return true

  return false
}

/**
 * Decide whether a provider primary label is a semantic venue name.
 */
export function isMeaningfulVenueName(
  candidate: string | null | undefined,
  formattedAddress?: string | null,
  options?: {
    placeTypes?: string[] | null
    addressParts?: Pick<
      NormalizedAddress,
      'street' | 'buildingNumber' | 'postalCode' | 'city' | 'country' | 'region'
    >
  },
): boolean {
  const raw = candidate?.trim()
  if (!raw) return false
  if (isAddressLikeName(raw, formattedAddress, options?.addressParts)) return false

  const types = options?.placeTypes?.filter(Boolean) ?? []
  if (types.length > 0) {
    const hasNamed = types.some((t) => NAMED_PLACE_TYPES.has(t))
    const onlyAddress = types.every((t) => ADDRESS_LIKE_TYPES.has(t))
    if (onlyAddress && !hasNamed) return false
    if (hasNamed) return true
  }

  // Heuristic: multi-word / branded names that are not the street line.
  return true
}

/**
 * Non-destructive read adapter for legacy rows where label duplicated the address.
 */
export function adaptLegacyWeddingLocationFields(input: {
  label?: string | null
  formattedAddress?: string | null
}): { name: string | null; formattedAddress: string | null } {
  const formatted = input.formattedAddress?.trim() || null
  const label = input.label?.trim() || null
  if (!label) return { name: null, formattedAddress: formatted }
  if (!isMeaningfulVenueName(label, formatted)) {
    return { name: null, formattedAddress: formatted || label }
  }
  return { name: label, formattedAddress: formatted }
}

export function getWeddingLocationDisplay(
  location: {
    name?: string | null
    label?: string | null
    formattedAddress?: string | null
    addressLine?: string | null
  },
  fallbackPrimary = 'Lokalizacja',
): WeddingLocationDisplay {
  const adapted = adaptLegacyWeddingLocationFields({
    label: location.name ?? location.label,
    formattedAddress:
      location.formattedAddress?.trim() ||
      location.addressLine?.trim() ||
      null,
  })
  const address =
    adapted.formattedAddress ||
    location.addressLine?.trim() ||
    null

  if (adapted.name) {
    const secondary =
      address && normalizeCompare(address) !== normalizeCompare(adapted.name)
        ? address
        : null
    return { primary: adapted.name, secondary }
  }

  if (address) {
    return { primary: address, secondary: null }
  }

  return { primary: fallbackPrimary, secondary: null }
}

export function buildAddressLine(addr: NormalizedAddress): string | null {
  const line = buildStreetLine(addr)
  return line || firstAddressSegment(addr.formattedAddress) || null
}

/**
 * Shared Google / autocomplete → GeoPlace mapping for all location editors.
 */
export function mapPlaceSelectionToGeoPlace(
  input: MapPlaceSelectionInput,
): GeoPlace {
  const { resolved } = input
  const formatted = resolved.formattedAddress.trim()
  const providerName =
    resolved.name?.trim() ||
    input.suggestionLabel?.trim() ||
    null

  const addressParts = {
    street: resolved.street,
    buildingNumber: resolved.buildingNumber,
    postalCode: resolved.postalCode,
    city: resolved.city,
    country: resolved.country,
    region: resolved.region,
  }

  const detectedName =
    providerName &&
    isMeaningfulVenueName(providerName, formatted, {
      placeTypes: input.placeTypes ?? resolved.types,
      addressParts,
    })
      ? providerName
      : null

  let label: string | null = null
  if (input.nameManuallyEdited) {
    const preserved = input.preserveName?.trim() || null
    label =
      preserved && isMeaningfulVenueName(preserved, formatted, { addressParts })
        ? preserved
        : preserved
  } else if (detectedName) {
    label = detectedName
  } else if (input.preserveName?.trim()) {
    const preserved = input.preserveName.trim()
    label = isMeaningfulVenueName(preserved, formatted, { addressParts })
      ? preserved
      : null
  }

  return {
    placeId: resolved.placeId ?? null,
    formattedAddress: formatted,
    latitude: resolved.latitude ?? null,
    longitude: resolved.longitude ?? null,
    label,
    provider: resolved.provider ?? 'google',
  }
}

export function mapSuggestionAndResolvedToGeoPlace(
  suggestion: AddressSuggestion,
  resolved: NormalizedAddress,
  options?: {
    preserveName?: string | null
    nameManuallyEdited?: boolean
  },
): GeoPlace {
  return mapPlaceSelectionToGeoPlace({
    resolved,
    suggestionLabel: suggestion.label,
    preserveName: options?.preserveName,
    nameManuallyEdited: options?.nameManuallyEdited,
  })
}

/** Route cache identity — name-only edits must not invalidate. */
export function weddingLocationRouteIdentity(place: {
  placeId?: string | null
  formattedAddress?: string | null
  latitude?: number | null
  longitude?: number | null
}): string {
  return [
    place.placeId?.trim() || '',
    place.formattedAddress?.trim() || '',
    place.latitude ?? '',
    place.longitude ?? '',
  ].join('|')
}

export function didWeddingLocationRouteChange(
  prev: Parameters<typeof weddingLocationRouteIdentity>[0] | null | undefined,
  next: Parameters<typeof weddingLocationRouteIdentity>[0] | null | undefined,
): boolean {
  if (!prev && !next) return false
  if (!prev || !next) return true
  return (
    weddingLocationRouteIdentity(prev) !== weddingLocationRouteIdentity(next)
  )
}

export function weddingPlaceToGeoPlace(place: WeddingPlace | null | undefined): GeoPlace | null {
  if (!place) return null
  const adapted = adaptLegacyWeddingLocationFields(place)
  return {
    placeId: place.placeId,
    formattedAddress: place.formattedAddress,
    latitude: place.latitude,
    longitude: place.longitude,
    label: adapted.name,
    provider: place.placeId ? 'google' : null,
  }
}

/** Prefer venue name for travel leg labels; fall back to role title. */
export function weddingPlaceRouteLabel(
  place: Pick<WeddingPlace, 'label' | 'formattedAddress'>,
  roleTitle: string,
): string {
  const display = getWeddingLocationDisplay(place, roleTitle)
  return display.primary
}

/**
 * Normalize questionnaire / import location answers into name + address.
 */
export function normalizeLocationAnswer(value: unknown): {
  name: string | null
  formattedAddress: string | null
  placeId: string | null
  latitude: number | null
  longitude: number | null
} {
  if (value == null) {
    return {
      name: null,
      formattedAddress: null,
      placeId: null,
      latitude: null,
      longitude: null,
    }
  }

  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) {
      return {
        name: null,
        formattedAddress: null,
        placeId: null,
        latitude: null,
        longitude: null,
      }
    }
    // Single free-text: treat as address unless it clearly has no street cues —
    // keep conservative: store as address, not as invented venue name.
    return {
      name: null,
      formattedAddress: text,
      placeId: null,
      latitude: null,
      longitude: null,
    }
  }

  if (typeof value !== 'object') {
    return {
      name: null,
      formattedAddress: null,
      placeId: null,
      latitude: null,
      longitude: null,
    }
  }

  const row = value as Record<string, unknown>
  const formatted =
    (typeof row.formattedAddress === 'string' && row.formattedAddress.trim()) ||
    [
      row.street,
      row.buildingNumber,
      row.postalCode,
      row.city,
      row.country,
    ]
      .map((p) => (typeof p === 'string' ? p.trim() : ''))
      .filter(Boolean)
      .join(', ') ||
    null

  const rawName =
    (typeof row.name === 'string' && row.name.trim()) ||
    (typeof row.label === 'string' && row.label.trim()) ||
    (typeof row.venueName === 'string' && row.venueName.trim()) ||
    (typeof row.placeName === 'string' && row.placeName.trim()) ||
    null

  const name =
    rawName && isMeaningfulVenueName(rawName, formatted)
      ? rawName
      : null

  const lat =
    typeof row.latitude === 'number' && Number.isFinite(row.latitude)
      ? row.latitude
      : null
  const lng =
    typeof row.longitude === 'number' && Number.isFinite(row.longitude)
      ? row.longitude
      : null

  return {
    name,
    formattedAddress: formatted,
    placeId:
      typeof row.placeId === 'string' && row.placeId.trim()
        ? row.placeId.trim()
        : null,
    latitude: lat,
    longitude: lng,
  }
}

/**
 * Merge incoming questionnaire location with existing place without
 * silently replacing a meaningful venue name with an address-only answer.
 */
export function mergeLocationAnswerWithExisting(
  incoming: ReturnType<typeof normalizeLocationAnswer>,
  existing: WeddingPlace | null | undefined,
): GeoPlace {
  const existingAdapted = existing
    ? adaptLegacyWeddingLocationFields(existing)
    : { name: null, formattedAddress: null }

  const address =
    incoming.formattedAddress?.trim() ||
    existingAdapted.formattedAddress ||
    ''

  let name = incoming.name
  if (!name && existingAdapted.name) {
    // Address-only incoming: keep existing venue name.
    name = existingAdapted.name
  }
  if (name && !isMeaningfulVenueName(name, address)) {
    name = null
  }

  return {
    placeId: incoming.placeId ?? existing?.placeId ?? null,
    formattedAddress: address,
    latitude: incoming.latitude ?? existing?.latitude ?? null,
    longitude: incoming.longitude ?? existing?.longitude ?? null,
    label: name,
    provider: incoming.placeId ? 'google' : existing?.placeId ? 'google' : null,
  }
}
