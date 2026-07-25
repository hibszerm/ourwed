/**
 * Map Google Places API (New) payloads → provider-independent shapes.
 * Keep in sync with src/services/googlePlacesNormalize.ts
 */

export interface ProxyAddressSuggestion {
  id: string
  label: string
  secondaryLabel?: string
}

export interface ProxyNormalizedAddress {
  formattedAddress: string
  placeId?: string
  provider: 'google'
  street?: string
  buildingNumber?: string
  apartmentNumber?: string
  postalCode?: string
  city?: string
  region?: string
  country?: string
  latitude?: number
  longitude?: number
}

interface GoogleText {
  text?: string
}

interface GoogleStructuredFormat {
  mainText?: GoogleText
  secondaryText?: GoogleText
}

interface GooglePlacePrediction {
  placeId?: string
  text?: GoogleText
  structuredFormat?: GoogleStructuredFormat
}

interface GoogleSuggestion {
  placePrediction?: GooglePlacePrediction
}

interface GoogleAddressComponent {
  longText?: string
  shortText?: string
  types?: string[]
  languageCode?: string
}

interface GooglePlaceDetails {
  id?: string
  formattedAddress?: string
  addressComponents?: GoogleAddressComponent[]
  location?: { latitude?: number; longitude?: number }
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
  place: GooglePlaceDetails,
): ProxyNormalizedAddress {
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

  return {
    formattedAddress: formatted,
    placeId: place.id?.trim() || undefined,
    provider: 'google',
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
  suggestions: GoogleSuggestion[] | undefined,
  limit: number,
): ProxyAddressSuggestion[] {
  const out: ProxyAddressSuggestion[] = []
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

/** Strip raw Google keys — only allow NormalizedAddress fields through. */
export function sanitizeNormalizedAddress(
  value: ProxyNormalizedAddress,
): ProxyNormalizedAddress {
  return {
    formattedAddress: value.formattedAddress,
    placeId: value.placeId,
    provider: 'google',
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
