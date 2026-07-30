/**
 * Direct Google Maps navigation — full stored address, never Place ID pin.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildGoogleMapsNavigationUrl,
  resolveNavigationDestinationAddress,
  type NavigationDestination,
} from '@/services/googleMapsLinks'
import { navigateToStopUrl, type TravelStop } from '@/features/travel/travelUi'

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

function parseNav(url: string): URL {
  return new URL(url)
}

run('1. destination is full formatted address', () => {
  const url = buildGoogleMapsNavigationUrl({
    placeId: 'ChIJtest123',
    latitude: 52.2,
    longitude: 21.0,
    formattedAddress: 'Lwowska 34, 34-144 Izdebnik, Polska',
    label: 'Villa Love',
  })
  assert(!!url, 'url')
  const u = parseNav(url!)
  assertEq(
    u.searchParams.get('destination'),
    'Villa Love, Lwowska 34, 34-144 Izdebnik, Polska',
    'dest',
  )
  assert(!u.searchParams.has('destination_place_id'), 'no place id')
  assert(!u.searchParams.get('destination')!.includes('52.2'), 'no coords')
})

run('2. assembled street/postal/city when formattedAddress absent', () => {
  const text = resolveNavigationDestinationAddress({
    street: 'Lwowska',
    buildingNumber: '34',
    postalCode: '34-144',
    city: 'Izdebnik',
    country: 'Polska',
    label: 'Villa Love',
  })
  assertEq(
    text,
    'Villa Love, Lwowska 34, 34-144 Izdebnik, Polska',
    'assembled',
  )
})

run('3. postal code and city included', () => {
  const url = buildGoogleMapsNavigationUrl({
    street: 'ul. Długa',
    buildingNumber: '1',
    postalCode: '30-001',
    city: 'Kraków',
    country: 'Polska',
  })!
  assertEq(
    parseNav(url).searchParams.get('destination'),
    'ul. Długa 1, 30-001 Kraków, Polska',
    'parts',
  )
})

run('4. venue name does not replace postal address', () => {
  const text = resolveNavigationDestinationAddress({
    formattedAddress: 'Lwowska 34, 34-144 Izdebnik, Polska',
    label: 'Villa Love',
  })
  assert(text!.includes('Lwowska 34'), 'street kept')
  assert(text!.includes('Villa Love'), 'label prefix')
})

run('5–8. api, travelmode, dir_action; no origin/waypoints/place_id', () => {
  const url = buildGoogleMapsNavigationUrl({
    placeId: 'ChIJ',
    formattedAddress: 'A',
    latitude: 1,
    longitude: 2,
  })!
  const u = parseNav(url)
  assertEq(u.searchParams.get('api'), '1', 'api')
  assertEq(u.searchParams.get('travelmode'), 'driving', 'mode')
  assertEq(u.searchParams.get('dir_action'), 'navigate', 'dir')
  assert(!u.searchParams.has('origin'), 'no origin')
  assert(!u.searchParams.has('waypoints'), 'no waypoints')
  assert(!u.searchParams.has('destination_place_id'), 'no dest place id')
  assert(!u.searchParams.has('query_place_id'), 'no query place id')
  assertEq(u.searchParams.get('destination'), 'A', 'address not coords')
})

run('9. no coordinates when address exists', () => {
  const url = buildGoogleMapsNavigationUrl({
    formattedAddress: 'Kraków',
    latitude: 50,
    longitude: 19,
  })!
  assertEq(parseNav(url).searchParams.get('destination'), 'Kraków', 'addr')
})

run('10. coords-only without address returns null (disable Nawiguj)', () => {
  assertEq(
    buildGoogleMapsNavigationUrl({ latitude: 50, longitude: 19 }),
    null,
    'coords only',
  )
})

run('11. missing destination returns null', () => {
  assertEq(buildGoogleMapsNavigationUrl({}), null, 'empty')
  assertEq(
    buildGoogleMapsNavigationUrl({ formattedAddress: '   ' }),
    null,
    'blank',
  )
})

run('12. no API key', () => {
  const url = buildGoogleMapsNavigationUrl({
    formattedAddress: 'X',
    placeId: 'ChIJ',
  })!
  assert(!url.includes('key='), 'no key')
})

run('13. historical string-only address works', () => {
  const dest: NavigationDestination = {
    formattedAddress: 'Sala weselna XYZ (stary zapis)',
  }
  const url = buildGoogleMapsNavigationUrl(dest)
  assertEq(
    parseNav(url!).searchParams.get('destination'),
    'Sala weselna XYZ (stary zapis)',
    'legacy',
  )
})

run('14. navigateToStopUrl uses address, not place id', () => {
  const stop: TravelStop = {
    key: '1',
    title: 'Ceremonia',
    address: 'Kościół św. Anny, Kraków',
    label: 'Ceremonia',
    placeId: 'ChIJ1',
    latitude: 52,
    longitude: 21,
    kind: 'wedding_place',
    role: 'ceremony',
    navigateLabel: 'Nawiguj do ceremonii',
  }
  const url = navigateToStopUrl(stop)!
  const u = parseNav(url)
  assert(u.searchParams.get('destination')!.includes('Kościół'), 'address')
  assert(!u.searchParams.has('destination_place_id'), 'no place id')
  assert(!u.searchParams.get('destination')!.includes('52,'), 'no coords')
})

run('15. UI entry points use shared builder', () => {
  const files = [
    'src/features/weddings/components/detail/WeddingDetailTravel.tsx',
    'src/features/weddings/detail/v2/WeddingDayWorkspace.tsx',
    'src/features/weddings/detail/v2/WeddingOverviewEssentials.tsx',
    'src/features/travel/travelUi.ts',
  ]
  for (const file of files) {
    const src = readFileSync(resolve(process.cwd(), file), 'utf8')
    assert(
      src.includes('buildGoogleMapsNavigationUrl') ||
        src.includes('navigateToStopUrl'),
      `${file} uses shared util`,
    )
    assert(!src.includes('destination_place_id'), `${file} no place id param`)
  }
})

run('16. TravelMap / Routes unchanged (coords still used for markers)', () => {
  const map = readFileSync(
    resolve(process.cwd(), 'src/features/travel/TravelMap.tsx'),
    'utf8',
  )
  assert(map.includes('latitude') || map.includes('lat'), 'map coords')
  const routes = readFileSync(
    resolve(process.cwd(), 'src/services/travelProvider.ts'),
    'utf8',
  )
  assert(routes.includes('computeGoogleRoute') || routes.includes('lat'), 'routes')
})

console.log('\ngoogle maps navigation links: done')
