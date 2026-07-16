/**
 * Geoapify REST client (OpenStreetMap-based).
 * API key: VITE_GEOAPIFY_API_KEY
 *
 * Geocoding / routing endpoints return GeoJSON FeatureCollection
 * ({ type, features }) — never { results }.
 */

const GEOAPIFY_BASE = 'https://api.geoapify.com'

export type GeoapifyErrorCode =
  | 'config'
  | 'not_found'
  | 'network'
  | 'invalid_key'
  | 'unauthorized'
  | 'bad_request'
  | 'invalid_response'
  | 'route_failed'
  | 'unknown'

export class GeoapifyError extends Error {
  readonly code: GeoapifyErrorCode

  constructor(message: string, code: GeoapifyErrorCode = 'unknown') {
    super(message)
    this.name = 'GeoapifyError'
    this.code = code
  }
}

export interface GeoapifyPlaceResult {
  placeId: string | null
  formatted: string
  lat: number
  lon: number
  addressLine1?: string
  addressLine2?: string
}

export interface GeoapifyRouteResult {
  distanceMeters: number
  durationSeconds: number
}

interface GeoapifyFeatureProperties {
  place_id?: string | number
  formatted?: string
  lat?: number
  lon?: number
  address_line1?: string
  address_line2?: string
  distance?: number
  time?: number
}

interface GeoapifyFeature {
  properties?: GeoapifyFeatureProperties
  geometry?: {
    type?: string
    /** GeoJSON Position: [lon, lat] */
    coordinates?: number[]
  }
}

interface GeoapifyFeatureCollection {
  type?: string
  features?: GeoapifyFeature[]
  error?: string
  message?: string
}

function apiKey(): string {
  const key = import.meta.env.VITE_GEOAPIFY_API_KEY
  if (typeof key !== 'string' || !key.trim()) {
    throw new GeoapifyError(
      'Brak konfiguracji lokalizacji (VITE_GEOAPIFY_API_KEY).',
      'config',
    )
  }
  return key.trim()
}

function mapFeature(feature: GeoapifyFeature): GeoapifyPlaceResult | null {
  const props = feature.properties ?? {}
  let lat = props.lat
  let lon = props.lon

  const coords = feature.geometry?.coordinates
  if (
    (lat == null ||
      lon == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)) &&
    Array.isArray(coords) &&
    coords.length >= 2
  ) {
    lon = coords[0]
    lat = coords[1]
  }

  if (
    lat == null ||
    lon == null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null
  }

  const formatted =
    props.formatted?.trim() || props.address_line1?.trim() || ''

  return {
    placeId: props.place_id != null ? String(props.place_id) : null,
    formatted,
    lat,
    lon,
    addressLine1: props.address_line1,
    addressLine2: props.address_line2,
  }
}

function statusToError(status: number, bodyMessage?: string): GeoapifyError {
  if (status === 401 || status === 403) {
    return new GeoapifyError(
      'Nieprawidłowy lub niedozwolony klucz API lokalizacji.',
      'invalid_key',
    )
  }
  if (status === 400) {
    return new GeoapifyError(
      bodyMessage?.trim() || 'Nieprawidłowe żądanie do serwisu lokalizacji.',
      'bad_request',
    )
  }
  if (status >= 500) {
    return new GeoapifyError(
      'Serwis lokalizacji jest chwilowo niedostępny. Spróbuj ponownie.',
      'network',
    )
  }
  return new GeoapifyError(
    bodyMessage?.trim() || `Błąd serwisu lokalizacji (${status}).`,
    'unknown',
  )
}

async function getFeatureCollection(
  url: URL,
): Promise<GeoapifyFeatureCollection> {
  let res: Response
  try {
    res = await fetch(url.toString())
  } catch {
    throw new GeoapifyError(
      'Brak połączenia z serwisem lokalizacji. Sprawdź sieć i spróbuj ponownie.',
      'network',
    )
  }

  let data: GeoapifyFeatureCollection
  try {
    data = (await res.json()) as GeoapifyFeatureCollection
  } catch {
    if (!res.ok) throw statusToError(res.status)
    throw new GeoapifyError(
      'Nieprawidłowa odpowiedź serwisu lokalizacji.',
      'invalid_response',
    )
  }

  if (!res.ok) {
    throw statusToError(res.status, data.error || data.message)
  }

  return data
}

