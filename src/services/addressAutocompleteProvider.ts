/**
 * Provider-agnostic address autocomplete for questionnaires and forms.
 * Current implementation adapts Geoapify via geoapifyService.
 * A future Google Places adapter can implement the same interface.
 */

import {
  GeoapifyError,
  geoapifyService,
  type GeoapifyPlaceResult,
} from '@/services/geoapifyService'

export type AddressProviderKind = 'current' | 'google' | string

export interface AddressSearchOptions {
  limit?: number
  language?: string
  countryCodes?: string[]
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

export interface AddressAutocompleteProvider {
  search(
    query: string,
    options?: AddressSearchOptions,
  ): Promise<AddressSuggestion[]>
  resolve(id: string): Promise<NormalizedAddress>
}

function toNormalized(hit: GeoapifyPlaceResult): NormalizedAddress {
  const line1 = hit.addressLine1?.trim() || ''
  const street = line1 || undefined
  return {
    formattedAddress: hit.formatted,
    placeId: hit.placeId ?? undefined,
    provider: 'current',
    street,
    latitude: hit.lat,
    longitude: hit.lon,
  }
}

function suggestionId(hit: GeoapifyPlaceResult, index: number): string {
  if (hit.placeId) return `place:${hit.placeId}`
  return `geo:${hit.lat},${hit.lon}:${index}`
}

/** Adapter over the current maps/geocoding provider (Geoapify). */
export function createTravelAddressProvider(): AddressAutocompleteProvider {
  const cache = new Map<string, NormalizedAddress>()

  return {
    async search(query: string, options?: AddressSearchOptions) {
      const q = query.trim()
      if (q.length < 2) return []
      try {
        const hits = await geoapifyService.searchPlaces(q)
        const limit = options?.limit ?? 8
        const suggestions: AddressSuggestion[] = []
        for (let i = 0; i < hits.length && suggestions.length < limit; i += 1) {
          const hit = hits[i]
          const id = suggestionId(hit, i)
          cache.set(id, toNormalized(hit))
          suggestions.push({
            id,
            label: hit.formatted,
            secondaryLabel: hit.addressLine2 || undefined,
          })
        }
        return suggestions
      } catch (err) {
        if (err instanceof GeoapifyError) return []
        return []
      }
    },

    async resolve(id: string) {
      const cached = cache.get(id)
      if (cached) return cached
      // Manual / unknown ids — treat as free-text address string after prefix strip.
      const manual = id.replace(/^manual:/, '').trim()
      return {
        formattedAddress: manual,
        provider: 'current',
      }
    },
  }
}

/** Default questionnaire address provider (swap for Google later). */
export const defaultAddressAutocompleteProvider: AddressAutocompleteProvider =
  createTravelAddressProvider()
