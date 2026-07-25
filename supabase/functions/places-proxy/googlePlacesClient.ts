import { PLACES_PROXY_CONFIG } from './config.ts'
import {
  mapGooglePlaceToNormalized,
  mapGoogleSuggestionsToAddressSuggestions,
  sanitizeNormalizedAddress,
  type ProxyAddressSuggestion,
  type ProxyNormalizedAddress,
} from './normalize.ts'

export type PlacesClientErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'provider_rate_limit'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'quota_exceeded'
  | 'request_denied'
  | 'zero_results'
  | 'invalid_key'

export class PlacesClientError extends Error {
  readonly code: PlacesClientErrorCode
  readonly httpStatus: number

  constructor(
    message: string,
    code: PlacesClientErrorCode,
    httpStatus: number,
  ) {
    super(message)
    this.name = 'PlacesClientError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

function apiKey(): string {
  const key = Deno.env.get('GOOGLE_MAPS_API_KEY')?.trim()
  if (!key) {
    throw new PlacesClientError(
      'Google Places is not configured.',
      'unauthorized',
      500,
    )
  }
  return key
}

function mapGoogleHttpError(status: number, bodyText: string): PlacesClientError {
  const lower = bodyText.toLowerCase()
  if (status === 429 || lower.includes('resource_exhausted')) {
    return new PlacesClientError(
      'Quota exceeded.',
      'quota_exceeded',
      429,
    )
  }
  if (
    status === 403 ||
    lower.includes('request_denied') ||
    lower.includes('permission_denied')
  ) {
    return new PlacesClientError(
      'Request denied.',
      'request_denied',
      403,
    )
  }
  if (
    status === 400 &&
    (lower.includes('api key') || lower.includes('api_key'))
  ) {
    return new PlacesClientError('Invalid API key.', 'invalid_key', 401)
  }
  if (status === 401) {
    return new PlacesClientError('Invalid API key.', 'invalid_key', 401)
  }
  return new PlacesClientError(
    'Google Places unavailable.',
    'provider_unavailable',
    status >= 400 && status < 600 ? status : 502,
  )
}

async function fetchGoogle(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    PLACES_PROXY_CONFIG.providerTimeoutMs,
  )
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new PlacesClientError(
        'Google Places timed out.',
        'provider_timeout',
        504,
      )
    }
    throw new PlacesClientError(
      'Network failure contacting Google Places.',
      'provider_unavailable',
      502,
    )
  } finally {
    clearTimeout(timer)
  }
}

export async function googleAutocomplete(input: {
  query: string
  sessionToken: string
  languageCode?: string
  regionCode?: string
  limit?: number
}): Promise<ProxyAddressSuggestion[]> {
  const key = apiKey()
  const limit = Math.min(
    Math.max(1, input.limit ?? PLACES_PROXY_CONFIG.defaultLimit),
    PLACES_PROXY_CONFIG.maxLimit,
  )

  const res = await fetchGoogle(PLACES_PROXY_CONFIG.autocompleteUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': PLACES_PROXY_CONFIG.autocompleteFieldMask,
    },
    body: JSON.stringify({
      input: input.query,
      languageCode: input.languageCode ?? PLACES_PROXY_CONFIG.languageCode,
      regionCode: input.regionCode ?? PLACES_PROXY_CONFIG.regionCode,
      includeQueryPredictions: false,
      sessionToken: input.sessionToken,
    }),
  })

  const bodyText = await res.text()
  if (!res.ok) {
    throw mapGoogleHttpError(res.status, bodyText)
  }

  let data: { suggestions?: unknown[] }
  try {
    data = JSON.parse(bodyText) as { suggestions?: unknown[] }
  } catch {
    throw new PlacesClientError(
      'Invalid Google response.',
      'provider_unavailable',
      502,
    )
  }

  return mapGoogleSuggestionsToAddressSuggestions(
    data.suggestions as Parameters<
      typeof mapGoogleSuggestionsToAddressSuggestions
    >[0],
    limit,
  )
}

export async function googleResolvePlace(input: {
  placeId: string
  sessionToken?: string
  languageCode?: string
  regionCode?: string
}): Promise<ProxyNormalizedAddress> {
  const key = apiKey()
  const placeId = input.placeId.replace(/^google:/, '').trim()
  if (!placeId) {
    throw new PlacesClientError('placeId is required.', 'bad_request', 400)
  }

  const params = new URLSearchParams({
    languageCode: input.languageCode ?? PLACES_PROXY_CONFIG.languageCode,
    regionCode: input.regionCode ?? PLACES_PROXY_CONFIG.regionCode,
  })
  if (input.sessionToken) {
    params.set('sessionToken', input.sessionToken)
  }

  const url = `${PLACES_PROXY_CONFIG.placeDetailsBaseUrl}/${encodeURIComponent(placeId)}?${params}`

  const res = await fetchGoogle(url, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': PLACES_PROXY_CONFIG.placeDetailsFieldMask,
    },
  })

  const bodyText = await res.text()
  if (!res.ok) {
    throw mapGoogleHttpError(res.status, bodyText)
  }

  let place: Parameters<typeof mapGooglePlaceToNormalized>[0]
  try {
    place = JSON.parse(bodyText) as Parameters<
      typeof mapGooglePlaceToNormalized
    >[0]
  } catch {
    throw new PlacesClientError(
      'Invalid Google response.',
      'provider_unavailable',
      502,
    )
  }

  if (!place.formattedAddress && !place.id) {
    throw new PlacesClientError('Zero results.', 'zero_results', 404)
  }

  return sanitizeNormalizedAddress(mapGooglePlaceToNormalized(place))
}
