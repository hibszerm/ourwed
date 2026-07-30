/**
 * Wedding Day route — ordered stops, adjacent segments, fingerprints.
 */

import {
  buildAdjacentRoutePairs,
  buildOrderedWeddingDayRouteStops,
  computeRouteInputFingerprint,
  routePairKey,
  segmentMatchesPair,
  CANONICAL_ROUTE_ROLE_ORDER,
  ROUTE_ROLE_SORT,
} from '@/features/travel/weddingDayRouteStops'
import { buildTravelFlow, summarizeTravelRoute } from '@/features/travel/travelUi'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type {
  StudioTravelSettings,
  TravelPlan,
  TravelSegment,
  WeddingPlace,
  WeddingPlaceRole,
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
    studioName: 'Studio',
    street: 'Firmowa',
    buildingNumber: '1',
    postalCode: '00-001',
    city: 'Warszawa',
    country: 'PL',
    formattedAddress: 'Firmowa 1, Warszawa',
    latitude: 52.23,
    longitude: 21.01,
    placeId: 'studio',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function place(
  role: WeddingPlaceRole,
  id: string,
  lat: number,
  lng: number,
  sortOrder?: number,
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
    sortOrder: sortOrder ?? ROUTE_ROLE_SORT[role] ?? 100,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function segment(
  seq: number,
  from: { kind: 'studio' | 'wedding_place'; id: string | null },
  to: { kind: 'studio' | 'wedding_place'; id: string | null },
  hash: string,
  dist: number,
  dur: number,
): TravelSegment {
  return {
    id: `seg-${seq}`,
    weddingId: 'w1',
    sequence: seq,
    originKind: from.kind,
    originWeddingPlaceId: from.id,
    destinationKind: to.kind,
    destinationWeddingPlaceId: to.id,
    endpointsHash: hash,
    distanceMeters: dist,
    distanceText: `${dist} m`,
    durationSeconds: dur,
    durationText: `${Math.round(dur / 60)} min`,
    travelMode: 'DRIVE',
    provider: 'google',
    status: 'ok',
    errorMessage: null,
    calculatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

run('canonical order: groom before bride', () => {
  assert(
    CANONICAL_ROUTE_ROLE_ORDER.indexOf('groom_preparation') <
      CANONICAL_ROUTE_ROLE_ORDER.indexOf('bride_preparation'),
    'groom before bride',
  )
})

run('ordered stops preserve explicit role order; N stops → N-1 pairs', () => {
  const places = [
    place('bride_preparation', 'bride', 50.32, 18.78),
    place('groom_preparation', 'groom', 50.3, 18.78),
    place('ceremony', 'cer', 50.06, 19.94),
    place('reception', 'rec', 49.82, 19.75),
  ]
  const stops = buildOrderedWeddingDayRouteStops({
    studio: studio(),
    places,
  })
  assert(stops.length === 5, '5 stops')
  assert(stops[0]!.role === 'studio', 'start')
  assert(stops[1]!.role === 'groom_preparation', 'groom second')
  assert(stops[2]!.role === 'bride_preparation', 'bride third')
  assert(stops[3]!.role === 'ceremony', 'ceremony')
  assert(stops[4]!.role === 'reception', 'reception')

  const pairs = buildAdjacentRoutePairs(stops, studio())
  assert(pairs.length === 4, '4 segments')
  assert(
    pairs[0]!.pairKey === routePairKey('studio', 'groom'),
    'start→groom',
  )
  assert(
    pairs[1]!.pairKey === routePairKey('groom', 'bride'),
    'groom→bride',
  )
  assert(
    pairs[2]!.pairKey === routePairKey('bride', 'cer'),
    'bride→ceremony',
  )
  assert(
    pairs[3]!.pairKey === routePairKey('cer', 'rec'),
    'ceremony→reception',
  )
})

run('roles do not override custom sequential sortOrder', () => {
  const places = [
    place('ceremony', 'cer', 50.06, 19.94, 10),
    place('bride_preparation', 'bride', 50.32, 18.78, 20),
    place('reception', 'rec', 49.82, 19.75, 30),
  ]
  const stops = buildOrderedWeddingDayRouteStops({
    studio: studio(),
    places,
  })
  assert(stops.map((s) => s.role).join('>') === 'studio>ceremony>bride_preparation>reception', 'custom order')
})

run('legacy bride-first sort catalog still uses canonical groom-before-bride', () => {
  const places = [
    place('bride_preparation', 'bride', 50.32, 18.79, 10),
    place('groom_preparation', 'groom', 50.3, 18.78, 15),
    place('ceremony', 'cer', 50.06, 19.94, 20),
    place('reception', 'rec', 49.82, 19.75, 30),
  ]
  const stops = buildOrderedWeddingDayRouteStops({
    studio: studio(),
    places,
  })
  assert(
    stops.map((s) => s.role).join('>') ===
      'studio>groom_preparation>bride_preparation>ceremony>reception',
    'legacy catalog → canonical order',
  )
})

run('A→B differs from B→A; fingerprint changes on reorder', () => {
  const a = place('groom_preparation', 'groom', 50.3, 18.78, 10)
  const b = place('bride_preparation', 'bride', 50.32, 18.79, 20)
  const order1 = buildOrderedWeddingDayRouteStops({
    studio: null,
    places: [a, b],
  })
  const order2 = buildOrderedWeddingDayRouteStops({
    studio: null,
    places: [
      place('bride_preparation', 'bride', 50.32, 18.79, 10),
      place('groom_preparation', 'groom', 50.3, 18.78, 20),
    ],
  })
  const p1 = buildAdjacentRoutePairs(order1, null)
  const p2 = buildAdjacentRoutePairs(order2, null)
  assert(p1[0]!.pairKey !== p2[0]!.pairKey, 'directional keys differ')
  assert(
    computeRouteInputFingerprint(order1) !==
      computeRouteInputFingerprint(order2),
    'fingerprint changes on reorder',
  )
})

run('coordinate change changes fingerprint; label-only does not', () => {
  const base = buildOrderedWeddingDayRouteStops({
    studio: null,
    places: [place('ceremony', 'cer', 50.0, 19.0)],
  })
  const moved = buildOrderedWeddingDayRouteStops({
    studio: null,
    places: [place('ceremony', 'cer', 50.1, 19.0)],
  })
  const relabeled = buildOrderedWeddingDayRouteStops({
    studio: null,
    places: [
      {
        ...place('ceremony', 'cer', 50.0, 19.0),
        label: 'Inna nazwa',
        formattedAddress: 'Inny adres tekstowy',
      },
    ],
  })
  assert(
    computeRouteInputFingerprint(base) !== computeRouteInputFingerprint(moved),
    'coords change fingerprint',
  )
  assert(
    computeRouteInputFingerprint(base) ===
      computeRouteInputFingerprint(relabeled),
    'label-only same fingerprint',
  )
})

run('regression: full rebuild after adding prep stops — no missing middle', () => {
  const s = studio()
  const ceremony = place('ceremony', 'cer', 50.06, 19.94)
  const reception = place('reception', 'rec', 49.82, 19.75)
  const groom = place('groom_preparation', 'groom', 50.3, 18.78)
  const bride = place('bride_preparation', 'bride', 50.32, 18.79)

  // Initial: Start → Ceremony → Reception
  const initialStops = buildOrderedWeddingDayRouteStops({
    studio: s,
    places: [ceremony, reception],
  })
  assert(initialStops.length === 3, '3 initial')
  assert(buildAdjacentRoutePairs(initialStops, s).length === 2, '2 initial legs')

  // After add: Start → Groom → Bride → Ceremony → Reception
  const nextStops = buildOrderedWeddingDayRouteStops({
    studio: s,
    places: [ceremony, reception, groom, bride],
  })
  const pairs = buildAdjacentRoutePairs(nextStops, s)
  assert(pairs.length === 4, 'exactly 4 current segments')
  assert(pairs[0]!.from.role === 'studio' && pairs[0]!.to.role === 'groom_preparation', 'Start→Groom')
  assert(pairs[1]!.from.role === 'groom_preparation' && pairs[1]!.to.role === 'bride_preparation', 'Groom→Bride')
  assert(pairs[2]!.from.role === 'bride_preparation' && pairs[2]!.to.role === 'ceremony', 'Bride→Ceremony')
  assert(pairs[3]!.from.role === 'ceremony' && pairs[3]!.to.role === 'reception', 'Ceremony→Reception')

  const segs = pairs.map((p, i) =>
    segment(
      i,
      {
        kind: p.from.kind,
        id: p.from.kind === 'studio' ? null : p.from.id,
      },
      {
        kind: p.to.kind,
        id: p.to.kind === 'studio' ? null : p.to.id,
      },
      p.endpointsHash,
      1000 * (i + 1),
      60 * (i + 1),
    ),
  )

  const plan: TravelPlan = {
    weddingId: 'w1',
    studio: s,
    places: [groom, bride, ceremony, reception],
    segments: segs,
    hasError: false,
    errorMessage: null,
    routeFingerprint: computeRouteInputFingerprint(nextStops),
    routeStale: false,
  }
  const flow = buildTravelFlow(plan)
  assert(flow.routeLegs.length === 4, 'UI 4 legs')
  assert(
    flow.routeLegs.every((l) => l.segment?.status === 'ok' && !l.failureReason),
    'no unexplained dash',
  )
  const summary = summarizeTravelRoute(flow)
  assert(summary.totalsComplete, 'totals complete')
  assert(summary.okSegments.length === 4, '4 ok segments')
  assert(
    summary.distanceMeters === 1000 + 2000 + 3000 + 4000,
    'totals sum current segments',
  )
})

run('multiple orders: bride-first custom sequence', () => {
  const places = [
    place('bride_preparation', 'bride', 50.32, 18.79, 10),
    place('groom_preparation', 'groom', 50.3, 18.78, 20),
    place('ceremony', 'cer', 50.06, 19.94, 30),
    place('reception', 'rec', 49.82, 19.75, 40),
  ]
  const stops = buildOrderedWeddingDayRouteStops({
    studio: studio(),
    places,
  })
  const pairs = buildAdjacentRoutePairs(stops, studio())
  assert(pairs[0]!.to.role === 'bride_preparation', 'bride first after start')
  assert(pairs[1]!.to.role === 'groom_preparation', 'then groom')
})

run('segmentMatchesPair is directional', () => {
  const stops = buildOrderedWeddingDayRouteStops({
    studio: null,
    places: [
      place('groom_preparation', 'groom', 50.3, 18.78),
      place('bride_preparation', 'bride', 50.32, 18.79),
    ],
  })
  const [pair] = buildAdjacentRoutePairs(stops, null)
  const ok = segment(
    0,
    { kind: 'wedding_place', id: 'groom' },
    { kind: 'wedding_place', id: 'bride' },
    pair!.endpointsHash,
    1,
    1,
  )
  const reversed = segment(
    0,
    { kind: 'wedding_place', id: 'bride' },
    { kind: 'wedding_place', id: 'groom' },
    'other',
    1,
    1,
  )
  assert(segmentMatchesPair(ok, pair!), 'forward matches')
  assert(!segmentMatchesPair(reversed, pair!), 'reverse does not match')
})

run('invalid coords excluded; engine source uses canonical order', () => {
  const places = [
    place('groom_preparation', 'groom', 50.3, 18.78),
    {
      ...place('bride_preparation', 'bride', 50.32, 18.79),
      latitude: null,
      longitude: null,
    },
    place('ceremony', 'cer', 50.06, 19.94),
  ]
  const stops = buildOrderedWeddingDayRouteStops({
    studio: studio(),
    places,
  })
  assert(
    stops.map((s) => s.role).join('>') === 'studio>groom_preparation>ceremony',
    'skip invalid bride',
  )
  assert(buildAdjacentRoutePairs(stops, studio()).length === 2, '2 pairs')
})

run('travelService uses ordered route module (no hard-coded bride-first STOP_ORDER)', () => {
  const travel = readFileSync(
    resolve(process.cwd(), 'src/lib/api/travelService.ts'),
    'utf8',
  )
  assert(travel.includes('buildOrderedWeddingDayRouteStops'), 'uses builder')
  assert(travel.includes('computeRouteInputFingerprint'), 'fingerprint')
  assert(!travel.includes("const STOP_ORDER"), 'no local STOP_ORDER')
  assert(travel.includes('nextRouteRevision'), 'race revision')
  assert(travel.includes('isCurrentRevision'), 'revision guard')
})

run('LOCATION_ROLES and PLAN_DNIA match groom-before-bride', () => {
  const selectors = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/weddingWorkspaceSelectors.ts',
    ),
    'utf8',
  )
  const groomIdx = selectors.indexOf("role: 'groom_preparation'")
  const brideIdx = selectors.indexOf("role: 'bride_preparation'")
  assert(groomIdx > 0 && groomIdx < brideIdx, 'LOCATION_ROLES groom first')
})

run('UI itinerary follows route stop keys, not fixed role list alone', () => {
  const day = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingDayWorkspace.tsx',
    ),
    'utf8',
  )
  assert(day.includes('buildItineraryLocationRows'), 'itinerary from route')
  assert(day.includes('findOutgoingLegByStopKey'), 'leg by stop key')
  assert(day.includes('travelLegFailureMessage'), 'failure messages')
})

