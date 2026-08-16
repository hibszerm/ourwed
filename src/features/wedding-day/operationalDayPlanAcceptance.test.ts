/**
 * Operational day-plan: times, order, route legs, vendor identity.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildAdjacentRoutePairs,
  buildOrderedWeddingDayRouteStops,
  computeRouteInputFingerprint,
  operationalSortOrderAt,
  placesHaveCustomSequentialOrder,
  ROUTE_ROLE_SORT,
} from '@/features/travel/weddingDayRouteStops'
import {
  buildOperationalDayStops,
  operationalStopsToBriefTimeline,
  reorderPlaceIds,
  resolveStopTime,
  vendorNamesEqual,
} from '@/features/wedding-day/operationalDayPlan'
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

function studio(): StudioTravelSettings {
  return {
    id: 's1',
    userId: 'u1',
    studioName: 'Gentlemen Productions',
    street: 'Juliusza Słowackiego',
    buildingNumber: '6',
    postalCode: '41-800',
    city: 'Zabrze',
    country: 'PL',
    formattedAddress: 'Juliusza Słowackiego 6, 41-800 Zabrze',
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
  address: string,
  label: string | null,
  sortOrder: number,
): WeddingPlace {
  return {
    id,
    weddingId: 'w1',
    role,
    label,
    placeId: `pid-${id}`,
    formattedAddress: address,
    latitude: 50 + sortOrder / 100,
    longitude: 19,
    sortOrder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const fixturePlaces = () => [
  place('groom_preparation', 'groom', 'Chorzowska, 40-121 Katowice', null, ROUTE_ROLE_SORT.groom_preparation),
  place('bride_preparation', 'bride', 'Michała Grażyńskiego 5, 41-810 Zabrze', null, ROUTE_ROLE_SORT.bride_preparation),
  place(
    'ceremony',
    'ceremony',
    'Słoneczna 16, 43-426 Dębowiec',
    'Willa Słoneczna w Dębowcu',
    ROUTE_ROLE_SORT.ceremony,
  ),
  place(
    'reception',
    'reception',
    'Lwowska 78, 34-144 Izdebnik',
    'Villa Love',
    ROUTE_ROLE_SORT.reception,
  ),
]

run('1. questionnaire seeds missing ceremony/reception times', () => {
  const stops = buildOperationalDayStops({
    studio: studio(),
    places: fixturePlaces(),
    operationalTimes: {},
    questionnaireTimes: { ceremony: '14:00', reception: '17:00' },
  })
  const ceremony = stops.find((s) => s.role === 'ceremony')
  const reception = stops.find((s) => s.role === 'reception')
  const groom = stops.find((s) => s.role === 'groom_preparation')
  assert(ceremony?.time === '14:00', 'ceremony seeded')
  assert(ceremony?.timeSource === 'questionnaire', 'ceremony source')
  assert(reception?.time === '17:00', 'reception seeded')
  assert(groom?.time == null, 'prep has no questionnaire time')
})

run('1b. wedding.ceremonyTime wins over questionnaire when no ops override', () => {
  const stops = buildOperationalDayStops({
    studio: studio(),
    places: fixturePlaces(),
    operationalTimes: {},
    questionnaireTimes: { ceremony: '14:00', reception: '17:00' },
    weddingCeremonyTime: '14:30',
  })
  const ceremony = stops.find((s) => s.role === 'ceremony')
  assert(ceremony?.time === '14:30', 'canonical ceremony time')
  assert(ceremony?.timeSource === 'wedding', 'wedding source')
  assert(
    stops.find((s) => s.role === 'reception')?.time === '17:00',
    'reception still Q seed',
  )
})

run('1c. explicit ops ceremony time wins over wedding + questionnaire', () => {
  const stops = buildOperationalDayStops({
    studio: studio(),
    places: fixturePlaces(),
    operationalTimes: { ceremony: '14:45' },
    questionnaireTimes: { ceremony: '14:00' },
    weddingCeremonyTime: '14:30',
  })
  const ceremony = stops.find((s) => s.key === 'ceremony')
  assert(ceremony?.time === '14:45', 'ops override')
  assert(ceremony?.timeSource === 'studio', 'studio source')
})

run('2. studio override wins over questionnaire', () => {
  const stops = buildOperationalDayStops({
    studio: studio(),
    places: fixturePlaces(),
    operationalTimes: { ceremony: '15:30', groom: '11:00' },
    questionnaireTimes: { ceremony: '14:00', reception: '17:00' },
  })
  assert(stops.find((s) => s.key === 'ceremony')?.time === '15:30', 'override')
  assert(stops.find((s) => s.key === 'ceremony')?.timeSource === 'studio', 'studio source')
  assert(stops.find((s) => s.key === 'groom')?.time === '11:00', 'prep set')
  assert(stops.find((s) => s.key === 'reception')?.time === '17:00', 'seed remains')
})

run('3. default order is Start → Groom → Bride → Ceremony → Reception', () => {
  const stops = buildOperationalDayStops({
    studio: studio(),
    places: fixturePlaces(),
  })
  assert(
    stops.map((s) => s.role).join('>') ===
      'studio>groom_preparation>bride_preparation>ceremony>reception',
    stops.map((s) => s.role).join('>'),
  )
})

run('4. custom sort_order swaps bride/groom and route legs follow', () => {
  const reordered = [
    place('bride_preparation', 'bride', 'Michała Grażyńskiego 5, 41-810 Zabrze', null, 1),
    place('groom_preparation', 'groom', 'Chorzowska, 40-121 Katowice', null, 2),
    place(
      'ceremony',
      'ceremony',
      'Słoneczna 16, 43-426 Dębowiec',
      'Willa Słoneczna w Dębowcu',
      3,
    ),
    place(
      'reception',
      'reception',
      'Lwowska 78, 34-144 Izdebnik',
      'Villa Love',
      4,
    ),
  ]
  const stops = buildOperationalDayStops({
    studio: studio(),
    places: reordered,
    operationalTimes: { bride: '12:15', groom: '11:00' },
    questionnaireTimes: { ceremony: '14:00', reception: '17:00' },
  })
  assert(
    stops.map((s) => s.role).join('>') ===
      'studio>bride_preparation>groom_preparation>ceremony>reception',
    'bride before groom',
  )
  const routeStops = buildOrderedWeddingDayRouteStops({
    studio: studio(),
    places: reordered,
  })
  const pairs = buildAdjacentRoutePairs(routeStops, studio())
  const pairRoles = pairs.map((p) => `${p.from.role}>${p.to.role}`)
  assert(pairRoles[0] === 'studio>bride_preparation', pairRoles[0]!)
  assert(pairRoles[1] === 'bride_preparation>groom_preparation', pairRoles[1]!)
  assert(pairRoles[2] === 'groom_preparation>ceremony', pairRoles[2]!)
  assert(pairRoles[3] === 'ceremony>reception', pairRoles[3]!)

  const brief = operationalStopsToBriefTimeline(stops)
  assert(brief[0]?.title.includes('Panny'), 'brief bride first')
  assert(brief[0]?.time === '12:15', 'brief bride time')
  assert(brief[1]?.time === '11:00', 'brief groom time even if earlier')
  assert(brief[2]?.placeName === 'Willa Słoneczna w Dębowcu', 'willa name')
  assert(brief[3]?.placeName === 'Villa Love', 'villa name')
  assert(Boolean(brief[3]?.shortAddress?.includes('Lwowska')), 'villa address')
})

run('5. reorderPlaceIds is a committed permutation helper', () => {
  const ids = ['groom', 'bride', 'ceremony', 'reception']
  const swapped = reorderPlaceIds(ids, 0, 1)
  assert(swapped.join(',') === 'bride,groom,ceremony,reception', swapped.join(','))
  assert(ids.join(',') === 'groom,bride,ceremony,reception', 'input not mutated')
})

run('6. vendor identity ignores case/punctuation; substring is not a match', () => {
  assert(vendorNamesEqual('dj willy', 'DJ Willy'), 'case')
  assert(vendorNamesEqual('dj-willy', 'dj willy'), 'punct')
  assert(!vendorNamesEqual('dj', 'dj willy'), 'no substring collapse')
})

run('7. resolveStopTime never invents a value', () => {
  assert(resolveStopTime(undefined, undefined).time == null, 'empty')
  assert(resolveStopTime('13.00', '14:00').time === '13:00', 'override normalized')
  assert(resolveStopTime(undefined, '14:00').timeSource === 'questionnaire', 'seed')
})

run('8. UI recalculates only after committed reorder (source)', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingDayPlan.tsx'),
    'utf8',
  )
  assert(src.includes('commitReorder'), 'commit helper')
  assert(src.includes('weddingPlaceService.reorder'), 'persist order')
  assert(src.includes('travelService.recalculate'), 'recalc after persist')
  assert(src.includes('orderedPlaceIds'), 'explicit ordered ids into recalc')
  assert(src.includes('forceRefresh: true'), 'force refresh after reorder')
  assert(src.includes('cancelQueries'), 'cancel in-flight travel plan')
  assert(src.includes('weddingPlacesQueryKey'), 'wedding-places authority')
  assert(src.includes('shouldAcceptTravelPlanResult'), 'fingerprint guard')
  assert(src.includes('data-place-id'), 'drag targets place ids only')
  assert(
    !src.includes("invalidateQueries({ queryKey: ['travel-plan'] })"),
    'no travel-plan invalidate race after setQueryData',
  )
  const moveFn = src.slice(src.indexOf('onHandlePointerMove'), src.indexOf('function endDrag'))
  assert(!moveFn.includes('recalculate'), 'no recalc during pointer move')
  assert(!moveFn.includes('weddingPlaceService.reorder'), 'no persist during move')
  assert(src.includes('saveTime.mutateAsync'), 'time save')
  assert(!src.includes('PLAN_DNIA_ROLE_ORDER'), 'no hardcoded display re-sort')
})

run('9. upsert preserves custom sort_order; reorder uses operational base (source)', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/api/weddingPlaceService.ts'),
    'utf8',
  )
  assert(src.includes('existing?.sortOrder'), 'preserve order on upsert')
  assert(src.includes('async reorder('), 'reorder API')
  assert(src.includes('operationalSortOrderAt'), 'operational sort base')
  assert(src.includes('maybeSingle()'), 'verify each update wrote a row')
  assert(src.includes('OPERATIONAL_SORT_BASE'), 'no catalog reset on insert after custom')
})

run('10. reorder → builder → pairs follow Bride before Groom', () => {
  const reordered = [
    place('bride_preparation', 'bride', 'Michała Grażyńskiego 5, 41-810 Zabrze', null, 1000),
    place('groom_preparation', 'groom', 'Chorzowska, 40-121 Katowice', null, 2000),
    place(
      'ceremony',
      'ceremony',
      'Słoneczna 16, 43-426 Dębowiec',
      'Willa Słoneczna w Dębowcu',
      3000,
    ),
    place(
      'reception',
      'reception',
      'Lwowska 78, 34-144 Izdebnik',
      'Villa Love',
      4000,
    ),
  ]
  const stops = buildOrderedWeddingDayRouteStops({
    studio: studio(),
    places: reordered,
  })
  assert(
    stops.map((s) => s.id).join('>') ===
      'studio>bride>groom>ceremony>reception',
    stops.map((s) => s.id).join('>'),
  )
  const pairs = buildAdjacentRoutePairs(stops, studio())
  assert(pairs.map((p) => p.pairKey).join('|') === [
    'studio::bride',
    'bride::groom',
    'groom::ceremony',
    'ceremony::reception',
  ].join('|'), 'pair keys')
})

run('11. same stops different order → different route fingerprints and pair hashes', () => {
  const groomFirst = [
    place('groom_preparation', 'groom', 'g', null, 1000),
    place('bride_preparation', 'bride', 'b', null, 2000),
    place('ceremony', 'ceremony', 'c', null, 3000),
    place('reception', 'reception', 'r', null, 4000),
  ]
  const brideFirst = [
    place('bride_preparation', 'bride', 'b', null, 1000),
    place('groom_preparation', 'groom', 'g', null, 2000),
    place('ceremony', 'ceremony', 'c', null, 3000),
    place('reception', 'reception', 'r', null, 4000),
  ]
  assert(placesHaveCustomSequentialOrder(groomFirst), 'groom-first is custom')
  assert(placesHaveCustomSequentialOrder(brideFirst), 'bride-first is custom')
  const a = buildOrderedWeddingDayRouteStops({ studio: studio(), places: groomFirst })
  const b = buildOrderedWeddingDayRouteStops({ studio: studio(), places: brideFirst })
  assert(
    computeRouteInputFingerprint(a) !== computeRouteInputFingerprint(b),
    'full route fingerprint differs',
  )
  const pa = buildAdjacentRoutePairs(a, studio())
  const pb = buildAdjacentRoutePairs(b, studio())
  assert(pa[0]!.endpointsHash !== pb[0]!.endpointsHash, 'first leg hash differs')
  assert(pa[1]!.endpointsHash !== pb[1]!.endpointsHash, 'second leg hash differs')
  assert(pa[0]!.pairKey === 'studio::groom', pa[0]!.pairKey)
  assert(pb[0]!.pairKey === 'studio::bride', pb[0]!.pairKey)
})

run('12. operationalSortOrderAt never collides with role catalogs', () => {
  const orders = [0, 1, 2, 3].map(operationalSortOrderAt)
  assert(orders.join(',') === '1000,2000,3000,4000', orders.join(','))
  const catalogValues = new Set(Object.values(ROUTE_ROLE_SORT))
  for (const o of orders) {
    assert(!catalogValues.has(o), `order ${o} not in catalog`)
  }
})

run('13. travelService.getPlan accepts places override (source)', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/api/travelService.ts'),
    'utf8',
  )
  assert(src.includes('places?: WeddingPlace[]'), 'places option')
  assert(src.includes('options?.places ?? listedPlaces'), 'override wins')
})

run('14. time save path does not call travel recalculate (source)', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingDayPlan.tsx'),
    'utf8',
  )
  const saveTimeBlock = src.slice(
    src.indexOf('const saveTime = useMutation'),
    src.indexOf('// ——— ONE canonical place sequence'),
  )
  assert(!saveTimeBlock.includes('travelService'), 'time edit skips travel')
  assert(saveTimeBlock.includes('weddingOperationalTimesService'), 'times service')
})

run('15. route loading UX — no visible DEV panel; shared status (source)', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingDayPlan.tsx'),
    'utf8',
  )
  const totals = readFileSync(
    resolve(process.cwd(), 'src/features/travel/TravelRouteTotals.tsx'),
    'utf8',
  )
  assert(!src.includes('data-testid="operational-order-debug"'), 'no DEV panel')
  assert(src.includes("setRouteStatus('loading')"), 'sets loading')
  assert(src.includes("setRouteStatus('error')"), 'sets error')
  assert(src.includes("setRouteStatus('idle')"), 'clears to idle')
  assert(totals.includes('Przeliczamy trasę…'), 'loading title')
  assert(
    totals.includes('Aktualizujemy czasy i odległości dla nowej kolejności.'),
    'loading detail',
  )
  assert(totals.includes('disabled={loading}'), 'button disabled')
})

if (!process.exitCode) {
  console.log('OK operational day plan acceptance')
}
