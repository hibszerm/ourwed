/**
 * Provider-agnostic address autocomplete for questionnaires and travel.
 *
 * Switch point: createDefaultAddressAutocompleteProvider() → Google only.
 */

export type AddressProviderKind = 'google' | 'geoapify' | 'current' | string

export interface AddressSearchOptions {
  limit?: number
  language?: string
  countryCodes?: string[]
  signal?: AbortSignal
  sessionToken?: string
}

export interface AddressSuggestion {
  id: string
  label: string
  secondaryLabel?: string
}

export interface NormalizedAddress {
  formattedAddress: string
  placeId?: string
  provider?: AddressProviderKind
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

/** Travel / wedding location shape (provider-independent). */
export type NormalizedLocation = NormalizedAddress & {
  label?: string
  coordinates?: {
    latitude: number
    longitude: number
  }
}

export interface AddressAutocompleteProvider {
  kind?: AddressProviderKind
  attribution?: 'google' | null
  search(
    query: string,
    options?: AddressSearchOptions,
  ): Promise<AddressSuggestion[]>
  resolve(
    id: string,
    options?: AddressSearchOptions,
  ): Promise<NormalizedAddress>
  beginSession?(): string
  endSession?(): void
  getSessionToken?(): string | null
}