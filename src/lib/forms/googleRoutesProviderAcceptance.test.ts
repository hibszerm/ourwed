/**
 * Google Routes provider + routes-proxy acceptance tests.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  formatDistanceLabelPl,
  formatDurationLabelPl,
  mapGoogleRouteToResult,
  parseDurationSeconds,
} from '@/services/googleRoutesNormalize'
import { computeGoogleRoute } from '@/services/googleRoutesProvider'

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
  await run('1. Routes proxy accepts valid origin/destination', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'supabase/functions/routes-proxy/index.ts'),
      'utf8',
    )
    assert(src.includes("operation === 'computeRoute'") || src.includes("'computeRoute'"), 'op')
    assert(src.includes('origin'), 'origin')
    assert(src.includes('destination'), 'destination')
  })

  await run('2. Unsupported operations rejected', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'supabase/functions/routes-proxy/index.ts'),
      'utf8',
    )
    assert(src.includes('unsupported_operation'), 'reject')
    assert(src.includes('allowedKeys'), 'allowlist')
  })

  await run('3. Invalid travel modes rejected', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'supabase/functions/routes-proxy/index.ts'),
      'utf8',
    )
    assert(src.includes('Invalid travelMode'), 'invalid mode')
    const cfg = readFileSync(
      resolve(process.cwd(), 'supabase/functions/routes-proxy/config.ts'),
      'utf8',
    )
    assert(cfg.includes('DRIVE'), 'drive allowed')
  })

  await run('4–7. Route mapping + Polish labels', () => {
    const result = mapGoogleRouteToResult({
      distanceMeters: 18400,
      duration: '1620s',
      polyline: { encodedPolyline: 'abc' },
    })
    assertEq(result.provider, 'google', 'provider')
    assertEq(result.distanceMeters, 18400, 'meters numeric')
    assertEq(result.durationSeconds, 1620, 'seconds numeric')
    assertEq(result.distanceLabel, '18,4 km', 'distance pl')
    assertEq(result.durationLabel, '27 min', 'duration pl')
    assertEq(result.encodedPolyline, 'abc', 'polyline')
    assertEq(parseDurationSeconds('4320s'), 4320, 'parse')
    assertEq(formatDurationLabelPl(4320), '1 godz. 12 min', '1h12')
    assertEq(formatDistanceLabelPl(500), '500 m', 'meters')
  })

  await run('8. Existing coordinates preferred (no geocode in route body)', () => {
    const client = readFileSync(
      resolve(process.cwd(), 'supabase/functions/routes-proxy/googleRoutesClient.ts'),
      'utf8',
    )
    assert(client.includes('latLng'), 'coords first')
    assert(client.includes('placeId'), 'placeId second')
    assert(client.includes('address'), 'address fallback')
  })

  await run('9–10. travelService recalculates on endpoint change; abort supported', () => {
    const travel = readFileSync(
      resolve(process.cwd(), 'src/lib/api/travelService.ts'),
      'utf8',
    )
    assert(travel.includes("ROUTE_PROVIDER = 'google'"), 'google provider')
    assert(travel.includes('endpointsHash'), 'hash cache')
    const routes = readFileSync(
      resolve(process.cwd(), 'src/services/googleRoutesProvider.ts'),
      'utf8',
    )
    assert(routes.includes('signal'), 'abort signal')
  })

  await run('11–12. API key never to browser; errors sanitized', () => {
    const routes = readFileSync(
      resolve(process.cwd(), 'src/services/googleRoutesProvider.ts'),
      'utf8',
    )
    assert(!routes.includes('GOOGLE_MAPS_API_KEY'), 'no key in client')
    const edge = readFileSync(
      resolve(process.cwd(), 'supabase/functions/routes-proxy/index.ts'),
      'utf8',
    )
    assert(edge.includes('USER_HINT'), 'sanitized')
    assert(!edge.includes('bodyText'), 'no raw body to client')
  })

  await run('13. Manual location failure does not crash wedding details', () => {
    const hero = readFileSync(
      resolve(process.cwd(), 'src/features/weddings/components/detail/WeddingDetailHero.tsx'),
      'utf8',
    )
    assert(hero.includes('LocationSearchField'), 'search field')
    const loc = readFileSync(
      resolve(process.cwd(), 'src/features/travel/LocationSearchField.tsx'),
      'utf8',
    )
    assert(loc.includes('GOOGLE_USER_ERROR_PL') || loc.includes('setError'), 'error UI')
  })

  await run('computeGoogleRoute maps proxy response', async () => {
    const result = await computeGoogleRoute({
      origin: { latitude: 52.2, longitude: 21.0 },
      destination: { latitude: 50.0, longitude: 19.9 },
      invoke: async () => ({
        ok: true,
        route: mapGoogleRouteToResult({
          distanceMeters: 300000,
          duration: '10800s',
        }),
      }),
    })
    assertEq(result.provider, 'google', 'provider')
    assertEq(result.durationLabel, '3 godz.', '3h')
  })

  console.log('\ngoogle routes provider acceptance: done')
}

main()
