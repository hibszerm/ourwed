/**
 * routes-proxy Edge Function
 *
 * Narrow operation: computeRoute
 * Key stays server-side (GOOGLE_MAPS_API_KEY).
 */

import { ROUTES_PROXY_CONFIG, type RoutesProxyOperation } from './config.ts'
import {
  googleComputeRoute,
  RoutesClientError,
  type RouteEndpoint,
} from './googleRoutesClient.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type PublicErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'rate_limited'
  | 'provider_error'
  | 'unsupported_operation'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(
  code: PublicErrorCode,
  message: string,
  status: number,
): Response {
  return jsonResponse({ ok: false, error: { code, message } }, status)
}

const USER_HINT =
  'Nie udało się wyliczyć trasy. Spróbuj ponownie lub sprawdź lokalizacje.'

interface RateBucket {
  count: number
  resetAt: number
}

const rateBuckets = new Map<string, RateBucket>()

function clientKey(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('apikey')?.slice(0, 16) ||
    'anonymous'
  )
}

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, {
      count: 1,
      resetAt: now + ROUTES_PROXY_CONFIG.rateLimitWindowMs,
    })
    return true
  }
  if (bucket.count >= ROUTES_PROXY_CONFIG.rateLimitMaxRequests) return false
  bucket.count += 1
  return true
}

function isSupportedOperation(value: unknown): value is RoutesProxyOperation {
  return value === 'computeRoute'
}

function parseEndpoint(value: unknown, label: string): RouteEndpoint | Response {
  if (!value || typeof value !== 'object') {
    return errorResponse('bad_request', `${label} is required`, 400)
  }
  const row = value as Record<string, unknown>
  const endpoint: RouteEndpoint = {}
  if (typeof row.latitude === 'number') endpoint.latitude = row.latitude
  if (typeof row.longitude === 'number') endpoint.longitude = row.longitude
  if (typeof row.placeId === 'string') endpoint.placeId = row.placeId
  if (typeof row.address === 'string') endpoint.address = row.address

  const hasCoords =
    typeof endpoint.latitude === 'number' &&
    typeof endpoint.longitude === 'number' &&
    Number.isFinite(endpoint.latitude) &&
    Number.isFinite(endpoint.longitude)
  const hasPlace = !!endpoint.placeId?.trim()
  const hasAddress = !!endpoint.address?.trim()
  if (!hasCoords && !hasPlace && !hasAddress) {
    return errorResponse(
      'bad_request',
      `${label} needs coordinates, placeId, or address`,
      400,
    )
  }
  if (
    endpoint.placeId?.includes('://') ||
    endpoint.address?.includes('routes.googleapis.com')
  ) {
    return errorResponse(
      'unsupported_operation',
      'Arbitrary Google URLs are not allowed',
      400,
    )
  }
  return endpoint
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return errorResponse('bad_request', 'Method not allowed', 405)
  }

  const auth = req.headers.get('Authorization')
  const apikey = req.headers.get('apikey')
  if (!auth && !apikey) {
    return errorResponse('unauthorized', 'Missing Authorization', 401)
  }

  if (!checkRateLimit(clientKey(req))) {
    return errorResponse('rate_limited', USER_HINT, 429)
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return errorResponse('bad_request', 'Invalid JSON body', 400)
  }

  const allowedKeys = new Set([
    'operation',
    'origin',
    'destination',
    'travelMode',
    'waypoints',
  ])
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      return errorResponse(
        'unsupported_operation',
        `Unsupported field: ${key}`,
        400,
      )
    }
  }

  if (!isSupportedOperation(body.operation)) {
    return errorResponse(
      'unsupported_operation',
      'operation must be computeRoute',
      400,
    )
  }

  const origin = parseEndpoint(body.origin, 'origin')
  if (origin instanceof Response) return origin
  const destination = parseEndpoint(body.destination, 'destination')
  if (destination instanceof Response) return destination

  let travelMode = ROUTES_PROXY_CONFIG.defaultTravelMode
  if (typeof body.travelMode === 'string' && body.travelMode.trim()) {
    const mode = body.travelMode.trim().toUpperCase()
    if (
      !(ROUTES_PROXY_CONFIG.allowedTravelModes as readonly string[]).includes(
        mode,
      )
    ) {
      return errorResponse('bad_request', 'Invalid travelMode', 400)
    }
    travelMode = mode as typeof travelMode
  }

  const waypoints: RouteEndpoint[] = []
  if (body.waypoints != null) {
    if (!Array.isArray(body.waypoints)) {
      return errorResponse('bad_request', 'waypoints must be an array', 400)
    }
    if (body.waypoints.length > ROUTES_PROXY_CONFIG.maxWaypoints) {
      return errorResponse('bad_request', 'Too many waypoints', 400)
    }
    for (let i = 0; i < body.waypoints.length; i += 1) {
      const wp = parseEndpoint(body.waypoints[i], `waypoints[${i}]`)
      if (wp instanceof Response) return wp
      waypoints.push(wp)
    }
  }

  try {
    const route = await googleComputeRoute({
      origin,
      destination,
      travelMode,
      intermediateWaypoints: waypoints,
    })
    return jsonResponse({ ok: true, operation: 'computeRoute', route })
  } catch (err) {
    if (err instanceof RoutesClientError) {
      const status =
        err.code === 'bad_request'
          ? 400
          : err.code === 'quota_exceeded' || err.code === 'provider_rate_limit'
            ? 429
            : err.code === 'zero_results'
              ? 404
              : 502
      return errorResponse('provider_error', USER_HINT, status)
    }
    console.error('routes-proxy unexpected error')
    return errorResponse('provider_error', USER_HINT, 502)
  }
})