run('manual location save forces full route rebuild', () => {
  const save = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/editing/useWeddingLocationSave.ts',
    ),
    'utf8',
  )
  assert(save.includes('travelService.invalidate'), 'invalidate on edit')
  assert(save.includes('forceRefresh: true'), 'force refresh')
})

run('orders A–E: adjacent pair sequences', () => {
  const s = studio()
  const cases: Array<{
    name: string
    places: WeddingPlace[]
    expectedRoles: string[]
  }> = [
    {
      name: 'A groom-first',
      places: [
        place('groom_preparation', 'g', 50.3, 18.78),
        place('bride_preparation', 'b', 50.32, 18.79),
        place('ceremony', 'c', 50.06, 19.94),
        place('reception', 'r', 49.82, 19.75),
      ],
      expectedRoles: [
        'studio',
        'groom_preparation',
        'bride_preparation',
        'ceremony',
        'reception',
      ],
    },
    {
      name: 'B bride-first custom',
      places: [
        place('bride_preparation', 'b', 50.32, 18.79, 10),
        place('groom_preparation', 'g', 50.3, 18.78, 20),
        place('ceremony', 'c', 50.06, 19.94, 30),
        place('reception', 'r', 49.82, 19.75, 40),
      ],
      expectedRoles: [
        'studio',
        'bride_preparation',
        'groom_preparation',
        'ceremony',
        'reception',
      ],
    },
    {
      name: 'C ceremony early',
      places: [
        place('ceremony', 'c', 50.06, 19.94, 10),
        place('bride_preparation', 'b', 50.32, 18.79, 20),
        place('reception', 'r', 49.82, 19.75, 30),
      ],
      expectedRoles: ['studio', 'ceremony', 'bride_preparation', 'reception'],
    },
    {
      name: 'D no studio',
      places: [
        place('bride_preparation', 'b', 50.32, 18.79, 10),
        place('groom_preparation', 'g', 50.3, 18.78, 20),
        place('ceremony', 'c', 50.06, 19.94, 30),
        place('reception', 'r', 49.82, 19.75, 40),
      ],
      expectedRoles: [
        'bride_preparation',
        'groom_preparation',
        'ceremony',
        'reception',
      ],
    },
    {
      name: 'E custom final stop',
      places: [
        place('bride_preparation', 'b', 50.32, 18.79, 10),
        place('ceremony', 'c', 50.06, 19.94, 20),
        place('reception', 'r', 49.82, 19.75, 30),
        place('hotel', 'h', 50.0, 19.9, 40),
      ],
      expectedRoles: [
        'studio',
        'bride_preparation',
        'ceremony',
        'reception',
        'hotel',
      ],
    },
  ]

  for (const c of cases) {
    const stops = buildOrderedWeddingDayRouteStops({
      studio: c.name === 'D no studio' ? null : s,
      places: c.places,
    })
    assert(
      stops.map((x) => x.role).join('>') === c.expectedRoles.join('>'),
      `${c.name} roles`,
    )
    const pairs = buildAdjacentRoutePairs(
      stops,
      c.name === 'D no studio' ? null : s,
    )
    assert(pairs.length === c.expectedRoles.length - 1, `${c.name} N-1`)
    for (let i = 0; i < pairs.length; i++) {
      assert(pairs[i]!.from.role === c.expectedRoles[i], `${c.name} from ${i}`)
      assert(pairs[i]!.to.role === c.expectedRoles[i + 1], `${c.name} to ${i}`)
    }
  }
})

run('failure messages are specific (not only dash)', () => {
  const ui = readFileSync(
    resolve(process.cwd(), 'src/features/travel/travelUi.ts'),
    'utf8',
  )
  assert(ui.includes('Brak współrzędnych miejsca początkowego'), 'origin msg')
  assert(ui.includes('Brak współrzędnych miejsca docelowego'), 'dest msg')
  assert(ui.includes('Nie udało się obliczyć tego odcinka'), 'provider msg')
  assert(ui.includes('Trasa wymaga ponownego przeliczenia'), 'stale msg')
})

console.log('\nWedding Day route order acceptance finished.')
