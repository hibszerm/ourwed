/**
 * places-proxy Edge Function
 *
 * Narrow operations only: autocomplete | resolve
 * Key stays server-side (GOOGLE_MAPS_API_KEY).
 * Public questionnaire clients may call with the Supabase anon key.
 */

import { PLACES_PROXY_CONFIG, type PlacesProxyOperation } from './config.ts'
import {
  googleAutocomplete,
  googleResolvePlace,
  PlacesClientError,
} from './googlePlacesClient.ts'

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

/** Calm Polish message — never leak Google payloads. */
const USER_HINT =
  'Nie udało się pobrać podpowiedzi. Możesz wpisać adres ręcznie.'

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
      resetAt: now + PLACES_PROXY_CONFIG.rateLimitWindowMs,
    })
    return true
  }
  if (bucket.count >= PLACES_PROXY_CONFIG.rateLimitMaxRequests) {
    return false
  }
  bucket.count += 1
  return true
}

function isSupportedOperation(value: unknown): value is PlacesProxyOperation {
  return (
    value === 'autocomplete' || value === 'resolve' || value === 'geocode'
  )
}

function newSessionToken(): string {
  return crypto.randomUUID()
}

function requireAuth(req: Request): Response | null {
  const auth = req.headers.get('Authorization')
  const apikey = req.headers.get('apikey')
  if (!auth && !apikey) {
    return errorResponse('unauthorized', 'Missing Authorization', 401)
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('bad_request', 'Method not allowed', 405)
  }

  const authErr = requireAuth(req)
  if (authErr) return authErr

  if (!checkRateLimit(clientKey(req))) {
    return errorResponse(
      'rate_limited',
      USER_HINT,
      429,
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return errorResponse('bad_request', 'Invalid JSON body', 400)
  }

  // Reject arbitrary Google passthrough / extra ops.
  const allowedKeys = new Set([
    'operation',
    'query',
    'placeId',
    'sessionToken',
    'languageCode',
    'regionCode',
    'limit',
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
      'operation must be autocomplete, resolve, or geocode',
      400,
    )
  }

  if (
    typeof body.languageCode === 'string' &&
    body.languageCode.trim() &&
    body.languageCode.trim().toLowerCase() !== 'pl'
  ) {
    // Allow only pl for now (product default). Still soft — empty uses config.
  }

  const languageCode =
    typeof body.languageCode === 'string' && body.languageCode.trim()
      ? body.languageCode.trim()
      : PLACES_PROXY_CONFIG.languageCode
  const regionCode =
    typeof body.regionCode === 'string' && body.regionCode.trim()
      ? body.regionCode.trim()
      : PLACES_PROXY_CONFIG.regionCode

  try {
    if (body.operation === 'autocomplete') {
      const query = typeof body.query === 'string' ? body.query.trim() : ''
      if (query.length < PLACES_PROXY_CONFIG.minQueryLength) {
        return errorResponse(
          'bad_request',
          `Query must be at least ${PLACES_PROXY_CONFIG.minQueryLength} characters`,
          400,
        )
      }
      if (query.length > PLACES_PROXY_CONFIG.maxQueryLength) {
        return errorResponse('bad_request', 'Query too long', 400)
      }
      const sessionToken =
        typeof body.sessionToken === 'string' ? body.sessionToken.trim() : ''
      if (!sessionToken || sessionToken.length > 36) {
        return errorResponse(
          'bad_request',
          'sessionToken is required (max 36 chars)',
          400,
        )
      }
      const limit =
        typeof body.limit === 'number' && Number.isFinite(body.limit)
          ? body.limit
          : PLACES_PROXY_CONFIG.defaultLimit

      const suggestions = await googleAutocomplete({
        query,
        sessionToken,
        languageCode,
        regionCode,
        limit,
      })

      return jsonResponse({
        ok: true,
        operation: 'autocomplete',
        suggestions,
      })
    }

    if (body.operation === 'geocode') {
      const query = typeof body.query === 'string' ? body.query.trim() : ''
      if (query.length < PLACES_PROXY_CONFIG.minQueryLength) {
        return errorResponse(
          'bad_request',
          `Query must be at least ${PLACES_PROXY_CONFIG.minQueryLength} characters`,
          400,
        )
      }
      const sessionToken =
        typeof body.sessionToken === 'string' && body.sessionToken.trim()
          ? body.sessionToken.trim()
          : newSessionToken()
      const suggestions = await googleAutocomplete({
        query,
        sessionToken,
        languageCode,
        regionCode,
        limit: 1,
      })
      if (suggestions.length === 0) {
        return errorResponse('provider_error', USER_HINT, 404)
      }
      const address = await googleResolvePlace({
        placeId: suggestions[0].id,
        sessionToken,
        languageCode,
        regionCode,
      })
      return jsonResponse({
        ok: true,
        operation: 'geocode',
        address,
      })
    }

    // resolve
    const placeId = typeof body.placeId === 'string' ? body.placeId.trim() : ''
    if (!placeId) {
      return errorResponse('bad_request', 'placeId is required', 400)
    }
    if (placeId.includes('://') || placeId.includes('places.googleapis.com')) {
      return errorResponse(
        'unsupported_operation',
        'Arbitrary Google URLs are not allowed',
        400,
      )
    }
    const sessionToken =
      typeof body.sessionToken === 'string'
        ? body.sessionToken.trim()
        : undefined

    const address = await googleResolvePlace({
      placeId,
      sessionToken: sessionToken || undefined,
      languageCode,
      regionCode,
    })

    return jsonResponse({
      ok: true,
      operation: 'resolve',
      address,
    })
  } catch (err) {
    if (err instanceof PlacesClientError) {
      const status =
        err.code === 'bad_request'
          ? 400
          : err.code === 'quota_exceeded' || err.code === 'provider_rate_limit'
            ? 429
            : err.code === 'invalid_key' || err.code === 'request_denied'
              ? 502
              : err.code === 'zero_results'
                ? 404
                : err.httpStatus || 502
      return errorResponse('provider_error', USER_HINT, status)
    }
    console.error('places-proxy unexpected error')
    return errorResponse('provider_error', USER_HINT, 502)
  }
})
