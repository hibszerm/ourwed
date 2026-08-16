/**
 * Drag-index + reorder persistence orchestration.
 * Tests the SAME reorderPlaceIds helper used by PreWeddingDayPlan pointer drag.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QueryClient } from '@tanstack/react-query'
import {
  buildOrderedWeddingDayRouteStops,
  computeRouteInputFingerprint,
  getOperationalOrderedPlaces,
  operationalSortOrderAt,
  orderPlacesByExplicitIds,
} from '@/features/travel/weddingDayRouteStops'
import { reorderPlaceIds } from '@/features/wedding-day/operationalDayPlan'
import {
  shouldAcceptTravelPlanResult,
  setExpectedRouteFingerprint,
} from '@/features/wedding-day/routeResultGuard'
import type { StudioTravelSettings, WeddingPlace, WeddingPlaceRole } from '@/types/travel'

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

function place(role: WeddingPlaceRole, id: string, sortOrder: number): WeddingPlace {
  return {
    id,
    weddingId: 'w1',
    role,
    label: null,
    placeId: `pid-${id}`,
    formattedAddress: role,
    latitude: 50,
    longitude: 19,
    sortOrder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function studio(): StudioTravelSettings {
  return {
    id: 's1',
    userId: 'u1',
    studioName: 'Studio Testowe',
    street: null,
    buildingNumber: null,
    postalCode: null,
    city: null,
    country: 'PL',
    formattedAddress: 'ul. Przykładowa 1, 00-001 Warszawa',
    latitude: 50.3,
    longitude: 18.78,
    placeId: 'studio',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

run('Reception index 1 → LAST via reorderPlaceIds', () => {
  const ids = ['bride', 'reception', 'groom', 'ceremony']
  const next = reorderPlaceIds(ids, 1, 3)
  assert(next.join('>') === 'bride>groom>ceremony>reception', next.join('>'))
})

run('Ceremony → first via reorderPlaceIds', () => {
  const ids = ['bride', 'reception', 'groom', 'ceremony']
  const next = reorderPlaceIds(ids, 3, 0)
  assert(next.join('>') === 'ceremony>bride>reception>groom', next.join('>'))
})

run('Bride → last via reorderPlaceIds', () => {
  const ids = ['bride', 'reception', 'groom', 'ceremony']
  const next = reorderPlaceIds(ids, 0, 3)
  assert(next.join('>') === 'reception>groom>ceremony>bride', next.join('>'))
})

run('Groom → position 2 via reorderPlaceIds', () => {
  const ids = ['bride', 'reception', 'groom', 'ceremony']
  // groom at 2 → position 1 (0-based index 1)
  const next = reorderPlaceIds(ids, 2, 1)
  assert(next.join('>') === 'bride>groom>reception>ceremony', next.join('>'))
})

run('explicit id order wins over sort_order fields', () => {
  const places = [
    place('bride_preparation', 'bride', 1000),
    place('reception', 'reception', 2000),
    place('groom_preparation', 'groom', 3000),
    place('ceremony', 'ceremony', 4000),
  ]
  // Display/draft wants Reception last — sort_order fields still old
  const orderedIds = ['bride', 'groom', 'ceremony', 'reception']
  const ordered = orderPlacesByExplicitIds(places, orderedIds)
  assert(
    ordered.map((p) => p.role).join('>') ===
      'bride_preparation>groom_preparation>ceremony>reception',
    ordered.map((p) => p.role).join('>'),
  )
  const stops = buildOrderedWeddingDayRouteStops({
    studio: studio(),
    places,
    orderedPlaceIds: orderedIds,
  })
  assert(
    stops.map((s) => s.id).join('>') ===
      'studio>bride>groom>ceremony>reception',
    stops.map((s) => s.id).join('>'),
  )
})

run('after persist sort_orders, canonical selector matches', () => {
  const orderedIds = ['bride', 'groom', 'ceremony', 'reception']
  const persisted = orderedIds.map((id, i) => {
    const role =
      id === 'bride'
        ? 'bride_preparation'
        : id === 'groom'
          ? 'groom_preparation'
          : (id as WeddingPlaceRole)
    return place(role as WeddingPlaceRole, id, operationalSortOrderAt(i))
  })
  assert(
    getOperationalOrderedPlaces(persisted)
      .map((p) => p.id)
      .join('>') === 'bride>groom>ceremony>reception',
    'canonical after persist',
  )
})

run('stale travel result with old fingerprint is rejected', () => {
  const places = [
    place('bride_preparation', 'bride', 1000),
    place('groom_preparation', 'groom', 2000),
    place('ceremony', 'ceremony', 3000),
    place('reception', 'reception', 4000),
  ]
  const currentStops = buildOrderedWeddingDayRouteStops({
    studio: studio(),
    places,
    orderedPlaceIds: places.map((p) => p.id),
  })
  const currentFp = computeRouteInputFingerprint(currentStops)
  setExpectedRouteFingerprint('w1', currentFp)

  const stalePlaces = [
    place('bride_preparation', 'bride', 1000),
    place('reception', 'reception', 2000),
    place('groom_preparation', 'groom', 3000),
    place('ceremony', 'ceremony', 4000),
  ]
  const staleFp = computeRouteInputFingerprint(
    buildOrderedWeddingDayRouteStops({
      studio: studio(),
      places: stalePlaces,
      orderedPlaceIds: stalePlaces.map((p) => p.id),
    }),
  )
  assert(staleFp !== currentFp, 'fingerprints differ')
  assert(
    !shouldAcceptTravelPlanResult({
      weddingId: 'w1',
      routeFingerprint: staleFp,
      routeStale: false,
    }),
    'stale rejected',
  )
  assert(
    shouldAcceptTravelPlanResult({
      weddingId: 'w1',
      routeFingerprint: currentFp,
      routeStale: false,
    }),
    'current accepted',
  )
  assert(
    !shouldAcceptTravelPlanResult({
      weddingId: 'w1',
      routeFingerprint: currentFp,
      routeStale: true,
    }),
    'routeStale never accepted as success',
  )
})

run('orchestration: drag → ids → mock persist → cache → render selector', () => {
  const initial = [
    place('bride_preparation', 'bride', 1000),
    place('reception', 'reception', 2000),
    place('groom_preparation', 'groom', 3000),
    place('ceremony', 'ceremony', 4000),
  ]
  const afterIds = reorderPlaceIds(
    initial.map((p) => p.id),
    1,
    3,
  )
  assert(afterIds.join('>') === 'bride>groom>ceremony>reception', afterIds.join('>'))

  const persisted = afterIds.map((id, i) => {
    const prev = initial.find((p) => p.id === id)!
    return { ...prev, sortOrder: operationalSortOrderAt(i) }
  })

  const qc = new QueryClient()
  qc.setQueryData(['wedding-places', 'u1', 'w1'], persisted)

  const cache = qc.getQueryData<WeddingPlace[]>(['wedding-places', 'u1', 'w1'])!
  const renderIds = getOperationalOrderedPlaces(cache).map((p) => p.id)
  assert(renderIds.join('>') === afterIds.join('>'), 'render matches')

  const fp = computeRouteInputFingerprint(
    buildOrderedWeddingDayRouteStops({
      studio: studio(),
      places: cache,
      orderedPlaceIds: renderIds,
    }),
  )
  setExpectedRouteFingerprint('w1', fp)

  // Inject late stale result for Bride→Reception→Groom→Ceremony
  const staleFp = computeRouteInputFingerprint(
    buildOrderedWeddingDayRouteStops({
      studio: studio(),
      places: initial,
      orderedPlaceIds: initial.map((p) => p.id),
    }),
  )
  assert(
    !shouldAcceptTravelPlanResult({
      weddingId: 'w1',
      routeFingerprint: staleFp,
      routeStale: false,
    }),
    'late stale rejected',
  )
  // Cache order unchanged
  assert(
    getOperationalOrderedPlaces(
      qc.getQueryData<WeddingPlace[]>(['wedding-places', 'u1', 'w1'])!,
    )
      .map((p) => p.id)
      .join('>') === 'bride>groom>ceremony>reception',
    'cache intact after reject',
  )
})

run('PreWeddingDayPlan uses data-place-id + console RENDER debug (source)', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingDayPlan.tsx'),
    'utf8',
  )
  assert(src.includes('data-place-id'), 'place-id for drag targets')
  assert(src.includes('RENDERED ARRAY'), 'console render debug')
  assert(!src.includes('operational-order-debug'), 'no visible DEV panel')
  assert(src.includes('orderedPlaceIds'), 'explicit route ids')
  assert(src.includes('shouldAcceptTravelPlanResult'), 'fingerprint guard')
  assert(src.includes('places: []'), 'strip plan.places')
  assert(src.includes("window.addEventListener('pointerup'"), 'window pointerup')
  assert(src.includes('TravelRouteUiStatus'), 'route UI status')
})

if (!process.exitCode) {
  console.log('OK operational drag reorder acceptance')
}
