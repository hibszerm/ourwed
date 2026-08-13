/**
 * Wedding Day Cockpit — acceptance: order, maps, phones, brief, completion.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildWeddingDayCockpitData,
  selectHeroStopKey,
} from '@/features/wedding-day-cockpit/buildWeddingDayCockpitData'
import {
  buildFieldNavigationLinks,
  buildSmsHref,
  buildTelHref,
  normalizePhoneForHref,
} from '@/features/wedding-day-cockpit/fieldNavigation'
import { buildWeddingBriefPdfData } from '@/features/wedding-brief/buildWeddingBriefPdfData'
import {
  buildOperationalDayStops,
  operationalStopsToBriefTimeline,
} from '@/features/wedding-day/operationalDayPlan'
import { getOperationalOrderedPlaces } from '@/features/travel/weddingDayRouteStops'
import { operationalSortOrderAt } from '@/features/travel/weddingDayRouteStops'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import type {
  StudioTravelSettings,
  TravelPlan,
  TravelSegment,
  WeddingPlace,
  WeddingPlaceRole,
} from '@/types/travel'
import type { Wedding } from '@/types/wedding'

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
  lat = 50.1,
  lng = 19.0,
): WeddingPlace {
  return {
    id,
    weddingId: 'w1',
    role,
    label,
    placeId: `pid-${id}`,
    formattedAddress: address,
    latitude: lat,
    longitude: lng,
    sortOrder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

/** Non-chronological custom order: Bride → Groom → Ceremony → Reception */
function customOrderPlaces(): WeddingPlace[] {
  return [
    place(
      'bride_preparation',
      'bride',
      'Lwowska 78, 34-144 Izdebnik',
      'Villa Love',
      operationalSortOrderAt(0),
    ),
    place(
      'groom_preparation',
      'groom',
      'Chorzowska, 40-121 Katowice',
      null,
      operationalSortOrderAt(1),
    ),
    place(
      'ceremony',
      'ceremony',
      'Słoneczna 16, 43-426 Dębowiec',
      'Willa Słoneczna',
      operationalSortOrderAt(2),
    ),
    place(
      'reception',
      'reception',
      'Lwowska 78, 34-144 Izdebnik',
      'Villa Love',
      operationalSortOrderAt(3),
    ),
  ]
}

function baseWedding(overrides?: Partial<Wedding>): Wedding {
  return {
    id: 'w1',
    couple: {
      partner1: 'Anna Nowak',
      partner2: 'Michał Kowalski',
      partner1FirstName: 'Anna',
      partner1LastName: 'Nowak',
      partner2FirstName: 'Michał',
      partner2LastName: 'Kowalski',
      email: 'anna@example.test',
      phone: '500 100 200',
      venue: 'Villa Love',
      city: 'Izdebnik',
    },
    date: '2026-08-15',
    ceremonyTime: '14:00',
    packageName: 'Video Standard',
    packageId: 'pkg-1',
    price: 6500,
    depositAmount: 2000,
    currency: 'PLN',
    status: 'active',
    workflowStage: 'wedding_day',
    payments: [
      {
        id: 'p1',
        label: 'Zadatek',
        type: 'deposit',
        amount: 2000,
        paidAt: '2026-04-10',
        paid: true,
        method: 'transfer',
      },
    ],
    notes: [],
    timeline: [],
    deliverables: [],
    packageItems: [],
    checklist: [],
    schedule: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'completed' },
    },
    contract: { status: 'generated' },
    accentColor: '#0a0a0a',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Wedding
}

