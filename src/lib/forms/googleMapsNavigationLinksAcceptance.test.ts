/**
 * Direct Google Maps navigation URL builder (current position → one destination).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildGoogleMapsNavigationUrl,
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

run('1. destination_place_id used when available', () => {
  const url = buildGoogleMapsNavigationUrl({
    placeId: 'ChIJtest123',
    latitude: 52.2,
    longitude: 21.0,
    formattedAddress: 'Warszawa',
  })
  assert(!!url, 'url')
  const u = parseNav(url!)
  assertEq(u.searchParams.get('destination_place_id'), 'ChIJtest123', 'place id')
  assertEq(u.searchParams.get('destination'), '52.2,21', 'coords dest')
})

run('2. coordinates used as destination fallback', () => {
  const url = buildGoogleMapsNavigationUrl({
    latitude: 50.0614,
    longitude: 19.9366,
  })
  assert(!!url, 'url')
  assertEq(parseNav(url!).searchParams.get('destination'), '50.0614,19.9366', 'coords')
  assert(!parseNav(url!).searchParams.has('destination_place_id'), 'no place id')
})

run('3. formatted address used as final fallback', () => {
  const url = buildGoogleMapsNavigationUrl({
    formattedAddress: 'Pałac Mała Wieś, Grójec',
  })
  assert(!!url, 'url')
  assertEq(
    parseNav(url!).searchParams.get('destination'),
    'Pałac Mała Wieś, Grójec',
    'address',
  )
})

run('4–5. origin and waypoints omitted', () => {
  const url = buildGoogleMapsNavigationUrl({
    placeId: 'ChIJ',
    formattedAddress: 'A',
  })!
  const u = parseNav(url)
  assert(!u.searchParams.has('origin'), 'no origin')
  assert(!u.searchParams.has('origin_place_id'), 'no origin_place_id')
  assert(!u.searchParams.has('waypoints'), 'no waypoints')
})

run('6–8. travelmode, dir_action, api=1', () => {
  const url = buildGoogleMapsNavigationUrl({
    formattedAddress: 'Kraków',
  })!
  const u = parseNav(url)
  assertEq(u.searchParams.get('travelmode'), 'driving', 'mode')
  assertEq(u.searchParams.get('dir_action'), 'navigate', 'dir_action')
  assertEq(u.searchParams.get('api'), '1', 'api')
  assert(u.pathname.includes('/maps/dir'), 'dir path')
})

run('9. address URL-encoded correctly', () => {
  const url = buildGoogleMapsNavigationUrl({
    formattedAddress: 'ul. Długa 1, Kraków',
  })!
  assert(url.includes('D%C5%82uga') || url.includes(encodeURIComponent('Długa')), 'encoded')
  // URLSearchParams encodes via toString
  assert(!url.includes('ul. Długa 1'), 'raw space not unescaped in href incorrectly')
  assertEq(
    parseNav(url).searchParams.get('destination'),
    'ul. Długa 1, Kraków',
    'decoded param',
  )
})

run('10. no API key in URL', () => {
  const url = buildGoogleMapsNavigationUrl({
    placeId: 'ChIJ',
    latitude: 1,
    longitude: 2,
    formattedAddress: 'X',
  })!
  assert(!url.includes('key='), 'no key')
  assert(!url.toLowerCase().includes('apikey'), 'no apikey')
})

run('11. missing destination returns null', () => {
  assertEq(buildGoogleMapsNavigationUrl({}), null, 'empty')
  assertEq(
    buildGoogleMapsNavigationUrl({ formattedAddress: '   ' }),
    null,
    'blank',
  )
})

run('12. historical string-only address works', () => {
  const dest: NavigationDestination = {
    formattedAddress: 'Sala weselna XYZ (stary zapis)',
  }
  const url = buildGoogleMapsNavigationUrl(dest)
  assert(!!url, 'url')
  assertEq(
    parseNav(url!).searchParams.get('destination'),
    'Sala weselna XYZ (stary zapis)',
    'legacy string',
  )
})

run('google: prefix stripped from placeId', () => {
  const url = buildGoogleMapsNavigationUrl({
    placeId: 'google:ChIJabc',
    formattedAddress: 'Test',
  })!
  assertEq(
    parseNav(url).searchParams.get('destination_place_id'),
    'ChIJabc',
    'stripped',
  )
})

run('navigateToStopUrl delegates to builder', () => {
  const stop: TravelStop = {
    key: '1',
    title: 'Ceremonia',
    address: 'Kościół',
    placeId: 'ChIJ1',
    latitude: 52,
    longitude: 21,
    kind: 'wedding_place',
    role: 'ceremony',
    navigateLabel: 'Nawiguj do ceremonii',
  }
  const url = navigateToStopUrl(stop)
  assert(!!url, 'url')
  assert(url!.includes('dir_action=navigate'), 'navigate')
})

run('UI: Travel builds nav via shared util (not inline concatenation)', () => {
  const travel = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/components/detail/WeddingDetailTravel.tsx',
    ),
    'utf8',
  )
  assert(travel.includes('navigateToStopUrl'), 'uses navigateToStopUrl')
  assert(!travel.includes('google.com/maps/dir/?api'), 'no hardcoded concat')
  assert(travel.includes('noopener noreferrer'), 'noopener')
  assert(travel.includes('target="_blank"'), 'new tab')
})

run('UI: bride/groom/ceremony/reception nav actions present', () => {
  const travel = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/components/detail/WeddingDetailTravel.tsx',
    ),
    'utf8',
  )
  const ui = readFileSync(
    resolve(process.cwd(), 'src/features/travel/travelUi.ts'),
    'utf8',
  )
  assert(ui.includes('Nawiguj do przygotowań Panny Młodej'), 'bride aria')
  assert(ui.includes('Nawiguj do przygotowań Pana Młodego'), 'groom aria')
  assert(ui.includes('Nawiguj do ceremonii'), 'ceremony aria')
  assert(ui.includes('Nawiguj na przyjęcie weselne'), 'reception aria')
  assert(travel.includes('data-testid={`travel-nav-${stop.role'), 'testid')
  assert(travel.includes('Nawiguj'), 'nawiguj label')
  assert(!travel.includes('Otwórz pełną trasę'), 'full route removed from UI')
})

console.log('\ngoogle maps navigation links: done')
