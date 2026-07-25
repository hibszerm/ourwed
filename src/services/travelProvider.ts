/**
 * Sole travel / geocoding / routing façade for OurWed.
 * Implementation: Google Places (New) + Google Routes via Edge proxies.
 */

import { PLACES_PROXY_FUNCTION } from '@/services/googlePlacesAddressProvider'
import { GOOGLE_USER_ERROR_PL } from '@/services/googlePlacesNormalize'
import {
  computeGoogleRoute,
  GoogleRoutesProviderError,
} from '@/services/googleRoutesProvider'
import type { RouteResult } from '@/services/googleRoutesNormalize'
import type { NormalizedAddress } from '@/services/addressAutocompleteProvider'

export type TravelProviderErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'network'
  | 'not_found'
  | 'rate_limited'
  | 'unknown'

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
  provider?: 'google'
}

export interface TravelRoute {
  distanceMeters: number
  durationSeconds: number
  distanceLabel?: string
  durationLabel?: string
  encodedPolyline?: string
  provider?: 'google'
}

function wrapError(err: unknown, fallback: string): never {
  if (err instanceof TravelProviderError) throw err
  if (err instanceof GoogleRoutesProviderError) {
    throw new TravelProviderError(err.message, 'unknown')
  }
  if (err instanceof TypeError) {
    throw new TravelProviderError(
      'Brak połączenia z serwisem lokalizacji. Sprawdź sieć i spróbuj ponownie.',
      'network',
    )
  }
  const message =
    err instanceof Error && err.message.trim() ? err.message.trim() : fallback
  if (/^load failed$/i.test(message) || /^failed to fetch$/i.test(message)) {
    throw new TravelProviderError(
      'Brak połączenia z serwisem lokalizacji. Sprawdź sieć i spróbuj ponownie.',
      'network',
    )
  }
  throw new TravelProviderError(message || fallback, 'unknown')
}

function normalizedToTravelPlace(addr: NormalizedAddress): TravelPlace {
  if (
    typeof addr.latitude !== 'number' ||
    typeof addr.longitude !== 'number' ||
    !Number.isFinite(addr.latitude) ||
    !Number.isFinite(addr.longitude)
  ) {
    throw new TravelProviderError(
      'Nie udało się znaleźć lokalizacji.',
      'not_found',
    )
  }
  return {
    lat: addr.latitude,
    lng: addr.longitude,
    formattedAddress: addr.formattedAddress,
    placeId: addr.placeId ?? null,
    provider: 'google',
  }
}

async function invokePlaces(
  body: Record<string, unknown>,
): Promise<unknown> {
  const { supabase } = await import('@/lib/supabase')
  const { data, error } = await supabase.functions.invoke(PLACES_PROXY_FUNCTION, {
    body,
  })
  if (error) {
    throw new TravelProviderError(GOOGLE_USER_ERROR_PL, 'network')
  }
  return data
}

function newSessionToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const travelProvider = {
  /** Resolve a free-text address once (Places autocomplete + details). */
  async getCoordinates(address: string): Promise<TravelPlace> {
    const q = address.trim()
    if (q.length < 3) {
      throw new TravelProviderError('Adres jest wymagany.', 'bad_request')
    }
    try {
      const data = (await invokePlaces({
        operation: 'geocode',
        query: q,
        sessionToken: newSessionToken(),
        languageCode: 'pl',
        regionCode: 'PL',
      })) as { ok?: boolean; address?: NormalizedAddress }

      if (!data?.ok || !data.address) {
        throw new TravelProviderError(
          'Nie udało się znaleźć lokalizacji.',
          'not_found',
        )
      }
      return normalizedToTravelPlace(data.address)
    } catch (err) {
      wrapError(err, 'Nie udało się znaleźć lokalizacji.')
    }
  },

  /**
   * Autocomplete suggestions without coordinates.
   * Prefer AddressAutocompleteProvider in UI; this remains for service callers.
   */
  async getAutocomplete(
    query: string,
  ): Promise<Array<{ id: string; label: string; secondaryLabel?: string }>> {
    const q = query.trim()
    if (q.length < 3) return []
    try {
      const data = (await invokePlaces({
        operation: 'autocomplete',
        query: q,
        sessionToken: newSessionToken(),
        languageCode: 'pl',
        regionCode: 'PL',
        limit: 8,
      })) as {
        ok?: boolean
        suggestions?: Array<{
          id: string
          label: string
          secondaryLabel?: string
        }>
      }
      if (!data?.ok) return []
      return Array.isArray(data.suggestions) ? data.suggestions : []
    } catch (err) {
      wrapError(err, 'Nie udało się wyszukać adresu.')
    }
  },

  async getRoute(
    origin: { lat: number; lng: number; placeId?: string | null; address?: string },
    destination: {
      lat: number
      lng: number
      placeId?: string | null
      address?: string
    },
  ): Promise<TravelRoute> {
    try {
      const result: RouteResult = await computeGoogleRoute({
        origin: {
          latitude: origin.lat,
          longitude: origin.lng,
          placeId: origin.placeId,
          address: origin.address,
        },
        destination: {
          latitude: destination.lat,
          longitude: destination.lng,
          placeId: destination.placeId,
          address: destination.address,
        },
        travelMode: 'DRIVE',
      })
      return {
        distanceMeters: result.distanceMeters,
        durationSeconds: result.durationSeconds,
        distanceLabel: result.distanceLabel,
        durationLabel: result.durationLabel,
        encodedPolyline: result.encodedPolyline,
        provider: 'google',
      }
    } catch (err) {
      wrapError(err, 'Nie udało się wyliczyć trasy.')
    }
  },
}