function segment(
  seq: number,
  from: { kind: 'studio' | 'wedding_place'; id: string | null },
  to: { kind: 'studio' | 'wedding_place'; id: string | null },
  distText: string,
  durText: string,
): TravelSegment {
  return {
    id: `seg-${seq}`,
    weddingId: 'w1',
    sequence: seq,
    originKind: from.kind,
    originWeddingPlaceId: from.id,
    destinationKind: to.kind,
    destinationWeddingPlaceId: to.id,
    endpointsHash: `hash-${seq}`,
    distanceMeters: 18_000,
    distanceText: distText,
    durationSeconds: 22 * 60,
    durationText: durText,
    travelMode: 'DRIVE',
    provider: 'google',
    status: 'ok',
    errorMessage: null,
    calculatedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

function planWithLegs(places: WeddingPlace[]): TravelPlan {
  const ordered = getOperationalOrderedPlaces(places)
  const segments: TravelSegment[] = []
  let seq = 0
  const first = ordered[0]!
  segments.push(
    segment(
      seq++,
      { kind: 'studio', id: null },
      { kind: 'wedding_place', id: first.id },
      '40 km',
      '45 min',
    ),
  )
  for (let i = 0; i < ordered.length - 1; i++) {
    const origin = ordered[i]!
    const dest = ordered[i + 1]!
    segments.push(
      segment(
        seq++,
        { kind: 'wedding_place', id: origin.id },
        { kind: 'wedding_place', id: dest.id },
        '18 km',
        '22 min',
      ),
    )
  }
  return {
    weddingId: 'w1',
    studio: studio(),
    places: [],
    segments,
    hasError: false,
    errorMessage: null,
    persistenceError: null,
    routeStale: false,
    routeFingerprint: 'fp-1',
  }
}

const times = {
  bride: '12:15',
  groom: '11:00',
  ceremony: '14:00',
  reception: '17:00',
}

run('A. Cockpit order equals canonical operational order', () => {
  const places = customOrderPlaces()
  const canonical = buildOperationalDayStops({
    studio: studio(),
    places,
    operationalTimes: times,
  })
  const data = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places,
    operationalTimes: times,
    completions: {},
    plan: planWithLegs(places),
    contacts: [],
    preWedding: null,
  })
  assert(
    data.stops.map((s) => s.key).join(',') ===
      canonical.map((s) => s.key).join(','),
    'Cockpit keys must match buildOperationalDayStops',
  )
})

run('B. Custom non-chronological order preserved (Bride before Groom despite times)', () => {
  const places = customOrderPlaces()
  const data = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places,
    operationalTimes: times,
    completions: {},
    plan: planWithLegs(places),
    contacts: [],
    preWedding: null,
  })
  const placeKeys = data.stops
    .filter((s) => s.kind === 'wedding_place')
    .map((s) => s.key)
  assert(
    placeKeys.join(',') === 'bride,groom,ceremony,reception',
    `got ${placeKeys.join(',')}`,
  )
  assert(data.stops.find((s) => s.key === 'bride')?.time === '12:15', 'bride time')
  assert(data.stops.find((s) => s.key === 'groom')?.time === '11:00', 'groom time')
})

run('C. Cockpit and Wedding Brief share operational ordering', () => {
  const places = customOrderPlaces()
  const ops = buildOperationalDayStops({
    studio: studio(),
    places,
    operationalTimes: times,
  })
  const briefTimeline = operationalStopsToBriefTimeline(ops)
  const brief = buildWeddingBriefPdfData({
    wedding: baseWedding(),
    places,
    contacts: [],
    operationalTimes: times,
  })
  const cockpit = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places,
    operationalTimes: times,
    completions: {},
    plan: planWithLegs(places),
    contacts: [],
    preWedding: null,
  })
  const cockpitPlaceTitles = cockpit.stops
    .filter((s) => s.kind === 'wedding_place')
    .map((s) => s.title)
  assert(
    briefTimeline.map((t) => t.title).join('|') === cockpitPlaceTitles.join('|'),
    'Brief timeline titles must match Cockpit place stops',
  )
  assert(
    brief.timeline.map((t) => t.title).join('|') ===
      cockpitPlaceTitles.join('|'),
    'Brief DTO timeline must match Cockpit',
  )
})

run('D. Place name + address both survive (Villa Love)', () => {
  const places = customOrderPlaces()
  const data = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places,
    operationalTimes: times,
    completions: {},
    plan: planWithLegs(places),
    contacts: [],
    preWedding: null,
  })
  const bride = data.stops.find((s) => s.key === 'bride')!
  assert(bride.placeName === 'Villa Love', `placeName=${bride.placeName}`)
  assert(
    Boolean(bride.address && bride.address.includes('Lwowska')),
    `address=${bride.address}`,
  )
})

