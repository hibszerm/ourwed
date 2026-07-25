/**
 * Google Maps JavaScript API browser loader + TravelMap acceptance tests.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { decodeEncodedPolyline } from '@/services/decodeEncodedPolyline'
import {
  __googleMapsBrowserLoaderStateForTests,
  __resetGoogleMapsBrowserLoaderForTests,
  assertGoogleMapsBrowserKey,
  getGoogleMapsBrowserConfig,
  GoogleMapsBrowserError,
} from '@/services/googleMapsBrowserLoader'

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

function run(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => console.log(`PASS  ${name}`))
    .catch((err) => {
      console.error(`FAIL  ${name}`)
      console.error(err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
}

async function main() {
  await run('1–2. Loader initializes once + lazy libraries', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/services/googleMapsBrowserLoader.ts'),
      'utf8',
    )
    assert(src.includes('setOptions'), 'setOptions')
    assert(src.includes('importLibrary'), 'importLibrary')
    assert(src.includes("importLibrary('maps')"), 'maps lazy')
    assert(src.includes('optionsApplied'), 'singleton')
    assert(src.includes('mapsLibraryPromise'), 'promise cache')
  })

  await run('3. Missing key returns controlled error', () => {
    __resetGoogleMapsBrowserLoaderForTests()
    let caught: unknown
    try {
      assertGoogleMapsBrowserKey({ VITE_GOOGLE_MAPS_BROWSER_KEY: '' })
    } catch (err) {
      caught = err
    }
    assert(caught instanceof GoogleMapsBrowserError, 'typed error')
    assertEq(
      (caught as GoogleMapsBrowserError).code,
      'missing_key',
      'missing_key',
    )
    assert(
      (caught as Error).message.includes('skonfigurowana'),
      'pl message',
    )
  })

  await run('4. API key is never logged', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/services/googleMapsBrowserLoader.ts'),
      'utf8',
    )
    assert(!src.includes('console.log'), 'no console.log')
    assert(!src.includes('console.info'), 'no console.info')
    assert(!src.includes('console.debug'), 'no console.debug')
    const map = readFileSync(
      resolve(process.cwd(), 'src/features/travel/TravelMap.tsx'),
      'utf8',
    )
    assert(!map.includes('console.log'), 'map no log')
  })

  await run('5–6. Multiple mounts reuse loader; Strict Mode safe', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/services/googleMapsBrowserLoader.ts'),
      'utf8',
    )
    assert(src.includes('if (!mapsLibraryPromise)'), 'reuse promise')
    assert(src.includes('__resetGoogleMapsBrowserLoaderForTests'), 'test reset')
    __resetGoogleMapsBrowserLoaderForTests()
    assertEq(
      __googleMapsBrowserLoaderStateForTests().optionsApplied,
      false,
      'reset',
    )
  })

  await run('7. Optional map ID applied when configured', () => {
    const cfg = getGoogleMapsBrowserConfig({
      VITE_GOOGLE_MAPS_BROWSER_KEY: 'test-key',
      VITE_GOOGLE_MAPS_MAP_ID: 'demo-map-id',
    })
    assertEq(cfg.mapId, 'demo-map-id', 'map id')
    const empty = getGoogleMapsBrowserConfig({
      VITE_GOOGLE_MAPS_BROWSER_KEY: 'test-key',
      VITE_GOOGLE_MAPS_MAP_ID: '',
    })
    assertEq(empty.mapId, null, 'no map id')
    const map = readFileSync(
      resolve(process.cwd(), 'src/features/travel/TravelMap.tsx'),
      'utf8',
    )
    assert(map.includes('mapId'), 'applies mapId')
  })

  await run('map: TravelMap uses Google loader, not MapLibre', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/features/travel/TravelMap.tsx'),
      'utf8',
    )
    assert(src.includes('loadGoogleMapsLibrary'), 'loader')
    assert(!src.includes('maplibre'), 'no maplibre')
    assert(!src.includes('openstreetmap'), 'no osm')
    assert(src.includes('decodeEncodedPolyline'), 'polyline')
    assert(!src.includes('DirectionsService'), 'no browser directions')
    assert(!src.includes('computeGoogleRoute'), 'no route recalc')
  })

  await run('map: markers from coordinates; polyline from RouteResult', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/features/travel/TravelMap.tsx'),
      'utf8',
    )
    assert(src.includes('encodedPolyline'), 'prop')
    assert(src.includes('stopsWithCoordinates'), 'coords')
    assert(src.includes('Polyline'), 'polyline overlay')
    assert(src.includes('fitBounds'), 'fitBounds')
    assert(src.includes('SINGLE_ZOOM') || src.includes('setZoom'), 'single zoom')
  })

  await run('map: empty / missing key / error states', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/features/travel/TravelMap.tsx'),
      'utf8',
    )
    assert(src.includes('Brak współrzędnych'), 'empty')
    assert(src.includes('nie została skonfigurowana'), 'missing key')
    assert(src.includes('Nie udało się wczytać mapy'), 'load error')
    assert(src.includes('gestureHandling'), 'cooperative gestures')
  })

  await run('map: cleanup + attribution not covered', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/features/travel/TravelMap.tsx'),
      'utf8',
    )
    assert(src.includes('setMap(null)'), 'cleanup markers')
    const css = readFileSync(
      resolve(process.cwd(), 'src/features/travel/TravelMap.module.css'),
      'utf8',
    )
    assert(css.includes('Do not cover Google Maps attribution'), 'attr note')
    assert(css.includes('max-width: 100%'), 'no overflow')
  })

  await run('polyline decoder deterministic', () => {
    // Encoded for (38.5, -120.2), (40.7, -120.95), (43.252, -126.453)
    const path = decodeEncodedPolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
    assert(path.length === 3, '3 points')
    assert(Math.abs(path[0].lat - 38.5) < 0.001, 'lat0')
    assert(Math.abs(path[0].lng - -120.2) < 0.001, 'lng0')
    assertEq(decodeEncodedPolyline('').length, 0, 'empty')
  })

  await run('repo guard: no MapLibre/OSM in active src runtime', () => {
    const forbidden = [
      'maplibre-gl',
      'from \'maplibre',
      'from "maplibre',
      'tile.openstreetmap.org',
    ]
    const files = [
      'src/features/travel/TravelMap.tsx',
      'src/features/weddings/components/detail/WeddingDetailTravel.tsx',
      'src/services/travelProvider.ts',
      'package.json',
    ]
    for (const rel of files) {
      const src = readFileSync(resolve(process.cwd(), rel), 'utf8')
      for (const token of forbidden) {
        assert(!src.includes(token), `${rel} must not include ${token}`)
      }
    }
    const pkg = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
    assert(!pkg.includes('"maplibre-gl"'), 'dep removed')
    assert(pkg.includes('@googlemaps/js-api-loader'), 'loader dep')
  })

  await run('env example documents browser key', () => {
    const env = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8')
    const line = env
      .split(/\r?\n/)
      .find((l) => l.startsWith('VITE_GOOGLE_MAPS_BROWSER_KEY='))
    assert(line === 'VITE_GOOGLE_MAPS_BROWSER_KEY=', 'empty placeholder')
    assert(!env.includes('VITE_GEOAPIFY'), 'no geoapify')
  })

  await run('server key not used by TravelMap', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/features/travel/TravelMap.tsx'),
      'utf8',
    )
    assert(!src.includes('GOOGLE_MAPS_API_KEY'), 'no server secret')
    assert(!src.includes('places-proxy'), 'no places from map')
    assert(!src.includes('routes-proxy'), 'no routes from map')
  })

  console.log('\ngoogle maps browser acceptance: done')
}

main()
