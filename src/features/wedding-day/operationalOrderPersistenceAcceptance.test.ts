/**
 * Integration-style orchestration: ceremony-before-preparations order must
 * survive reorder → list → stale travel-plan overwrite → manual recalc → refetch.
 *
 * Simulates the production race where a slow getPlan (tens of seconds) returns
 * pre-reorder catalog places after the user already committed a custom order.
 */

import { QueryClient } from '@tanstack/react-query'
import {
  buildAdjacentRoutePairs,
  buildOrderedWeddingDayRouteStops,
  getOperationalOrderedPlaces,
  operationalSortOrderAt,
  placesHaveCustomSequentialOrder,
  ROUTE_ROLE_SORT,
} from '@/features/travel/weddingDayRouteStops'
import {
  buildOperationalDayStops,
  reorderPlaceIds,
} from '@/features/wedding-day/operationalDayPlan'
import {
  withAuthoritativePlaces,
} from '@/features/wedding-day/travelPlanPlaces'
import type {
  StudioTravelSettings,
  TravelPlan,
  WeddingPlace,
  WeddingPlaceRole,
} from '@/types/travel'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      console.log(`PASS  ${name}`)
    })
    .catch((err) => {
      console.error(`FAIL  ${name}`)
      console.error(err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
}

function studio(): StudioTravelSettings {
  return {
    id: 's1',
    userId: 'u1',
    studioName: 'Studio Testowe',
    street: 'Przykładowa',
    buildingNumber: '6',
    postalCode: '41-800',
    city: 'Zabrze',
    country: 'PL',
    formattedAddress: 'ul. Przykładowa 1, 00-001 Warszawa',
    latitude: 50.3,
    longitude: 18.78,
    placeId: 'studio-gp',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function place(
  role: WeddingPlaceRole,
  id: string,
  sortOrder: number,
  lat: number,
  lng: number,
): WeddingPlace {
  return {
    id,
    weddingId: 'w1',
    role,
    label: null,
    placeId: `pid-${id}`,
    formattedAddress: `${role} address`,
    latitude: lat,
    longitude: lng,
    sortOrder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

/** In-memory wedding_places store — stands in for Supabase. */
function createPlaceStore(initial: WeddingPlace[]) {
  let rows = initial.map((p) => ({ ...p }))
  return {
    list(): WeddingPlace[] {
      return [...rows].sort(
        (a, b) => Number(a.sortOrder) - Number(b.sortOrder),
      )
    },
    reorder(orderedIds: string[]): WeddingPlace[] {
      const byId = new Map(rows.map((p) => [p.id, p]))
      const full = [
        ...orderedIds.filter((id) => byId.has(id)),
        ...rows
          .filter((p) => !orderedIds.includes(p.id))
          .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
          .map((p) => p.id),
      ]
      rows = full.map((id, i) => {
        const prev = byId.get(id)!
        return { ...prev, sortOrder: operationalSortOrderAt(i) }
      })
      return this.list()
    },
    /** Simulate a stale snapshot taken before reorder (catalog sort). */
    snapshotCatalog(): WeddingPlace[] {
      return initial.map((p) => ({ ...p }))
    },
  }
}

function emptyPlan(places: WeddingPlace[]): TravelPlan {
  return {
    weddingId: 'w1',
    studio: studio(),
    places,
    segments: [],
    hasError: false,
    errorMessage: null,
    persistenceError: null,
    routeFingerprint: null,
    routeStale: false,
  }
}

function rolesOf(places: WeddingPlace[]): string {
  return getOperationalOrderedPlaces(places)
    .map((p) => p.role)
    .join('>')
}

function routeRoles(places: WeddingPlace[]): string {
  return buildOrderedWeddingDayRouteStops({
    studio: studio(),
    places,
  })
    .map((s) => s.role)
    .join('>')
}

const INITIAL = [
  place('groom_preparation', 'groom', ROUTE_ROLE_SORT.groom_preparation, 50.3, 18.78),
  place('bride_preparation', 'bride', ROUTE_ROLE_SORT.bride_preparation, 50.32, 18.79),
  place('ceremony', 'ceremony', ROUTE_ROLE_SORT.ceremony, 50.06, 19.94),
  place('reception', 'reception', ROUTE_ROLE_SORT.reception, 49.82, 19.75),
]

const EXPECTED_CUSTOM =
  'ceremony>groom_preparation>bride_preparation>reception'
const EXPECTED_ROUTE =
  'studio>ceremony>groom_preparation>bride_preparation>reception'

async function main() {
  await run('1. initial catalog order is groom→bride→ceremony→reception', () => {
    assert(rolesOf(INITIAL) === 'groom_preparation>bride_preparation>ceremony>reception', rolesOf(INITIAL))
    assert(!placesHaveCustomSequentialOrder(INITIAL), 'catalog not custom')
  })

  await run('2. reorder persist → ceremony first; survives list + builders', () => {
    const store = createPlaceStore(INITIAL)
    const ids = ['groom', 'bride', 'ceremony', 'reception']
    // Drag ceremony before preparations (index 2 → 0)
    const nextIds = reorderPlaceIds(ids, 2, 0)
    assert(
      nextIds.join('>') === 'ceremony>groom>bride>reception',
      nextIds.join('>'),
    )
    const persisted = store.reorder(nextIds)
    assert(
      persisted.map((p) => p.sortOrder).join(',') === '1000,2000,3000,4000',
      'operational sort base',
    )
    assert(rolesOf(persisted) === EXPECTED_CUSTOM, rolesOf(persisted))
    assert(routeRoles(persisted) === EXPECTED_ROUTE, routeRoles(persisted))

    const pairs = buildAdjacentRoutePairs(
      buildOrderedWeddingDayRouteStops({ studio: studio(), places: persisted }),
      studio(),
    )
    assert(pairs[0]!.pairKey === 'studio::ceremony', pairs[0]!.pairKey)
    assert(pairs[1]!.pairKey === 'ceremony::groom', pairs[1]!.pairKey)
    assert(pairs[2]!.pairKey === 'groom::bride', pairs[2]!.pairKey)
    assert(pairs[3]!.pairKey === 'bride::reception', pairs[3]!.pairKey)

    // Second list (background refetch)
    assert(rolesOf(store.list()) === EXPECTED_CUSTOM, 'refetch list')
  })

  await run('3. stale travel-plan.places cannot override wedding-places authority', () => {
    const store = createPlaceStore(INITIAL)
    const persisted = store.reorder(['ceremony', 'groom', 'bride', 'reception'])
    const qc = new QueryClient()
    const placesKey = ['wedding-places', 'u1', 'w1'] as const
    const travelKey = ['travel-plan', 'u1', 'w1'] as const

    qc.setQueryData(placesKey, persisted)
    qc.setQueryData(travelKey, emptyPlan(persisted))

    // Simulate slow in-flight getPlan completing with PRE-reorder places
    const stalePlan = emptyPlan(store.snapshotCatalog())
    assert(
      rolesOf(stalePlan.places) ===
        'groom_preparation>bride_preparation>ceremony>reception',
      'stale catalog',
    )

    const authoritative = qc.getQueryData<WeddingPlace[]>(placesKey) ?? []
    const merged = withAuthoritativePlaces(stalePlan, authoritative)
    qc.setQueryData(travelKey, merged)

    const placesAfter = qc.getQueryData<WeddingPlace[]>(placesKey)!
    const planAfter = qc.getQueryData<TravelPlan>(travelKey)!
    assert(rolesOf(placesAfter) === EXPECTED_CUSTOM, 'places cache intact')
    assert(rolesOf(planAfter.places) === EXPECTED_CUSTOM, 'plan overlay')
    assert(
      routeRoles(planAfter.places) === EXPECTED_ROUTE,
      routeRoles(planAfter.places),
    )

    // UI operational stops follow wedding-places, not stale plan alone
    const stops = buildOperationalDayStops({
      studio: studio(),
      places: placesAfter,
    })
    assert(
      stops
        .filter((s) => s.kind === 'wedding_place')
        .map((s) => s.role)
        .join('>') === EXPECTED_CUSTOM,
      'UI stops',
    )
  })

  await run('4. manual recalc uses wedding-places order, not stale travel-plan', () => {
    const store = createPlaceStore(INITIAL)
    const persisted = store.reorder(['ceremony', 'groom', 'bride', 'reception'])
    const qc = new QueryClient()
    qc.setQueryData(['wedding-places', 'u1', 'w1'], persisted)
    // Poison travel-plan.places with catalog order (the old bug input)
    qc.setQueryData(
      ['travel-plan', 'u1', 'w1'],
      emptyPlan(store.snapshotCatalog()),
    )

    const authoritative =
      qc.getQueryData<WeddingPlace[]>(['wedding-places', 'u1', 'w1']) ?? []
    // Manual Przelicz must pass authoritative places
    assert(rolesOf(authoritative) === EXPECTED_CUSTOM, 'manual input')
    const route = buildOrderedWeddingDayRouteStops({
      studio: studio(),
      places: authoritative,
    })
    assert(
      route.map((s) => s.role).join('>') === EXPECTED_ROUTE,
      'manual route input',
    )
  })

  await run('5. second refetch after 30s simulation still ceremony-first', () => {
    const store = createPlaceStore(INITIAL)
    store.reorder(['ceremony', 'groom', 'bride', 'reception'])
    // t+5s
    assert(rolesOf(store.list()) === EXPECTED_CUSTOM, 't+5')
    // t+30s background list
    assert(rolesOf(store.list()) === EXPECTED_CUSTOM, 't+30')
    assert(placesHaveCustomSequentialOrder(store.list()), 'still custom')
  })

  await run('6. mixed operational+catalog still custom when any ≥1000', () => {
    const mixed = [
      place('ceremony', 'ceremony', 1000, 50.06, 19.94),
      place('groom_preparation', 'groom', 15, 50.3, 18.78),
      place('bride_preparation', 'bride', 2000, 50.32, 18.79),
      place('reception', 'reception', 30, 49.82, 19.75),
    ]
    assert(placesHaveCustomSequentialOrder(mixed), 'any operational → custom')
    // Numeric sort_order wins (does NOT snap to role catalog).
    assert(
      rolesOf(mixed) ===
        'groom_preparation>reception>ceremony>bride_preparation',
      rolesOf(mixed),
    )
  })

  await run('7. PreWeddingDayPlan sources order from wedding-places (source)', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'src/features/prewedding/PreWeddingDayPlan.tsx'),
      'utf8',
    )
    assert(src.includes('weddingPlacesQueryKey'), 'places query key')
    assert(src.includes('cancelQueries'), 'cancel in-flight travel')
    assert(src.includes('getOperationalOrderedPlaces'), 'canonical selector')
    assert(src.includes('shouldAcceptTravelPlanResult'), 'fingerprint guard')
    assert(src.includes('RENDERED ARRAY'), 'exact JSX render debug (console)')
    assert(!src.includes('operational-order-debug'), 'no visible DEV panel')
    assert(src.includes('places: []'), 'travel-plan.places stripped')
  })

  if (!process.exitCode) {
    console.log('OK operational order persistence acceptance')
  }
}

void main()
