/**
 * TravelRouteTotals — shared totals for Dzień ślubu + Ankieta przedślubna.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildTravelFlow, summarizeTravelRoute } from '@/features/travel/travelUi'
import type {
  StudioTravelSettings,
  TravelPlan,
  TravelSegment,
  WeddingPlace,
} from '@/types/travel'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
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

function studio(): StudioTravelSettings {
  return {
    id: 's1',
    userId: 'u1',
    studioName: 'Gentlemen Productions',
    street: 'Słowackiego',
    buildingNumber: '6',
    postalCode: '41-800',
    city: 'Zabrze',
    country: 'PL',
    formattedAddress: 'Juliusza Słowackiego 6, 41-800 Zabrze',
    latitude: 50.3,
    longitude: 18.78,
    placeId: 'studio',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function place(
  role: WeddingPlace['role'],
  id: string,
  lat: number,
  lng: number,
): WeddingPlace {
  return {
    id,
    weddingId: 'w1',
    role,
    label: role,
    placeId: `pid-${id}`,
    formattedAddress: `${role} addr`,
    latitude: lat,
    longitude: lng,
    sortOrder: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function segment(
  seq: number,
  originKind: TravelSegment['originKind'],
  destKind: TravelSegment['destinationKind'],
  meters: number,
  seconds: number,
  originId: string | null,
  destId: string | null,
  distanceText: string,
  durationText: string,
): TravelSegment {
  return {
    id: `seg-${seq}`,
    weddingId: 'w1',
    sequence: seq,
    originKind,
    originWeddingPlaceId: originId,
    destinationKind: destKind,
    destinationWeddingPlaceId: destId,
    endpointsHash: `h-${seq}`,
    distanceMeters: meters,
    distanceText,
    durationSeconds: seconds,
    durationText,
    travelMode: 'DRIVE',
    provider: 'google',
    status: 'ok',
    errorMessage: null,
    calculatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

run('complete route: totals use shared formatter (280,1 km)', () => {
  // 22100 + 17000 + 99000 + 142000 = 280100 m → 280,1 km
  // 1440 + 1140 + 4620 + 6840 = 14040 s → 234 min → 3 godz. 54 min
  // Match live Joanna numbers via distanceText/durationText on segments + sum of meters/seconds
  const places = [
    place('groom_preparation', 'g', 50.3, 18.78),
    place('bride_preparation', 'b', 50.32, 18.79),
    place('ceremony', 'c', 50.06, 19.94),
    place('reception', 'r', 49.82, 19.75),
  ]
  const plan: TravelPlan = {
    weddingId: 'w1',
    studio: studio(),
    places,
    segments: [
      segment(0, 'studio', 'wedding_place', 22100, 1440, null, 'g', '22 km', '24 min'),
      segment(1, 'wedding_place', 'wedding_place', 17000, 1140, 'g', 'b', '17 km', '19 min'),
      segment(2, 'wedding_place', 'wedding_place', 99000, 4620, 'b', 'c', '99 km', '1 godz. 17 min'),
      segment(3, 'wedding_place', 'wedding_place', 142000, 6840, 'c', 'r', '142 km', '1 godz. 54 min'),
    ],
    hasError: false,
    errorMessage: null,
  }
  const summary = summarizeTravelRoute(buildTravelFlow(plan))
  assert(summary.totalsComplete, 'complete')
  assert(summary.distanceText === '280,1 km', `distance got ${summary.distanceText}`)
  assert(summary.durationText === '3 godz. 54 min', `duration got ${summary.durationText}`)
  assert(summary.distanceLabel === 'Łączny dystans', 'distance label')
  assert(summary.durationLabel === 'Szacowany czas jazdy', 'duration label')
})

run('incomplete route: totalsComplete false (no final totals)', () => {
  const places = [
    place('groom_preparation', 'g', 50.3, 18.78),
    place('bride_preparation', 'b', 50.32, 18.79),
    place('ceremony', 'c', 50.06, 19.94),
  ]
  const plan: TravelPlan = {
    weddingId: 'w1',
    studio: studio(),
    places,
    segments: [
      segment(0, 'studio', 'wedding_place', 22100, 1440, null, 'g', '22 km', '24 min'),
      // missing groom→bride and bride→ceremony
    ],
    hasError: false,
    errorMessage: null,
  }
  const summary = summarizeTravelRoute(buildTravelFlow(plan))
  assert(!summary.totalsComplete, 'incomplete')
})

run('Ankieta Plan dnia uses TravelRouteTotals + same travel-plan query', () => {
  const plan = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingDayPlan.tsx'),
    'utf8',
  )
  assert(plan.includes('TravelRouteTotals'), 'uses shared totals')
  assert(plan.includes('summarizeTravelRoute'), 'canonical summary')
  assert(
    plan.includes('travelPlanQueryKey') ||
      plan.includes("queryKey: ['travel-plan', userId, weddingId]"),
    'same query key',
  )
  assert(plan.includes('forceRefresh: true'), 'recalc updates cache')
  assert(!plan.includes('distanceMeters /'), 'no local distance calc')
})

run('Dzień ślubu uses the same TravelRouteTotals component', () => {
  const day = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingDayWorkspace.tsx',
    ),
    'utf8',
  )
  assert(day.includes('TravelRouteTotals'), 'day uses shared')
  assert(!day.includes('className={styles.routeSummary}'), 'no local totals markup')
})

run('TravelRouteTotals shows dash when incomplete; values when complete', () => {
  const ui = readFileSync(
    resolve(process.cwd(), 'src/features/travel/TravelRouteTotals.tsx'),
    'utf8',
  )
  assert(ui.includes('totalsComplete'), 'gated on complete')
  assert(ui.includes('travel-route-totals'), 'testid')
  assert(ui.includes('travel-total-distance'), 'distance testid')
  assert(ui.includes('travel-total-duration'), 'duration testid')
  assert(ui.includes('showValues'), 'values gated')
  assert(ui.includes('travel-route-loading'), 'loading state')
  assert(ui.includes('Przeliczamy trasę…'), 'loading copy')
  assert(ui.includes('travel-route-error'), 'error state')
  assert(ui.includes('Nie udało się przeliczyć trasy.'), 'error copy')
  assert(ui.includes('aria-live="polite"'), 'a11y live region')
  assert(ui.includes('disabled={loading}'), 'button disabled while loading')
})

run('Plan dnia has no visible DEV order panel; shared loading for auto/manual', () => {
  const plan = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingDayPlan.tsx'),
    'utf8',
  )
  assert(!plan.includes('operational-order-debug'), 'no visible DEV panel')
  assert(!plan.includes('wedding-places-db-debug'), 'no DB debug query in UI')
  assert(!plan.includes('DB: ${'), 'no DB label in JSX')
  assert(plan.includes("setRouteStatus('loading')"), 'loading on recalc')
  assert(plan.includes("setRouteStatus('error')"), 'error on failure')
  assert(plan.includes('routeStatus={'), 'passes status to totals')
  assert(plan.includes('data-route-busy'), 'leg busy marker')
})

console.log('\nTravel route totals acceptance finished.')