run('E. Map helper prefers coordinates and falls back to address', () => {
  const withCoords = buildFieldNavigationLinks({
    label: 'Villa Love',
    formattedAddress: 'Lwowska 78, 34-144 Izdebnik',
    latitude: 49.88,
    longitude: 19.76,
  })
  assert(Boolean(withCoords.google?.includes('49.88')), 'google coords')
  assert(Boolean(withCoords.apple?.includes('49.88')), 'apple coords')
  assert(!withCoords.google?.includes('Lwowska'), 'coords win over address')

  const addrOnly = buildFieldNavigationLinks({
    label: 'Villa Love',
    formattedAddress: 'Lwowska 78, 34-144 Izdebnik',
    latitude: null,
    longitude: null,
  })
  assert(Boolean(addrOnly.google?.includes(encodeURIComponent('Lwowska').slice(0, 6)) || addrOnly.google?.includes('Lwowska')), 'address google')
  assert(Boolean(addrOnly.apple), 'apple address')

  const empty = buildFieldNavigationLinks({ label: null, formattedAddress: null })
  assert(empty.google === null && empty.apple === null, 'no destination')
})

run('F. Phone actions only for actual phone data', () => {
  assert(buildTelHref('500 100 200') === 'tel:500100200', 'tel normalize')
  assert(buildSmsHref('+48 500-100-200') === 'sms:+48500100200', 'sms normalize')
  assert(buildTelHref('   ') === null, 'empty phone')
  assert(normalizePhoneForHref('12') === null, 'too short')

  const data = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places: customOrderPlaces(),
    operationalTimes: times,
    completions: {},
    plan: planWithLegs(customOrderPlaces()),
    contacts: [
      {
        id: 'c1',
        weddingId: 'w1',
        role: 'Panna Młoda',
        name: 'Anna',
        phone: '500 100 200',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'c2',
        weddingId: 'w1',
        role: 'Pan Młody',
        name: 'Michał',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    preWedding: null,
  })
  const bride = data.stops.find((s) => s.key === 'bride')
  const groom = data.stops.find((s) => s.key === 'groom')
  assert(bride?.phone === '500 100 200', 'bride phone attached')
  assert(!groom?.phone, 'groom without phone has no action phone')
})

run('G. Route stale/recalculating does not show old legs as current', () => {
  const places = customOrderPlaces()
  const stalePlan: TravelPlan = {
    ...planWithLegs(places),
    routeStale: true,
  }
  const data = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places,
    operationalTimes: times,
    completions: {},
    plan: stalePlan,
    contacts: [],
    preWedding: null,
  })
  assert(data.routeStatus === 'loading', 'routeStatus loading when stale')
  const withLeg = data.stops.find((s) => s.incomingLeg)
  assert(withLeg?.incomingLeg?.status === 'stale', 'leg marked stale')
  assert(withLeg?.incomingLeg?.durationText == null, 'no stale duration shown as ok')
})

run('H. Critical info from shared Brief logic (not raw questionnaire dump)', () => {
  const viewSrc = readFileSync(
    resolve(process.cwd(), 'src/features/wedding-day-cockpit/WeddingDayCockpitView.tsx'),
    'utf8',
  )
  const builderSrc = readFileSync(
    resolve(process.cwd(), 'src/features/wedding-day-cockpit/buildWeddingDayCockpitData.ts'),
    'utf8',
  )
  assert(builderSrc.includes('buildWeddingBriefPdfData'), 'reuses brief builder')
  assert(builderSrc.includes('criticalNotes'), 'takes criticalNotes from brief')
  assert(!viewSrc.includes('answers['), 'view does not dig raw answers')
  assert(!viewSrc.includes('schema.sections'), 'view does not walk schema')
})

run('I. Settlement math uses existing finance helpers', () => {
  const wedding = baseWedding()
  const commercial = getWeddingCommercialSummary(wedding)
  const data = buildWeddingDayCockpitData({
    wedding,
    places: customOrderPlaces(),
    operationalTimes: times,
    completions: {},
    plan: planWithLegs(customOrderPlaces()),
    contacts: [],
    preWedding: null,
  })
  assert(data.settlement != null, 'settlement present')
  assert(data.settlement!.contractValue === commercial.contractValue, 'contract')
  assert(data.settlement!.totalPaid === commercial.totalPaid, 'paid')
  assert(data.settlement!.remainingToPay === commercial.remainingToPay, 'remaining')
  assert(data.settlement!.remainingToPay === 4500, '6500-2000')
  assert(!data.settlement!.settled, 'not settled')

  const paid = baseWedding({
    payments: [
      {
        id: 'p1',
        label: 'Pełna',
        type: 'final',
        amount: 6500,
        paidAt: '2026-08-01',
        paid: true,
        method: 'transfer',
      },
    ],
  })
  const settled = buildWeddingDayCockpitData({
    wedding: paid,
    places: customOrderPlaces(),
    operationalTimes: times,
    completions: {},
    plan: planWithLegs(customOrderPlaces()),
    contacts: [],
    preWedding: null,
  })
  assert(settled.settlement?.settled === true, 'fully paid')
})

