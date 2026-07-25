/**
 * routes-proxy — Google Routes API (computeRoutes) server-side proxy.
 * Secret: GOOGLE_MAPS_API_KEY (same as places-proxy).
 */

export const ROUTES_PROXY_CONFIG = {
  computeRoutesUrl:
    'https://routes.googleapis.com/directions/v2:computeRoutes',
  fieldMask:
    'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
  languageCode: 'pl',
  units: 'METRIC',
  allowedTravelModes: ['DRIVE', 'WALK', 'BICYCLE', 'TWO_WHEELER'] as const,
  defaultTravelMode: 'DRIVE' as const,
  maxWaypoints: 8,
  providerTimeoutMs: 15_000,
  rateLimitWindowMs: 60_000,
  rateLimitMaxRequests: 40,
} as const

export type RoutesProxyOperation = 'computeRoute'
