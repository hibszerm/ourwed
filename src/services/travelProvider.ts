/**
 * Sole travel / geocoding / routing provider for OurWed.
 * Implementation: Geoapify (OpenStreetMap-based).
 */

import {
  GeoapifyError,
  type GeoapifyErrorCode,
  geoapifyService,
} from '@/services/geoapifyService'

export type TravelProviderErrorCode = GeoapifyErrorCode | 'unknown'

export class TravelProviderError extends Error {
  readonly code: TravelProviderErrorCode

  constructor(message: string, code: TravelProviderErrorCode = 'unknown') {
    super(message)
    this.name = 'TravelProviderError'
    this.code = code
  }
}

export interface TravelPlace {
  lat: number
  lng: number
  formattedAddress: string
  placeId: string | null
}

export interface TravelRoute {
  distanceMeters: number
  durationSeconds: number
}

function wrapError(err: unknown, fallback: string): never {
  if (err instanceof TravelProviderError) throw err
  if (err instanceof GeoapifyError) {
    throw new TravelProviderError(err.message, err.code)
  }
  if (err instanceof TypeError) {
    throw new TravelProviderError(
      'Brak połączenia z serwisem lokalizacji. Sprawdź sieć i spróbuj ponownie.',
      'network',
    )
  }
  const message =
    err instanceof Error && err.message.trim() ? err.message.trim() : fallback
  // Never surface opaque browser/network strings like "Load failed"
  if (/^load failed$/i.test(message) || /^failed to fetch$/i.test(message)) {
    throw new TravelProviderError(
      'Brak połączenia z serwisem lokalizacji. Sprawdź sieć i spróbuj ponownie.',
      'network',
    )
  }
  throw new TravelProviderError(message, 'unknown')
}

function toTravelPlace(hit: {
  lat: number
  lon: number
  formatted: string
  placeId: string | null
}): TravelPlace {
  return {
    lat: hit.lat,
    lng: hit.lon,
    formattedAddress: hit.formatted,
    placeId: hit.placeId,
  }
}

export const travelProvider = {
  async getCoordinates(address: string): Promise<TravelPlace> {
    try {
      const hit = await geoapifyService.geocode(address)
      return toTravelPlace(hit)
    } catch (err) {
      wrapError(err, 'Nie udało się znaleźć lokalizacji.')
    }
  },

  async getAutocomplete(query: string): Promise<TravelPlace[]> {
    try {
      const hits = await geoapifyService.searchPlaces(query)
      return hits.map(toTravelPlace)
    } catch (err) {
      wrapError(err, 'Nie udało się wyszukać adresu.')
    }
  },

  async getRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
  ): Promise<TravelRoute> {
    try {
      return await geoapifyService.route(origin, destination)
    } catch (err) {
      wrapError(err, 'Nie udało się wyliczyć trasy.')
    }
  },
}