run('J/K. Wedding Brief not on mount; explicit download path wired', () => {
  const pageSrc = readFileSync(
    resolve(process.cwd(), 'src/pages/WeddingDayCockpitPage.tsx'),
    'utf8',
  )
  const viewSrc = readFileSync(
    resolve(process.cwd(), 'src/features/wedding-day-cockpit/WeddingDayCockpitView.tsx'),
    'utf8',
  )
  const hookSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/wedding-day-cockpit/useWeddingDayCockpitData.ts',
    ),
    'utf8',
  )
  assert(!pageSrc.includes('downloadWeddingBriefPdf'), 'page no brief download')
  assert(!hookSrc.includes('downloadWeddingBriefPdf'), 'hook no PDF')
  assert(!hookSrc.includes('forceRefresh: true'), 'no forced recalc on mount')
  assert(hookSrc.includes('forceRefresh: false'), 'explicit cache-first getPlan')
  assert(viewSrc.includes('downloadWeddingBriefPdf'), 'view uses production download')
  assert(viewSrc.includes('cockpit-brief-download'), 'explicit button test id')
  assert(viewSrc.includes('onClick={() => void handleBrief()}'), 'click handler')
})

run('P0. Live freshness — Cockpit shares operational-times key with Plan dnia', () => {
  const hookSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/wedding-day-cockpit/useWeddingDayCockpitData.ts',
    ),
    'utf8',
  )
  const pageSrc = readFileSync(
    resolve(process.cwd(), 'src/pages/WeddingDayCockpitPage.tsx'),
    'utf8',
  )
  const planSrc = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingDayPlan.tsx'),
    'utf8',
  )
  const keysSrc = readFileSync(
    resolve(process.cwd(), 'src/features/wedding-day/queryKeys.ts'),
    'utf8',
  )
  assert(keysSrc.includes('operationalTimesQueryKey'), 'key factory')
  assert(hookSrc.includes('operationalTimesQueryKey'), 'Cockpit uses times key')
  assert(hookSrc.includes('weddingPlacesQueryKey'), 'Cockpit uses places key')
  assert(hookSrc.includes('travelPlanQueryKey'), 'Cockpit uses travel key')
  assert(hookSrc.includes('operationalCompletionsQueryKey'), 'completions key')
  assert(hookSrc.includes('weddingDetailQueryKey'), 'wedding detail key')
  assert(planSrc.includes('operationalTimesQueryKey'), 'Plan dnia uses same factory')
  assert(planSrc.includes('setQueryData(\n        timesKey'), 'Plan updates timesKey')
  assert(pageSrc.includes('useWeddingDayCockpitData'), 'page composes via hook')
  assert(!pageSrc.includes("['wedding-day-cockpit'"), 'no mega-DTO query key')
  assert(!pageSrc.includes('staleTime: 30_000'), 'no 30s independent stale snapshot')
  assert(!hookSrc.includes("['wedding-day-cockpit'"), 'hook no mega key')
})

run('P0-A/B. Time mutation → DTO resolves new time without hard refresh path', () => {
  const places = customOrderPlaces()
  const before = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places,
    operationalTimes: { ...times, groom: '09:00' },
    completions: {},
    plan: planWithLegs(places),
    contacts: [],
    preWedding: null,
  })
  assert(before.stops.find((s) => s.key === 'groom')?.time === '09:00', 'old')

  // Simulate Plan dnia setQueryData then Cockpit rebuild from shared cache value
  const afterTimes = { ...times, groom: '10:30', bride: '12:00' }
  const after = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places,
    operationalTimes: afterTimes,
    completions: {},
    plan: planWithLegs(places),
    contacts: [],
    preWedding: null,
  })
  assert(after.stops.find((s) => s.key === 'groom')?.time === '10:30', 'groom 10:30')
  assert(after.stops.find((s) => s.key === 'bride')?.time === '12:00', 'bride 12:00')
  assert(after.heroStopKey === 'bride', 'hero still first incomplete')
})