export const geoapifyService = {
  /** Address / place autocomplete suggestions. */
  async searchPlaces(query: string): Promise<GeoapifyPlaceResult[]> {
    const text = query.trim()
    if (text.length < 2) return []

    const url = new URL(`${GEOAPIFY_BASE}/v1/geocode/autocomplete`)
    url.searchParams.set('text', text)
    url.searchParams.set('apiKey', apiKey())
    url.searchParams.set('limit', '6')
    url.searchParams.set('lang', 'pl')
    url.searchParams.set('filter', 'countrycode:pl')

    const data = await getFeatureCollection(url)
    return (data.features ?? [])
      .map(mapFeature)
      .filter((r): r is GeoapifyPlaceResult => r != null)
  },

  /** Forward geocode a full address string. */
  async geocode(address: string): Promise<GeoapifyPlaceResult> {
    const text = address.trim()
    if (!text) {
      throw new GeoapifyError('Adres jest wymagany.', 'bad_request')
    }

    const url = new URL(`${GEOAPIFY_BASE}/v1/geocode/search`)
    url.searchParams.set('text', text)
    url.searchParams.set('apiKey', apiKey())
    url.searchParams.set('limit', '1')
    url.searchParams.set('lang', 'pl')
    url.searchParams.set('filter', 'countrycode:pl')

    const data = await getFeatureCollection(url)
    const features = data.features ?? []
    if (features.length === 0) {
      throw new GeoapifyError(
        'Nie znaleziono lokalizacji dla adresu.',
        'not_found',
      )
    }

    const hit = mapFeature(features[0])
    if (!hit) {
      throw new GeoapifyError(
        'Nieprawidłowa odpowiedź serwisu lokalizacji (brak współrzędnych).',
        'invalid_response',
      )
    }
    return hit
  },

  /** Reverse geocode coordinates to an address. */
  async reverseGeocode(
    lat: number,
    lng: number,
  ): Promise<GeoapifyPlaceResult> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new GeoapifyError('Nieprawidłowe współrzędne.', 'bad_request')
    }

    const url = new URL(`${GEOAPIFY_BASE}/v1/geocode/reverse`)
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
    url.searchParams.set('apiKey', apiKey())
    url.searchParams.set('lang', 'pl')

    const data = await getFeatureCollection(url)
    const features = data.features ?? []
    if (features.length === 0) {
      throw new GeoapifyError(
        'Nie znaleziono adresu dla współrzędnych.',
        'not_found',
      )
    }

    const hit = mapFeature(features[0])
    if (!hit) {
      throw new GeoapifyError(
        'Nieprawidłowa odpowiedź serwisu lokalizacji (brak współrzędnych).',
        'invalid_response',
      )
    }
    return hit
  },

  /** Drive route between two points (lat/lng). */
  async route(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
  ): Promise<GeoapifyRouteResult> {
    const url = new URL(`${GEOAPIFY_BASE}/v1/routing`)
    url.searchParams.set(
      'waypoints',
      `${origin.lat},${origin.lng}|${destination.lat},${destination.lng}`,
    )
    url.searchParams.set('mode', 'drive')
    url.searchParams.set('apiKey', apiKey())

    const data = await getFeatureCollection(url)
    const props = data.features?.[0]?.properties
    const distanceMeters = props?.distance
    const durationSeconds = props?.time
    if (
      distanceMeters == null ||
      durationSeconds == null ||
      !Number.isFinite(distanceMeters) ||
      !Number.isFinite(durationSeconds)
    ) {
      throw new GeoapifyError(
        'Nie udało się wyliczyć trasy.',
        'route_failed',
      )
    }
    return {
      distanceMeters: Math.round(distanceMeters),
      durationSeconds: Math.round(durationSeconds),
    }
  },
}
