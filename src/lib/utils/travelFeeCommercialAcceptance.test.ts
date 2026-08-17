/**
 * Travel fee commercial math + suggestion + guardrails.
 * Run: npm run test:travel-fee
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applyCommercialPackageSnapshot,
} from '@/lib/utils/commercial'
import {
  computeWeddingContractValue,
  recomputeContractValueAfterExtrasSync,
  resolvePackageBasePrice,
} from '@/lib/forms/weddingExtraPricing'
import {
  buildTravelFeeRoundTripRecommendation,
  summarizeOutboundTravelFeeDistance,
} from '@/features/travel/travelFeeRouteRecommendation'
import {
  getEffectiveTravelFeeAmount,
  getTravelFeeContractGuardLevel,
  isTravelFeeResolved,
  isValidTravelFeeDraft,
  normalizeTravelFeeDecision,
  previewTravelFeeContractValue,
  recomputeContractValueAfterTravelFeeChange,
  suggestTravelFeeFromFreeKm,
  travelFeeContractGuardMessage,
} from '@/lib/utils/travelFeeCommercial'
import { buildContractCommercialResolved } from '@/lib/utils/contractCommercialVariables'
import { getRemainingToPay } from '@/lib/utils/finance'
import type { StudioPackage } from '@/types/package'
import type { TravelPlan, TravelSegment, WeddingPlace } from '@/types/travel'
import type { Payment, Wedding } from '@/types/wedding'

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

function baseWedding(overrides: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w1',
    couple: {
      partner1: 'Anna',
      partner2: 'Jan',
      email: '',
      phone: '',
      venue: '',
      city: '',
    },
    date: '2026-09-12',
    status: 'active',
    workflowStage: 'preparation',
    packageName: 'Pakiet Classic',
    packageId: 'pkg1',
    price: 5000,
    depositAmount: 1000,
    currency: 'PLN',
    packageItems: [],
    accentColor: '#0a0a0a',
    travelFeeStatus: 'unresolved',
    travelFeeAmount: 0,
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
    createdAt: '2026-01-01',
    ...overrides,
  }
}

const pkg = {
  id: 'pkg2',
  name: 'Pakiet Premium',
  slug: 'premium',
  description: null,
  price: 6000,
  depositAmount: 1200,
  currency: 'PLN',
  color: '#111',
  items: [],
  coverageHours: 10,
  coverageEndTime: null,
  overtimeRate: 200,
  deliveryMonths: 2,
  deliveryDays: null,
  finalPaymentTerms: null,
  isActive: true,
  sortOrder: 0,
  questionnaireFormId: null,
  activeContractTemplateId: null,
  activeContractTemplateVersionId: null,
  createdAt: '',
  updatedAt: '',
} as StudioPackage

run('A. included keeps CV 5000', () => {
  const r = recomputeContractValueAfterTravelFeeChange({
    currentContractValue: 5000,
    extras: [],
    previousEffectiveTravel: 0,
    nextStatus: 'included',
    nextAmount: 0,
  })
  assertEq(r.newContractValue, 5000, 'cv')
  assertEq(r.nextEffectiveTravel, 0, 'travel')
  assertEq(r.status, 'included', 'status')
})

run('B. charge 350 → 5350', () => {
  const r = recomputeContractValueAfterTravelFeeChange({
    currentContractValue: 5000,
    extras: [],
    previousEffectiveTravel: 0,
    nextStatus: 'charged',
    nextAmount: 350,
  })
  assertEq(r.newContractValue, 5350, 'cv')
  assertEq(r.nextEffectiveTravel, 350, 'travel')
})

run('C. idempotent repeated save 350', () => {
  const first = recomputeContractValueAfterTravelFeeChange({
    currentContractValue: 5000,
    extras: [],
    previousEffectiveTravel: 0,
    nextStatus: 'charged',
    nextAmount: 350,
  })
  const second = recomputeContractValueAfterTravelFeeChange({
    currentContractValue: first.newContractValue,
    extras: [],
    previousEffectiveTravel: first.nextEffectiveTravel,
    nextStatus: 'charged',
    nextAmount: 350,
  })
  assertEq(second.newContractValue, 5350, 'still 5350')
})

run('D. edit charge 350 → 500', () => {
  const r = recomputeContractValueAfterTravelFeeChange({
    currentContractValue: 5350,
    extras: [],
    previousEffectiveTravel: 350,
    nextStatus: 'charged',
    nextAmount: 500,
  })
  assertEq(r.newContractValue, 5500, '5500 not 5850')
})

run('E. charged → included removes fee', () => {
  const r = recomputeContractValueAfterTravelFeeChange({
    currentContractValue: 5350,
    extras: [],
    previousEffectiveTravel: 350,
    nextStatus: 'included',
    nextAmount: 0,
  })
  assertEq(r.newContractValue, 5000, 'back to 5000')
})

run('F. extras coexist then remove extras keeps travel', () => {
  const withBoth = computeWeddingContractValue({
    packageBasePrice: 5000,
    extras: [{ priceSnapshot: 500, quantity: 1 }],
    effectiveTravelFee: 350,
  })
  assertEq(withBoth, 5850, '5850')

  const afterRemove = recomputeContractValueAfterExtrasSync({
    currentWeddingPrice: 5850,
    extrasBeforeSync: [{ priceSnapshot: 500, quantity: 1 }],
    extrasAfterSync: [],
    effectiveTravelFee: 350,
  })
  assertEq(afterRemove, 5350, 'travel remains')
})

run('G. package default change keeps travel', () => {
  const wedding = baseWedding({
    price: 5350,
    travelFeeStatus: 'charged',
    travelFeeAmount: 350,
  })
  const snap = applyCommercialPackageSnapshot(wedding, pkg, {
    extrasTotal: 0,
    effectiveTravelFee: 350,
    preserveContractValue: false,
  })
  assertEq(snap.price, 6350, '6000+350')
})

run('H. preserve contract value', () => {
  const wedding = baseWedding({
    price: 5350,
    travelFeeStatus: 'charged',
    travelFeeAmount: 350,
  })
  const snap = applyCommercialPackageSnapshot(wedding, pkg, {
    extrasTotal: 0,
    effectiveTravelFee: 350,
    preserveContractValue: true,
  })
  assertEq(snap.price, 5350, 'preserved')
})

run('direct price edit absorbs into package base', () => {
  // User sets CV to 5200 while travel stays charged 350 / extras 0
  const base = resolvePackageBasePrice({
    currentWeddingPrice: 5200,
    extrasBeforeOrCurrent: [],
    effectiveTravelFee: 350,
  })
  assertEq(base, 4850, 'manual delta in base')
  const again = computeWeddingContractValue({
    packageBasePrice: base,
    extras: [],
    effectiveTravelFee: 350,
  })
  assertEq(again, 5200, 'idempotent after direct edit')
})

run('remaining balance uses final CV', () => {
  const payments: Payment[] = [
    {
      id: 'p1',
      label: 'Zadatek',
      amount: 1000,
      type: 'deposit',
      paid: true,
    },
  ]
  assertEq(getRemainingToPay(5350, payments), 4350, 'remaining')
})

run('free-km suggestion included / manual / no auto', () => {
  assertEq(
    suggestTravelFeeFromFreeKm({
      freeDistanceKm: 200,
      roundTripDistanceMeters: 174_000,
      status: 'unresolved',
    }),
    'included',
    'suggest included',
  )
  assertEq(
    suggestTravelFeeFromFreeKm({
      freeDistanceKm: 200,
      roundTripDistanceMeters: 286_000,
      status: 'unresolved',
    }),
    'manual',
    'suggest manual',
  )
  assertEq(
    suggestTravelFeeFromFreeKm({
      freeDistanceKm: 200,
      roundTripDistanceMeters: 174_000,
      status: 'charged',
    }),
    null,
    'no suggest when resolved',
  )
})

run('stale/incomplete route → no suggestion', () => {
  const rec = buildTravelFeeRoundTripRecommendation({
    outboundComplete: false,
    outboundMeters: 100_000,
    returnMeters: 50_000,
    freeDistanceKm: 200,
    status: 'unresolved',
    routeFingerprint: null,
    lastPlaceId: null,
    canFetchReturn: false,
  })
  assertEq(rec.suggestion, null, 'no suggestion')
  assertEq(rec.roundTripMeters, null, 'no round trip')
})

run('snapshot fields stay after route change (math invariant)', () => {
  const wedding = baseWedding({
    price: 5350,
    travelFeeStatus: 'charged',
    travelFeeAmount: 350,
    travelFeeFreeKmSnapshot: 200,
    travelFeeRouteDistanceMSnapshot: 286_000,
  })
  // Route becomes longer — commercial fields unchanged
  assertEq(getEffectiveTravelFeeAmount(wedding), 350, 'fee')
  assertEq(wedding.price, 5350, 'cv')
  assertEq(wedding.travelFeeFreeKmSnapshot, 200, 'free km snap')
})

run('contract guards', () => {
  assertEq(getTravelFeeContractGuardLevel('none'), 'none', 'none')
  assertEq(getTravelFeeContractGuardLevel('generated'), 'generated', 'gen')
  assertEq(getTravelFeeContractGuardLevel('sent'), 'sent', 'sent')
  assertEq(getTravelFeeContractGuardLevel('signed'), 'signed', 'signed')
  assert(travelFeeContractGuardMessage('signed')!.includes('podpisana'), 'signed copy')
  assert(travelFeeContractGuardMessage('generated')!.includes('ponownego'), 'gen copy')
})

run('contract variable travel_fee populated when charged', () => {
  const resolved = buildContractCommercialResolved(
    baseWedding({
      price: 5350,
      travelFeeStatus: 'charged',
      travelFeeAmount: 350,
    }),
  )
  assert(Boolean(resolved.values.travel_fee_formatted), 'formatted')
  assertEq(resolved.snapshotExtras.travelFee, 350, 'snap')
})

run('contract variable travel_fee omitted when unresolved', () => {
  const resolved = buildContractCommercialResolved(baseWedding())
  assert(!resolved.values.travel_fee, 'no raw')
  assert(resolved.snapshotExtras.travelFee === undefined, 'no snap')
})

run('legacy default semantics', () => {
  const w = baseWedding({ price: 5000 })
  assertEq(w.travelFeeStatus ?? 'unresolved', 'unresolved', 'status')
  assertEq(getEffectiveTravelFeeAmount(w), 0, 'amount')
  assertEq(w.price, 5000, 'cv untouched')
  assertEq(isTravelFeeResolved(w), false, 'unresolved not resolved')
  assertEq(isTravelFeeResolved({ travelFeeStatus: 'included' }), true, 'included')
  assertEq(
    isTravelFeeResolved({ travelFeeStatus: 'charged', travelFeeAmount: 350 }),
    true,
    'charged valid',
  )
  assertEq(
    isTravelFeeResolved({ travelFeeStatus: 'charged', travelFeeAmount: 0 }),
    false,
    'charged zero invalid',
  )
})

run('outbound summarizer does not invent return', () => {
  const place = (id: string, role: WeddingPlace['role']): WeddingPlace => ({
    id,
    weddingId: 'w1',
    role,
    label: role,
    placeId: `p-${id}`,
    formattedAddress: 'Addr',
    latitude: 50,
    longitude: 19,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  })
  const segment = (
    seq: number,
    meters: number,
    from: string | null,
    to: string,
  ): TravelSegment => ({
    id: `s${seq}`,
    weddingId: 'w1',
    sequence: seq,
    originKind: from ? 'wedding_place' : 'studio',
    originWeddingPlaceId: from,
    destinationKind: 'wedding_place',
    destinationWeddingPlaceId: to,
    endpointsHash: `${from ?? 'studio'}>${to}`,
    distanceMeters: meters,
    distanceText: `${meters} m`,
    durationSeconds: 600,
    durationText: '10 min',
    travelMode: 'DRIVE',
    provider: 'google',
    status: 'ok',
    errorMessage: null,
    calculatedAt: '',
    createdAt: '',
    updatedAt: '',
  })
  const plan: TravelPlan = {
    weddingId: 'w1',
    studio: {
      id: 'st',
      userId: 'u',
      studioName: 'Studio',
      street: null,
      buildingNumber: null,
      postalCode: null,
      city: 'Kraków',
      country: 'Polska',
      formattedAddress: 'Kraków',
      latitude: 50.06,
      longitude: 19.94,
      placeId: 'studio',
      freeDistanceKm: 200,
      createdAt: '',
      updatedAt: '',
    },
    places: [place('a', 'ceremony'), place('b', 'reception')],
    segments: [
      segment(0, 10_000, null, 'a'),
      segment(1, 5_000, 'a', 'b'),
    ],
    hasError: false,
    errorMessage: null,
    routeFingerprint: 'fp1',
  }
  const outbound = summarizeOutboundTravelFeeDistance(plan)
  assert(outbound.outboundComplete, 'complete')
  assertEq(outbound.outboundMeters, 15_000, 'outbound only')
  const withReturn = buildTravelFeeRoundTripRecommendation({
    outboundComplete: true,
    outboundMeters: outbound.outboundMeters,
    returnMeters: 12_000,
    freeDistanceKm: 200,
    status: 'unresolved',
    routeFingerprint: 'fp1',
    lastPlaceId: outbound.lastPlaceId,
    canFetchReturn: true,
  })
  assertEq(withReturn.roundTripMeters, 27_000, 'round trip')
})

run('stripped plan.places (shared RQ cache) needs wedding-places authority', () => {
  const place = (id: string, role: WeddingPlace['role'], sort: number): WeddingPlace => ({
    id,
    weddingId: 'w-fail',
    role,
    label: role,
    placeId: `p-${id}`,
    formattedAddress: 'Addr',
    latitude: 50 + sort / 1000,
    longitude: 19 + sort / 1000,
    sortOrder: sort,
    createdAt: '',
    updatedAt: '',
  })
  const segment = (
    seq: number,
    meters: number,
    from: string | null,
    to: string,
  ): TravelSegment => ({
    id: `s${seq}`,
    weddingId: 'w-fail',
    sequence: seq,
    originKind: from ? 'wedding_place' : 'studio',
    originWeddingPlaceId: from,
    destinationKind: 'wedding_place',
    destinationWeddingPlaceId: to,
    endpointsHash: `${from ?? 'studio'}>${to}`,
    distanceMeters: meters,
    distanceText: `${Math.round(meters / 1000)} km`,
    durationSeconds: 600,
    durationText: '10 min',
    travelMode: 'DRIVE',
    provider: 'google',
    status: 'ok',
    errorMessage: null,
    calculatedAt: '',
    createdAt: '',
    updatedAt: '',
  })
  const places = [
    place('bride', 'bride_preparation', 1000),
    place('groom', 'groom_preparation', 2000),
    place('ceremony', 'ceremony', 3000),
    place('reception', 'reception', 4000),
  ]
  const studio = {
    id: 'st',
    userId: 'u',
    studioName: 'Studio',
    street: null,
    buildingNumber: null,
    postalCode: null,
    city: 'Gliwice',
    country: 'Polska',
    formattedAddress: 'Gliwice',
    latitude: 50.29,
    longitude: 18.67,
    placeId: 'studio',
    freeDistanceKm: 200,
    createdAt: '',
    updatedAt: '',
  }
  const segments = [
    segment(0, 12_000, null, 'bride'),
    segment(1, 8_000, 'bride', 'groom'),
    segment(2, 90_000, 'groom', 'ceremony'),
    segment(3, 40_000, 'ceremony', 'reception'),
  ]
  // Cockpit / Plan dnia write travel-plan with places: [] intentionally.
  const cachedPlan: TravelPlan = {
    weddingId: 'w-fail',
    studio,
    places: [],
    segments,
    hasError: false,
    errorMessage: null,
    routeFingerprint: 'fp-fail',
    routeStale: false,
  }
  const withoutAuthority = summarizeOutboundTravelFeeDistance(cachedPlan)
  assert(
    !withoutAuthority.outboundComplete,
    'empty plan.places alone → incomplete (bug repro)',
  )

  const withAuthority = summarizeOutboundTravelFeeDistance(cachedPlan, {
    places,
    orderedPlaceIds: places.map((p) => p.id),
  })
  assert(
    withAuthority.outboundComplete,
    'wedding-places override restores complete outbound',
  )
  assertEq(withAuthority.outboundMeters, 150_000, 'outbound meters')
  assertEq(withAuthority.lastPlaceId, 'reception', 'last place')

  // Still incomplete when a leg is genuinely missing — do not invent distance.
  const missingLeg: TravelPlan = {
    ...cachedPlan,
    segments: segments.slice(0, 3),
  }
  const stillIncomplete = summarizeOutboundTravelFeeDistance(missingLeg, {
    places,
    orderedPlaceIds: places.map((p) => p.id),
  })
  assert(!stillIncomplete.outboundComplete, 'missing leg stays incomplete')
})

run('TravelFeeResolveModal uses wedding-places SoT (source)', () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/travel-fee/TravelFeeResolveModal.tsx',
    ),
    'utf8',
  )
  assert(src.includes('weddingPlacesQueryKey'), 'loads wedding places')
  assert(src.includes('getOperationalOrderedPlaces'), 'operational order')
  assert(
    src.includes('summarizeOutboundTravelFeeDistance(travelPlan, {'),
    'passes places authority into summarizer',
  )
  assert(src.includes('places: []'), 'strips plan.places in shared cache write')
  assert(
    !src.includes('travelPlan?.places.find'),
    'return leg must not read stripped plan.places',
  )
})

run('migration does not rewrite contract_value (source check)', () => {
  const sql = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260813160000_travel_fee_commercial.sql',
    ),
    'utf8',
  )
  assert(
    sql.includes("default 'unresolved'"),
    'status default backfills existing rows',
  )
  assert(sql.includes('not null default 0'), 'amount default')
  assert(sql.includes('resolve_wedding_travel_fee'), 'rpc')
  assert(
    sql.includes('Do NOT UPDATE public.weddings here'),
    'documents no migration-time UPDATE',
  )
  assert(
    !sql.includes('coalesce(travel_fee_status, \'unresolved\')'),
    'redundant coalesce backfill removed',
  )
  assert(
    !/update public\.weddings\s+set\s+travel_fee_status = coalesce/i.test(sql),
    'no migration-time travel fee UPDATE',
  )
  assert(sql.includes('MUST NOT rewrite existing contract_value'), 'no CV rewrite intent')
  assert(sql.includes('travel_fee'), 'extras path uses travel')
})

run('RPC computes package_base minus travel (source)', () => {
  const sql = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260813160000_travel_fee_commercial.sql',
    ),
    'utf8',
  )
  assert(sql.includes('v_prev_travel'), 'prev travel')
  assert(sql.includes('v_new_travel'), 'new travel')
  assert(sql.includes('package_base'), 'package base')
})

run('A/B. unresolved + charged empty draft preview does not throw', () => {
  const empty = previewTravelFeeContractValue({
    currentContractValue: 5000,
    extrasTotal: 0,
    previousEffectiveTravel: 0,
    nextStatus: 'charged',
    nextAmount: 0,
  })
  assertEq(empty, null, 'empty charged → null preview')
  assertEq(
    isValidTravelFeeDraft({ status: 'charged', amount: 0 }),
    false,
    'empty charged invalid',
  )
})

run('C. charged draft 0 is invalid for save', () => {
  assertEq(
    isValidTravelFeeDraft({ status: 'charged', amount: 0 }),
    false,
    '0 invalid',
  )
})

run('D. charged draft 350 preview valid', () => {
  const preview = previewTravelFeeContractValue({
    currentContractValue: 5000,
    extrasTotal: 0,
    previousEffectiveTravel: 0,
    nextStatus: 'charged',
    nextAmount: 350,
  })
  assertEq(preview, 5350, 'preview 5350')
  assertEq(
    isValidTravelFeeDraft({ status: 'charged', amount: 350 }),
    true,
    'valid',
  )
})

run('E. included amount 0 valid', () => {
  assertEq(
    isValidTravelFeeDraft({ status: 'included', amount: 0 }),
    true,
    'included ok',
  )
  const preview = previewTravelFeeContractValue({
    currentContractValue: 5350,
    extrasTotal: 0,
    previousEffectiveTravel: 350,
    nextStatus: 'included',
    nextAmount: 0,
  })
  assertEq(preview, 5000, 'removes travel')
})

run('F. existing charged 350 opens with valid preview', () => {
  const wedding = baseWedding({
    price: 5350,
    travelFeeStatus: 'charged',
    travelFeeAmount: 350,
  })
  const preview = previewTravelFeeContractValue({
    currentContractValue: wedding.price,
    extrasTotal: 0,
    previousEffectiveTravel: getEffectiveTravelFeeAmount(wedding),
    nextStatus: 'charged',
    nextAmount: 350,
  })
  assertEq(preview, 5350, 'idempotent preview')
})

run('G. strict domain still rejects charged + 0', () => {
  let threw = false
  try {
    normalizeTravelFeeDecision({ status: 'charged', amount: 0 })
  } catch (err) {
    threw =
      err instanceof Error && err.message === 'CHARGED_REQUIRES_POSITIVE_AMOUNT'
  }
  assert(threw, 'strict throw')
})

run('modal uses non-throwing draft preview (source)', () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/travel-fee/TravelFeeResolveModal.tsx',
    ),
    'utf8',
  )
  assert(src.includes('isDraftValid'), 'draft gate')
  assert(src.includes('preview == null'), 'null-safe preview render')
  assert(src.includes('disabled={!canSave}'), 'save disabled')
  const service = readFileSync(
    resolve(process.cwd(), 'src/lib/api/weddingTravelFeeService.ts'),
    'utf8',
  )
  assert(service.includes('previewTravelFeeContractValue'), 'service uses draft preview')
  assert(
    !/previewContractValue[\s\S]*normalizeTravelFeeDecision/.test(service),
    'preview no longer calls strict normalizer',
  )
})

console.log('\nTravel fee acceptance complete.')
