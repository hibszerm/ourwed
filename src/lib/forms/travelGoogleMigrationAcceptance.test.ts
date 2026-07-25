/**
 * Travel module Google migration + legacy data compatibility.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { formatLocationAnswer } from '@/lib/forms/contractQuestionnaireSnapshot'
import { googleMapsDirectionsUrl, googleMapsPlaceUrl } from '@/services/googleMapsLinks'
import type { NormalizedAddress } from '@/services/addressAutocompleteProvider'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

run('travel LocationSearchField uses shared Google provider', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/travel/LocationSearchField.tsx'),
    'utf8',
  )
  assert(src.includes('createDefaultAddressAutocompleteProvider'), 'provider')
  assert(src.includes('Powered by Google'), 'attribution')
  assert(!src.includes('geoapify'), 'no geoapify')
})

run('travelProvider routes via Google Routes proxy', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/services/travelProvider.ts'),
    'utf8',
  )
  assert(src.includes('computeGoogleRoute'), 'routes')
  assert(src.includes("operation: 'geocode'"), 'geocode')
  assert(!src.includes('geoapify'), 'no geoapify')
})

run('travelService stores provider google', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/api/travelService.ts'),
    'utf8',
  )
  assert(src.includes("ROUTE_PROVIDER = 'google'"), 'google')
  assert(!src.includes("'geoapify'"), 'no geoapify const')
})

run('external Google Maps links have no API key', () => {
  const url = googleMapsDirectionsUrl([
    { latitude: 52.2, longitude: 21.0, address: 'A' },
    { latitude: 50.0, longitude: 19.9, address: 'B' },
  ])
  assert(!!url && url.includes('google.com/maps/dir'), 'dir url')
  assert(!url!.includes('key='), 'no key')
  const place = googleMapsPlaceUrl({
    placeId: 'ChIJ123',
    formattedAddress: 'Warszawa',
  })
  assert(!!place && place.includes('maps/search'), 'place url')
  assert(!place!.includes('key='), 'no key place')
})

run('legacy: historical Geoapify-normalized address still renders', () => {
  const legacy: NormalizedAddress = {
    formattedAddress: 'ul. Stara 1, Kraków',
    provider: 'geoapify',
    placeId: 'old-geo-id',
    latitude: 50.06,
    longitude: 19.94,
  }
  assertEq(formatLocationAnswer(legacy), 'ul. Stara 1, Kraków', 'legacy render')
})

run('legacy: formatted-address-only still renders', () => {
  assertEq(formatLocationAnswer('Sala weselna XYZ'), 'Sala weselna XYZ', 'string')
})

run('legacy: historical coordinates usable for routes (no bulk geocode)', () => {
  const travel = readFileSync(
    resolve(process.cwd(), 'src/lib/api/travelService.ts'),
    'utf8',
  )
  assert(travel.includes('originLat'), 'uses stored coords')
  assert(!travel.includes('for (const wedding of'), 'no bulk loop')
  const places = readFileSync(
    resolve(process.cwd(), 'src/lib/api/weddingPlaceService.ts'),
    'utf8',
  )
  assert(places.includes('getCoordinates'), 'resolve on write only')
})

run('editing saves Google metadata (LocationSearchField)', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/travel/LocationSearchField.tsx'),
    'utf8',
  )
  assert(src.includes("provider: 'google'"), 'writes google')
})

run('TravelMap uses Google Maps JS (no MapLibre/OSM)', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/travel/TravelMap.tsx'),
    'utf8',
  )
  assert(src.includes('googleMapsBrowserLoader') || src.includes('loadGoogleMapsLibrary'), 'loader')
  assert(src.includes('decodeEncodedPolyline'), 'polyline decode')
  assert(!src.includes('maplibre'), 'no maplibre')
  assert(!src.includes('openstreetmap'), 'no osm')
})

console.log('\ntravel google migration: done')
