/**
 * Wedding Day travel: base → first location starting leg.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildTravelFlow,
  formatRouteLegLabel,
  getTravelBaseDisplayName,
  getTravelBaseStatus,
  summarizeTravelRoute,
  TRAVEL_BASE_FALLBACK_NAME,
  TRAVEL_SETTINGS_PATH,
} from '@/features/travel/travelUi'
import type {
  StudioTravelSettings,
  TravelPlan,
  TravelSegment,
  WeddingPlace,
} from '@/types/travel'

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

function studio(
  overrides: Partial<StudioTravelSettings> = {},
): StudioTravelSettings {
  return {
    id: 's1',
    userId: 'u1',
    studioName: null,
    street: 'ul. Firmowa',
    buildingNumber: '1',
    postalCode: '00-001',
    city: 'Warszawa',
    country: 'Polska',
    formattedAddress: 'ul. Firmowa 1, 00-001 Warszawa',
    latitude: 52.23,
    longitude: 21.01,
    placeId: 'studio-place',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function place(
  role: WeddingPlace['role'],
  address: string,
  id: string,
  coords: { lat: number; lng: number } | null = {
    lat: 52.2 + id.length * 0.01,
    lng: 21,
  },
): WeddingPlace {
  return {
    id,
    weddingId: 'w1',
    role,
    label: address,
    placeId: coords ? `pid-${id}` : null,
    formattedAddress: address,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
    sortOrder: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function segment(
  sequence: number,
  originKind: TravelSegment['originKind'],
  destinationKind: TravelSegment['destinationKind'],
  meters: number,
  seconds: number,
  hash: string,
): TravelSegment {
  return {
    id: `seg-${sequence}`,
    weddingId: 'w1',
    sequence,
    originKind,
    originWeddingPlaceId: originKind === 'wedding_place' ? 'x' : null,
    destinationKind,
    destinationWeddingPlaceId: destinationKind === 'wedding_place' ? 'y' : null,
    endpointsHash: hash,
    distanceMeters: meters,
    distanceText: `${Math.round(meters / 100) / 10} km`.replace('.', ','),
    durationSeconds: seconds,
    durationText: `${Math.round(seconds / 60)} min`,
    travelMode: 'DRIVE',
    provider: 'google',
    status: 'ok',
    errorMessage: null,
    calculatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const weddingPlaces = [
  place('bride_preparation', 'Przygotowania Panny Młodej', 'b'),
  place('groom_preparation', 'Przygotowania Pana Młodego', 'g'),
  place('ceremony', 'Ceremonia', 'c'),
  place('reception', 'Przyjęcie weselne', 'r'),
]

run('1. Base is first route point; wedding locations follow order; no return', () => {
  const plan: TravelPlan = {
    weddingId: 'w1',
    studio: studio({ studioName: 'Atelier' }),
    places: weddingPlaces,
    segments: [],
    hasError: false,
    errorMessage: null,
  }
  const flow = buildTravelFlow(plan)
  assertEq(flow.stops[0].kind, 'studio', 'base first')
  assertEq(flow.stops[0].title, 'Atelier', 'display name')
  assertEq(flow.stops[1].role, 'bride_preparation', 'bride')
  assertEq(flow.stops[2].role, 'groom_preparation', 'groom')
  assertEq(flow.stops[3].role, 'ceremony', 'ceremony')
  assertEq(flow.stops[4].role, 'reception', 'reception')
  assertEq(flow.routeLegs.length, 4, 'four legs')
  assertEq(flow.routeLegs[0].origin.kind, 'studio', 'initial base leg')
  assertEq(flow.routeLegs[0].destination.role, 'bride_preparation', 'to bride')
  assert(
    !flow.routeLegs.some((l) => l.destination.kind === 'studio'),
    'no return-to-base',
  )
  assertEq(flow.stops[0].markerIndex, 0, 'base marker 0')
  assertEq(flow.stops[1].markerIndex, 1, 'wedding starts at 1')
})

run('2. Fallback base name is Baza firmy', () => {
  assertEq(getTravelBaseDisplayName(studio()), TRAVEL_BASE_FALLBACK_NAME, 'fallback')
  assertEq(getTravelBaseDisplayName(null), TRAVEL_BASE_FALLBACK_NAME, 'null')
  assertEq(getTravelBaseStatus(null), 'missing', 'missing')
  assertEq(
    getTravelBaseStatus(studio({ latitude: null, longitude: null })),
    'incomplete',
    'incomplete',
  )
  assertEq(getTravelBaseStatus(studio()), 'ready', 'ready')
})

run('3. Inactive / unverified locations excluded from route chain', () => {
  const plan: TravelPlan = {
    weddingId: 'w1',
    studio: studio(),
    places: [
      place('bride_preparation', 'Bride', 'b', null),
      place('groom_preparation', 'Groom', 'g'),
      place('ceremony', 'Ceremony', 'c'),
      place('reception', 'Reception', 'r'),
    ],
    segments: [],
    hasError: false,
    errorMessage: null,
  }
  const flow = buildTravelFlow(plan)
  assert(!flow.stops.some((s) => s.role === 'bride_preparation'), 'bride skipped')
  assertEq(flow.routeLegs[0].origin.kind, 'studio', 'base still first')
  assertEq(
    flow.routeLegs[0].destination.role,
    'groom_preparation',
    'skip-ahead to first valid',
  )
  assertEq(
    flow.routeLegs[0].label,
    formatRouteLegLabel(TRAVEL_BASE_FALLBACK_NAME, 'Groom'),
    'explicit skip-ahead label',
  )
})

run('4. Totals include base leg exactly once; one-location equals initial leg', () => {
  const full: TravelPlan = {
    weddingId: 'w1',
    studio: studio(),
    places: weddingPlaces,
    segments: [
      segment(0, 'studio', 'wedding_place', 9600, 600, 'base>b'),
      segment(1, 'wedding_place', 'wedding_place', 113000, 4920, 'b>g'),
      segment(2, 'wedding_place', 'wedding_place', 5000, 600, 'g>c'),
      segment(3, 'wedding_place', 'wedding_place', 8000, 900, 'c>r'),
    ],
    hasError: false,
    errorMessage: null,
  }
  const fullSummary = summarizeTravelRoute(buildTravelFlow(full))
  assertEq(fullSummary.okSegments.length, 4, 'four ok legs')
  assertEq(fullSummary.distanceMeters, 9600 + 113000 + 5000 + 8000, 'sum meters')
  assertEq(fullSummary.durationSeconds, 600 + 4920 + 600 + 900, 'sum seconds')
  assert(fullSummary.includesBaseLeg, 'includes base')
  assert(fullSummary.isCompleteDayRoute, 'complete day')
  assertEq(fullSummary.distanceLabel, 'Łączny dystans', 'full distance label')

  const oneLoc: TravelPlan = {
    weddingId: 'w1',
    studio: studio(),
    places: [place('ceremony', 'Ceremonia', 'c')],
    segments: [segment(0, 'studio', 'wedding_place', 9600, 600, 'base>c')],
    hasError: false,
    errorMessage: null,
  }
  const oneSummary = summarizeTravelRoute(buildTravelFlow(oneLoc))
  assertEq(oneSummary.okSegments.length, 1, 'one leg')
  assertEq(oneSummary.distanceMeters, 9600, 'equals initial')
  assertEq(oneSummary.durationSeconds, 600, 'equals initial duration')
})

run('5. Missing base → event-only totals; no fake zero base leg', () => {
  const plan: TravelPlan = {
    weddingId: 'w1',
    studio: null,
    places: weddingPlaces.slice(0, 2),
    segments: [
      segment(0, 'wedding_place', 'wedding_place', 10000, 900, 'b>g'),
    ],
    hasError: false,
    errorMessage: null,
  }
  const flow = buildTravelFlow(plan)
  assert(!flow.hasTravelBase, 'no base stop')
  assertEq(flow.baseStatus, 'missing', 'missing status')
  assertEq(flow.routeLegs.length, 1, 'only event leg')
  assertEq(flow.routeLegs[0].origin.kind, 'wedding_place', 'starts at place')
  const summary = summarizeTravelRoute(flow)
  assert(!summary.includesBaseLeg, 'no base leg')
  assert(!summary.isCompleteDayRoute, 'incomplete day')
  assertEq(summary.distanceLabel, 'Trasa między lokalizacjami', 'event label')
  assertEq(summary.distanceMeters, 10000, 'event distance only')
})

run('6. Zero locations: base shown in flow, no legs', () => {
  const plan: TravelPlan = {
    weddingId: 'w1',
    studio: studio(),
    places: [],
    segments: [],
    hasError: false,
    errorMessage: null,
  }
  const flow = buildTravelFlow(plan)
  assertEq(flow.stops.length, 1, 'base only')
  assertEq(flow.routeLegs.length, 0, 'no legs')
})

run('7. Cache key includes studio coordinates (source)', () => {
  const travel = readFileSync(
    resolve(process.cwd(), 'src/lib/api/travelService.ts'),
    'utf8',
  )
  assert(travel.includes("studio?.latitude ?? ''"), 'lat in fingerprint')
  assert(travel.includes("studio?.longitude ?? ''"), 'lng in fingerprint')
  assert(travel.includes("studio?.placeId ?? ''"), 'placeId in fingerprint')
  assert(travel.includes("'studio'"), 'studio in STOP_ORDER')
  const stopOrder = travel.slice(
    travel.indexOf('const STOP_ORDER'),
    travel.indexOf(']', travel.indexOf('const STOP_ORDER')) + 1,
  )
  assert(stopOrder.indexOf("'studio'") < stopOrder.indexOf("'bride_preparation'"), 'studio before bride')
  assert(!stopOrder.includes('return'), 'no return trip in order')
})

run('8. UI: Start base, settings link, labeled legs, missing/invalid notices', () => {
  const day = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingDayWorkspace.tsx',
    ),
    'utf8',
  )
  assert(day.includes('data-testid="travel-base-stop"'), 'base stop')
  assert(day.includes('itineraryStartLabel'), 'Start label')
  assert(day.includes(TRAVEL_SETTINGS_PATH) || day.includes('TRAVEL_SETTINGS_PATH'), 'settings')
  assert(day.includes('travel-base-missing'), 'missing notice')
  assert(day.includes('travel-base-invalid'), 'invalid notice')
  assert(
    day.includes('Ustaw bazę podróży, aby obliczyć dojazd do pierwszej'),
    'missing copy',
  )
  assert(
    day.includes('Nie można użyć adresu bazy do obliczenia trasy'),
    'invalid copy',
  )
  assert(day.includes('itineraryLegRoute'), 'leg corridor label')
  assert(day.includes('Trasa między lokalizacjami') || day.includes('distanceLabel'), 'totals label')
  assert(!day.includes('O której muszę wyjechać'), 'no departure time')
  assert(!day.includes('powrót'), 'no return trip UI')

  const map = readFileSync(
    resolve(process.cwd(), 'src/features/travel/TravelMap.tsx'),
    'utf8',
  )
  assert(map.includes("'Start'"), 'Start marker')
  assert(map.includes("kind === 'studio'"), 'studio marker branch')
})

run('9. Map consumes flow stops including base (source)', () => {
  const day = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingDayWorkspace.tsx',
    ),
    'utf8',
  )
  assert(day.includes('<TravelMap stops={flow.stops} />'), 'map from flow')
})