run('P0-C/D. Place order + address edits flow through shared places authority', () => {
  const places = customOrderPlaces()
  const reordered = [
    places[1]!, // groom
    places[0]!, // bride
    places[2]!,
    places[3]!,
  ].map((p, i) => ({ ...p, sortOrder: operationalSortOrderAt(i) }))
  const data = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places: reordered,
    operationalTimes: times,
    completions: {},
    plan: planWithLegs(reordered),
    contacts: [],
    preWedding: null,
  })
  assert(
    data.stops
      .filter((s) => s.kind === 'wedding_place')
      .map((s) => s.key)
      .join(',') === 'groom,bride,ceremony,reception',
    'reorder preserved',
  )

  const edited = reordered.map((p) =>
    p.id === 'groom'
      ? {
          ...p,
          label: 'Loft Studio',
          formattedAddress: 'Częstochowska 1, 44-100 Gliwice',
        }
      : p,
  )
  const editedData = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places: edited,
    operationalTimes: times,
    completions: {},
    plan: planWithLegs(edited),
    contacts: [],
    preWedding: null,
  })
  const groom = editedData.stops.find((s) => s.key === 'groom')!
  assert(groom.placeName === 'Loft Studio', 'new place name')
  assert(Boolean(groom.address?.includes('Częstochowska')), 'new address')
})

run('P0-E. Completion advances hero immediately via completions map', () => {
  const places = customOrderPlaces()
  const after = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places,
    operationalTimes: times,
    completions: { bride: '2026-08-15T10:00:00.000Z' },
    plan: planWithLegs(places),
    contacts: [],
    preWedding: null,
  })
  assert(after.heroStopKey === 'groom', 'hero advances')
  assert(after.stops.find((s) => s.key === 'bride')?.completed === true, 'muted')
  const viewSrc = readFileSync(
    resolve(process.cwd(), 'src/features/wedding-day-cockpit/WeddingDayCockpitView.tsx'),
    'utf8',
  )
  assert(viewSrc.includes('onMutate'), 'optimistic completions cache')
  assert(viewSrc.includes('operationalCompletionsQueryKey'), 'shared completions key')
  assert(viewSrc.includes('cockpit-day-complete'), 'day complete state')
})

run('P0-F. Settlement follows wedding commercial snapshot (shared wedding key)', () => {
  const hookSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/wedding-day-cockpit/useWeddingDayCockpitData.ts',
    ),
    'utf8',
  )
  assert(hookSrc.includes('weddingDetailQueryKey'), 'uses weddings detail key')
  const wedding = baseWedding({
    payments: [
      {
        id: 'p1',
        label: 'Zadatek',
        type: 'deposit',
        amount: 2000,
        paid: true,
        paidAt: '2026-04-10',
      },
      {
        id: 'p2',
        label: 'Dopłata',
        type: 'final',
        amount: 1500,
        paid: true,
        paidAt: '2026-08-01',
      },
    ],
  })
  const data = buildWeddingDayCockpitData({
    wedding,
    places: customOrderPlaces(),
    operationalTimes: times,
    completions: {},
    plan: planWithLegs(customOrderPlaces()),
    contacts: [],
    preWedding: null,
  })
  assert(data.settlement?.totalPaid === 3500, 'updated paid')
  assert(data.settlement?.remainingToPay === 3000, 'updated remaining')
})

run('P0-G. Stale travel does not present old legs as current', () => {
  const places = customOrderPlaces()
  const data = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places,
    operationalTimes: times,
    completions: {},
    plan: { ...planWithLegs(places), routeStale: true },
    contacts: [],
    preWedding: null,
  })
  assert(data.routeStatus === 'loading', 'loading')
  const leg = data.stops.find((s) => s.incomingLeg)?.incomingLeg
  assert(leg?.status === 'stale', 'stale status')
  assert(leg?.durationText == null, 'no stale duration')
})

run('P1. Missing time is quiet — no giant dash in builder/view', () => {
  const places = customOrderPlaces()
  const data = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places,
    operationalTimes: {},
    completions: {},
    plan: planWithLegs(places),
    contacts: [],
    preWedding: null,
  })
  assert(data.stops.every((s) => s.time == null || s.time.length > 0), 'no fake')
  const viewSrc = readFileSync(
    resolve(process.cwd(), 'src/features/wedding-day-cockpit/WeddingDayCockpitView.tsx'),
    'utf8',
  )
  assert(viewSrc.includes('Godzina nieustalona'), 'quiet missing copy')
  assert(viewSrc.includes('cockpit-hero-time-missing'), 'missing test id')
  assert(!viewSrc.includes('aria-label="Bez godziny"'), 'no giant dash hero')
})

