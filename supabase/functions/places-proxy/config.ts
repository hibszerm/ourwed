/**
 * places-proxy — Google Places API (New) server-side proxy.
 * Secret: GOOGLE_MAPS_API_KEY (Supabase Edge secrets only).
 */

export const PLACES_PROXY_CONFIG = {
  autocompleteUrl: 'https://places.googleapis.com/v1/places:autocomplete',
  placeDetailsBaseUrl: 'https://places.googleapis.com/v1/places',
  minQueryLength: 3,
  maxQueryLength: 200,
  maxLimit: 8,
  defaultLimit: 8,
  languageCode: 'pl',
  regionCode: 'PL',
  /** Autocomplete (New) field mask — place predictions only. */
  autocompleteFieldMask: [
    'suggestions.placePrediction.placeId',
    'suggestions.placePrediction.text',
    'suggestions.placePrediction.structuredFormat',
  ].join(','),
  /**
   * Place Details (New) — address essentials + displayName/types for venue names.
   * displayName is required so establishment names (e.g. Villa Love) survive resolve.
   */
  placeDetailsFieldMask: [
    'id',
    'formattedAddress',
    'addressComponents',
    'location',
    'displayName',
    'types',
  ].join(','),
  providerTimeoutMs: 12_000,
  /** Simple in-memory rate limit per client key (IP / anon). */
  rateLimitWindowMs: 60_000,
  rateLimitMaxRequests: 60,
} as const

export type PlacesProxyOperation = 'autocomplete' | 'resolve' | 'geocode'
