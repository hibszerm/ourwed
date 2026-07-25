/**
 * Shared Google Maps JavaScript API loader (browser-only).
 *
 * Uses VITE_GOOGLE_MAPS_BROWSER_KEY — never GOOGLE_MAPS_API_KEY (server secret).
 * Initializes once; libraries load lazily via importLibrary().
 */

import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

export type GoogleMapsBrowserErrorCode =
  | 'missing_key'
  | 'load_failed'
  | 'unknown'

export class GoogleMapsBrowserError extends Error {
  readonly code: GoogleMapsBrowserErrorCode

  constructor(message: string, code: GoogleMapsBrowserErrorCode) {
    super(message)
    this.name = 'GoogleMapsBrowserError'
    this.code = code
  }
}

export interface GoogleMapsBrowserConfig {
  apiKey: string
  mapId: string | null
  language: string
  region: string
}

let optionsApplied = false
let mapsLibraryPromise: Promise<google.maps.MapsLibrary> | null = null
let markerLibraryPromise: Promise<google.maps.MarkerLibrary> | null = null
let geometryLibraryPromise: Promise<google.maps.GeometryLibrary> | null = null

function readEnv(
  env: Record<string, string | undefined> = (
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env as Record<string, string | undefined>)
      : {}
  ),
): GoogleMapsBrowserConfig {
  const apiKey = (env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? '').trim()
  const mapId = (env.VITE_GOOGLE_MAPS_MAP_ID ?? '').trim() || null
  return {
    apiKey,
    mapId,
    language: 'pl',
    region: 'PL',
  }
}

export function getGoogleMapsBrowserConfig(
  env?: Record<string, string | undefined>,
): GoogleMapsBrowserConfig {
  return readEnv(env)
}

export function assertGoogleMapsBrowserKey(
  env?: Record<string, string | undefined>,
): string {
  const { apiKey } = readEnv(env)
  if (!apiKey) {
    throw new GoogleMapsBrowserError(
      'Mapa Google nie została skonfigurowana.',
      'missing_key',
    )
  }
  return apiKey
}

function applyOptionsOnce(env?: Record<string, string | undefined>): void {
  if (optionsApplied) return
  const config = readEnv(env)
  if (!config.apiKey) {
    throw new GoogleMapsBrowserError(
      'Mapa Google nie została skonfigurowana.',
      'missing_key',
    )
  }
  setOptions({
    key: config.apiKey,
    v: 'weekly',
    language: config.language,
    region: config.region,
    ...(config.mapId ? { mapIds: [config.mapId] } : {}),
  })
  optionsApplied = true
}

async function wrapLoad<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof GoogleMapsBrowserError) throw err
    throw new GoogleMapsBrowserError(
      'Nie udało się wczytać mapy. Spróbuj ponownie.',
      'load_failed',
    )
  }
}

/** Load the maps library (singleton). */
export function loadGoogleMapsLibrary(
  env?: Record<string, string | undefined>,
): Promise<google.maps.MapsLibrary> {
  applyOptionsOnce(env)
  if (!mapsLibraryPromise) {
    mapsLibraryPromise = wrapLoad(() => importLibrary('maps'))
  }
  return mapsLibraryPromise
}

/** Load the marker library when AdvancedMarkerElement is used. */
export function loadGoogleMarkerLibrary(
  env?: Record<string, string | undefined>,
): Promise<google.maps.MarkerLibrary> {
  applyOptionsOnce(env)
  if (!markerLibraryPromise) {
    markerLibraryPromise = wrapLoad(() => importLibrary('marker'))
  }
  return markerLibraryPromise
}

/** Optional geometry library (decodePath). */
export function loadGoogleGeometryLibrary(
  env?: Record<string, string | undefined>,
): Promise<google.maps.GeometryLibrary> {
  applyOptionsOnce(env)
  if (!geometryLibraryPromise) {
    geometryLibraryPromise = wrapLoad(() => importLibrary('geometry'))
  }
  return geometryLibraryPromise
}

/** Test helper — reset singleton state between isolated unit tests. */
export function __resetGoogleMapsBrowserLoaderForTests(): void {
  optionsApplied = false
  mapsLibraryPromise = null
  markerLibraryPromise = null
  geometryLibraryPromise = null
}

export function __googleMapsBrowserLoaderStateForTests(): {
  optionsApplied: boolean
  hasMapsPromise: boolean
} {
  return {
    optionsApplied,
    hasMapsPromise: mapsLibraryPromise != null,
  }
}
