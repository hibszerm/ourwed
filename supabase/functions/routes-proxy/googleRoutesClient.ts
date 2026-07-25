import { ROUTES_PROXY_CONFIG } from './config.ts'
import {
  mapGoogleRouteToResult,
  type ProxyRouteResult,
} from './normalize.ts'

export type RoutesClientErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'provider_rate_limit'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'quota_exceeded'
  | 'request_denied'
  | 'zero_results'
  | 'invalid_key'

export class RoutesClientError extends Error {
  readonly code: RoutesClientErrorCode
  readonly httpStatus: number

  constructor(
    message: string,
    code: RoutesClientErrorCode,
    httpStatus: number,
  ) {
    super(message)
    this.name = 'RoutesClientError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

export interface RouteEndpoint {
  latitude?: number
  longitude?: number
  placeId?: string
  address?: string
}

function apiKey(): string {
  const key = Deno.env.get('GOOGLE_MAPS_API_KEY')?.trim()
  if (!key) {
    throw new RoutesClientError(
      'Google Routes is not configured.',
      'unauthorized',
      500,
    )
  }
  return key
}

function mapGoogleHttpError(status: number, bodyText: string): RoutesClientError {
  const lower = bodyText.toLowerCase()
  if (status === 429 || lower.includes('resource_exhausted')) {
    return new RoutesClientError('Quota exceeded.', 'quota_exceeded', 429)
  }
  if (
    status === 403 ||
    lower.includes('permission_denied') ||
    lower.includes('request_denied')
  ) {
    return new RoutesClientError('Request denied.', 'request_denied', 403)
  }
  if (status === 401 || lower.includes('api key') || lower.includes('api_key')) {
    return new RoutesClientError('Invalid API key.', 'invalid_key', 401)
  }
  if (status === 404 || lower.includes('not_found')) {
    return new RoutesClientError('Zero results.', 'zero_results', 404)
  }
  return new RoutesClientError(
    'Google Routes unavailable.',
    'provider_unavailable',
    status >= 400 && status < 600 ? status : 502,
  )
}

function toWaypoint(endpoint: RouteEndpoint): Record<string, unknown> {
  if (
    typeof endpoint.latitude === 'number' &&
    typeof endpoint.longitude === 'number' &&
    Number.isFinite(endpoint.latitude) &&
    Number.isFinite(endpoint.longitude)
  ) {
    return {
      location: {
        latLng: {
          latitude: endpoint.latitude,
          longitude: endpoint.longitude,
        },
      },
    }
  }
  const placeId = endpoint.placeId?.replace(/^google:/, '').trim()
  if (placeId) {
    return { placeId }
  }
  const address = endpoint.address?.trim()
  if (address) {
    return { address }
  }
  throw new RoutesClientError(
    'Endpoint requires coordinates, placeId, or address.',
    'bad_request',
    400,
  )
}

async function fetchGoogle(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    ROUTES_PROXY_CONFIG.providerTimeoutMs,
  )
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new RoutesClientError(
        'Google Routes timed out.',
        'provider_timeout',
        504,
      )
    }
    throw new RoutesClientError(
      'Network failure contacting Google Routes.',
      'provider_unavailable',
      502,
    )
  } finally {
    clearTimeout(timer)
  }
}

export async function googleComputeRoute(input: {
  origin: RouteEndpoint
  destination: RouteEndpoint
  travelMode?: string
  intermediateWaypoints?: RouteEndpoint[]
}): Promise<ProxyRouteResult> {
  const key = apiKey()
  const mode =
    input.travelMode &&
    (ROUTES_PROXY_CONFIG.allowedTravelModes as readonly string[]).includes(
      input.travelMode,
    )
      ? input.travelMode
      : ROUTES_PROXY_CONFIG.defaultTravelMode

  const waypoints = (input.intermediateWaypoints ?? []).slice(
    0,
    ROUTES_PROXY_CONFIG.maxWaypoints,
  )

  const body: Record<string, unknown> = {
    origin: toWaypoint(input.origin),
    destination: toWaypoint(input.destination),
    travelMode: mode,
    languageCode: ROUTES_PROXY_CONFIG.languageCode,
    units: ROUTES_PROXY_CONFIG.units,
    computeAlternativeRoutes: false,
  }
  if (waypoints.length > 0) {
    body.intermediates = waypoints.map(toWaypoint)
  }
  // TRAFFIC_AWARE only valid for DRIVE / TWO_WHEELER
  if (mode === 'DRIVE' || mode === 'TWO_WHEELER') {
    body.routingPreference = 'TRAFFIC_UNAWARE'
  }

  const res = await fetchGoogle(ROUTES_PROXY_CONFIG.computeRoutesUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': ROUTES_PROXY_CONFIG.fieldMask,
    },
    body: JSON.stringify(body),
  })

  const bodyText = await res.text()
  if (!res.ok) {
    throw mapGoogleHttpError(res.status, bodyText)
  }

  let data: { routes?: Array<Parameters<typeof mapGoogleRouteToResult>[0]> }
  try {
    data = JSON.parse(bodyText) as typeof data
  } catch {
    throw new RoutesClientError(
      'Invalid Google response.',
      'provider_unavailable',
      502,
    )
  }

  const route = data.routes?.[0]
  if (!route) {
    throw new RoutesClientError('Zero results.', 'zero_results', 404)
  }

  return mapGoogleRouteToResult(route)
}