run('L. Completion drives next-stop hero; studio is not next job', () => {
  const places = customOrderPlaces()
  const empty = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places,
    operationalTimes: times,
    completions: {},
    plan: planWithLegs(places),
    contacts: [],
    preWedding: null,
  })
  assert(empty.heroStopKey === 'bride', 'first actionable is bride')
  assert(empty.stops[0]?.kind === 'studio', 'studio first on plan')
  assert(empty.heroStopKey !== 'studio', 'studio not hero')

  const afterBride = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places,
    operationalTimes: times,
    completions: { bride: '2026-08-15T10:00:00.000Z' },
    plan: planWithLegs(places),
    contacts: [],
    preWedding: null,
  })
  assert(afterBride.heroStopKey === 'groom', 'next after bride complete')

  const allDone = buildWeddingDayCockpitData({
    wedding: baseWedding(),
    places,
    operationalTimes: times,
    completions: {
      bride: 't',
      groom: 't',
      ceremony: 't',
      reception: 't',
    },
    plan: planWithLegs(places),
    contacts: [],
    preWedding: null,
  })
  assert(allDone.dayComplete === true, 'day complete')
  assert(allDone.heroStopKey === null, 'no hero when done')

  const hero = selectHeroStopKey(
    places.map((p) => ({
      key: p.id,
      actionable: true,
      completed: p.id === 'bride',
    })),
  )
  assert(hero.heroStopKey === 'groom', 'selectHeroStopKey')
})

run('M. Desktop/mobile: no viewport-based feature removal; route + entry wired', () => {
  const router = readFileSync(
    resolve(process.cwd(), 'src/routes/router.tsx'),
    'utf8',
  )
  const viewSrc = readFileSync(
    resolve(process.cwd(), 'src/features/wedding-day-cockpit/WeddingDayCockpitView.tsx'),
    'utf8',
  )
  const css = readFileSync(
    resolve(process.cwd(), 'src/features/wedding-day-cockpit/WeddingDayCockpit.module.css'),
    'utf8',
  )
  const header = readFileSync(
    resolve(process.cwd(), 'src/features/weddings/detail/v2/WeddingWorkspaceHeader.tsx'),
    'utf8',
  )
  const dayWs = readFileSync(
    resolve(process.cwd(), 'src/features/weddings/detail/v2/WeddingDayWorkspace.tsx'),
    'utf8',
  )
  assert(router.includes("path: '/sluby/:weddingId/dzien-slubu'"), 'route')
  assert(router.includes('WeddingDayCockpitPage'), 'page import')
  assert(header.includes('/dzien-slubu'), 'header entry')
  assert(header.includes('Otwórz tryb dnia ślubu'), 'header copy')
  assert(dayWs.includes('/dzien-slubu'), 'workspace entry')
  assert(viewSrc.includes('cockpit-plan-list'), 'plan always rendered')
  assert(viewSrc.includes('cockpit-settlement') || viewSrc.includes('Rozliczenie'), 'settlement')
  assert(!viewSrc.includes('window.innerWidth'), 'no JS viewport gating')
  assert(!viewSrc.includes('matchMedia'), 'no matchMedia gating')
  assert(css.includes('@media (min-width: 900px)'), 'desktop layout media')
  assert(css.includes('display: none') && css.includes('.mobileNav'), 'only sticky nav hidden on desktop')
})

run('Migration: operational completions owner-only RLS', () => {
  const mig = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260813140000_wedding_operational_completions.sql',
    ),
    'utf8',
  )
  assert(mig.includes('wedding_operational_completions'), 'table')
  assert(mig.includes('force row level security'), 'force RLS')
  assert(mig.includes('is_wedding_owner'), 'owner helper')
  assert(mig.includes('revoke all') && mig.includes('anon'), 'no anon')
})

if (process.exitCode) {
  console.error('\nWedding Day Cockpit acceptance FAILED')
} else {
  console.log('\nWedding Day Cockpit acceptance OK')
}
