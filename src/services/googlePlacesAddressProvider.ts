/**
 * Google Places address provider — calls places-proxy Edge Function.
 * Never holds GOOGLE_MAPS_API_KEY in the browser.
 */

import type {
  AddressAutocompleteProvider,
  AddressSearchOptions,
  AddressSuggestion,
  NormalizedAddress,
} from '@/services/addressAutocompleteProvider'
import {
  GOOGLE_PLACES_MIN_QUERY_LENGTH,
  GOOGLE_USER_ERROR_PL,
  stripRawGoogleFields,
} from '@/services/googlePlacesNormalize'

export const PLACES_PROXY_FUNCTION = 'places-proxy'

export class GooglePlacesProviderError extends Error {
  readonly code: 'provider_error' | 'bad_request' | 'network' | 'aborted'

  constructor(
    message: string,
    code: GooglePlacesProviderError['code'] = 'provider_error',
  ) {
    super(message)
    this.name = 'GooglePlacesProviderError'
    this.code = code
  }
}

interface AutocompleteOk {
  ok: true
  operation: 'autocomplete'
  suggestions: AddressSuggestion[]
}

interface ResolveOk {
  ok: true
  operation: 'resolve'
  address: NormalizedAddress
}

interface ProxyErr {
  ok: false
  error?: { code?: string; message?: string }
}

function newSessionToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function invokeProxy(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  // Lazy import so unit tests can construct the provider without Vite env.
  const { supabase } = await import('@/lib/supabase')
  const { data, error } = await supabase.functions.invoke(PLACES_PROXY_FUNCTION, {
    body,
    ...(signal ? { signal } : {}),
  })

  if (error) {
    if (signal?.aborted || (error as { name?: string }).name === 'AbortError') {
      throw new GooglePlacesProviderError('Aborted', 'aborted')
    }
    throw new GooglePlacesProviderError(GOOGLE_USER_ERROR_PL, 'provider_error')
  }

  return data
}

export interface GooglePlacesAddressProviderOptions {
  /** Inject for tests. */
  invoke?: typeof invokeProxy
}

/**
 * Stateful per-field Google provider. Create one instance per AddressField.
 */
export function createGooglePlacesAddressProvider(
  options?: GooglePlacesAddressProviderOptions,
): AddressAutocompleteProvider {
  const invoke = options?.invoke ?? invokeProxy
  let sessionToken: string | null = null

  function ensureSession(explicit?: string): string {
    if (explicit) {
      sessionToken = explicit
      return explicit
    }
    if (!sessionToken) sessionToken = newSessionToken()
    return sessionToken
  }

  return {
    kind: 'google',
    attribution: 'google',

    beginSession() {
      sessionToken = newSessionToken()
      return sessionToken
    },

    endSession() {
      sessionToken = null
    },

    getSessionToken() {
      return sessionToken
    },

    async search(query: string, searchOptions?: AddressSearchOptions) {
      const q = query.trim()
      if (q.length < GOOGLE_PLACES_MIN_QUERY_LENGTH) return []

      const token = ensureSession(searchOptions?.sessionToken)
      try {
        const data = (await invoke(
          {
            operation: 'autocomplete',
            query: q,
            sessionToken: token,
            languageCode: searchOptions?.language ?? 'pl',
            regionCode: 'PL',
            limit: searchOptions?.limit ?? 8,
          },
          searchOptions?.signal,
        )) as AutocompleteOk | ProxyErr

        if (!data || typeof data !== 'object' || !('ok' in data) || !data.ok) {
          throw new GooglePlacesProviderError(
            GOOGLE_USER_ERROR_PL,
            'provider_error',
          )
        }

        return Array.isArray(data.suggestions) ? data.suggestions : []
      } catch (err) {
        if (err instanceof GooglePlacesProviderError) {
          if (err.code === 'aborted') return []
          throw err
        }
        if (searchOptions?.signal?.aborted) return []
        throw new GooglePlacesProviderError(
          GOOGLE_USER_ERROR_PL,
          'network',
        )
      }
    },

    async resolve(id: string, resolveOptions?: AddressSearchOptions) {
      const rawId = id.trim()
      if (rawId.startsWith('manual:')) {
        this.endSession?.()
        return {
          formattedAddress: rawId.replace(/^manual:/, '').trim(),
          provider: 'google',
        }
      }

      const placeId = rawId.replace(/^google:/, '')
      const token = ensureSession(resolveOptions?.sessionToken)

      try {
        const data = (await invoke(
          {
            operation: 'resolve',
            placeId,
            sessionToken: token,
            languageCode: resolveOptions?.language ?? 'pl',
            regionCode: 'PL',
          },
          resolveOptions?.signal,
        )) as ResolveOk | ProxyErr

        this.endSession?.()

        if (!data || typeof data !== 'object' || !('ok' in data) || !data.ok) {
          throw new GooglePlacesProviderError(
            GOOGLE_USER_ERROR_PL,
            'provider_error',
          )
        }

        return stripRawGoogleFields({
          ...data.address,
          provider: 'google',
        })
      } catch (err) {
        this.endSession?.()
        if (err instanceof GooglePlacesProviderError) throw err
        throw new GooglePlacesProviderError(GOOGLE_USER_ERROR_PL, 'network')
      }
    },
  }
}
