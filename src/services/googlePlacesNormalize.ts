/**
 * Google Places (New) → NormalizedAddress / AddressSuggestion mapping.
 * Keep in sync with supabase/functions/places-proxy/normalize.ts
 */

import type {
  AddressSuggestion,
  NormalizedAddress,
} from '@/services/addressAutocompleteProvider'

export interface GoogleAddressComponent {
  longText?: string
  shortText?: string
  types?: string[]
  languageCode?: string
}

export interface GooglePlaceDetailsLike {
  id?: string
  formattedAddress?: string
  addressComponents?: GoogleAddressComponent[]
  location?: { latitude?: number; longitude?: number }
  displayName?: { text?: string; languageCode?: string }
  types?: string[]
}

export interface GooglePlacePredictionLike {
  placeId?: string
  text?: { text?: string }
  structuredFormat?: {
    mainText?: { text?: string }
    secondaryText?: { text?: string }
  }
}

export interface GoogleSuggestionLike {
  placePrediction?: GooglePlacePredictionLike
}

function componentOf(
  components: GoogleAddressComponent[] | undefined,
  type: string,
): GoogleAddressComponent | undefined {
  return components?.find((c) => c.types?.includes(type))
}

function textOf(c: GoogleAddressComponent | undefined): string | undefined {
  const v = c?.longText?.trim() || c?.shortText?.trim()
  return v || undefined
}

/** Map Polish-friendly address components from Places (New). */
export function mapGooglePlaceToNormalized(
  place: GooglePlaceDetailsLike,
): NormalizedAddress {
  const components = place.addressComponents ?? []
  const street = textOf(componentOf(components, 'route'))
  const buildingNumber = textOf(componentOf(components, 'street_number'))
  const apartmentNumber = textOf(componentOf(components, 'subpremise'))
  const postalCode = textOf(componentOf(components, 'postal_code'))
  const city =
    textOf(componentOf(components, 'locality')) ||
    textOf(componentOf(components, 'postal_town')) ||
    textOf(componentOf(components, 'administrative_area_level_2'))
  const region = textOf(componentOf(components, 'administrative_area_level_1'))
  const country = textOf(componentOf(components, 'country'))

  const formatted =
    place.formattedAddress?.trim() ||
    [street, buildingNumber, postalCode, city].filter(Boolean).join(', ') ||
    'Adres'

  const displayName = place.displayName?.text?.trim() || undefined

  return {
    formattedAddress: formatted,
    placeId: place.id?.trim() || undefined,
    provider: 'google',
    name: displayName,
    types: Array.isArray(place.types) ? place.types.filter(Boolean) : undefined,
    street,
    buildingNumber,
    apartmentNumber,
    postalCode,
    city,
    region,
    country,
    latitude:
      typeof place.location?.latitude === 'number'
        ? place.location.latitude
        : undefined,
    longitude:
      typeof place.location?.longitude === 'number'
        ? place.location.longitude
        : undefined,
  }
}

export function mapGoogleSuggestionsToAddressSuggestions(
  suggestions: GoogleSuggestionLike[] | undefined,
  limit: number,
): AddressSuggestion[] {
  const out: AddressSuggestion[] = []
  for (const row of suggestions ?? []) {
    if (out.length >= limit) break
    const pred = row.placePrediction
    if (!pred?.placeId) continue
    const label =
      pred.structuredFormat?.mainText?.text?.trim() ||
      pred.text?.text?.trim() ||
      ''
    if (!label) continue
    const secondary =
      pred.structuredFormat?.secondaryText?.text?.trim() || undefined
    out.push({
      id: `google:${pred.placeId}`,
      label,
      secondaryLabel: secondary,
    })
  }
  return out
}

/** Ensure no raw Google payload keys leak into domain state. */
export function stripRawGoogleFields(
  value: NormalizedAddress,
): NormalizedAddress {
  return {
    formattedAddress: value.formattedAddress,
    placeId: value.placeId,
    provider: 'google',
    name: value.name,
    types: value.types,
    street: value.street,
    buildingNumber: value.buildingNumber,
    apartmentNumber: value.apartmentNumber,
    postalCode: value.postalCode,
    city: value.city,
    region: value.region,
    country: value.country,
    latitude: value.latitude,
    longitude: value.longitude,
  }
}

export const GOOGLE_PLACES_MIN_QUERY_LENGTH = 3

export const GOOGLE_USER_ERROR_PL =
  'Nie udało się pobrać podpowiedzi. Możesz wpisać adres ręcznie.'
