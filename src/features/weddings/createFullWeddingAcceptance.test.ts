/**
 * Full Create orchestration — Phase 2.
 * Run: npm run test:create-full-wedding
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  collectFullCreateExtras,
  collectFullCreatePlaces,
  createFullWedding,
  FullCreatePartialError,
  isFullCreatePartialError,
  type CreateFullWeddingDeps,
  type CreateFullWeddingInput,
} from '@/features/weddings/createFullWedding'
import { buildNewWeddingCreatePayload } from '@/features/weddings/buildNewWeddingCreatePayload'
import { recomputeContractValueAfterExtrasSync } from '@/lib/forms/weddingExtraPricing'
import type { AddWeddingExtraServiceInput } from '@/lib/api/weddingExtraServiceService'
import type { WeddingExtraService } from '@/types/package'
import type { GeoPlace, WeddingPlace, WeddingPlaceRole } from '@/types/travel'
import type { CreateWeddingInput, Wedding } from '@/types/wedding'

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

function assertIncludes(src: string, needle: string, message: string) {
  assert(src.includes(needle), `${message}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, message: string) {
  assert(!src.includes(needle), `${message}: must not include ${JSON.stringify(needle)}`)
}

const jobs: Promise<void>[] = []

function run(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn()
    if (result && typeof (result as Promise<void>).then === 'function') {
      jobs.push(
        result
          .then(() => {
            console.log(`PASS  ${name}`)
          })
          .catch((err: unknown) => {
            console.error(`FAIL  ${name}`)
            console.error(err instanceof Error ? err.message : err)
            process.exitCode = 1
          }),
      )
      return
    }
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const orchSrc = read('src/features/weddings/createFullWedding.ts')
const hookSrc = read('src/features/weddings/hooks/useCreateFullWedding.ts')
const pageSrc = read('src/pages/NewWeddingPage.tsx')
const payloadSrc = read('src/features/weddings/buildNewWeddingCreatePayload.ts')

function stubWedding(overrides: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w-full-1',
    couple: {
      partner1: 'Anna Kowalska',
      partner2: 'Kamil Nowak',
      email: '',
      phone: '',
      venue: '',
      city: '',
    },
    date: '2027-06-12',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Video Standard',
    packageId: 'pkg-1',
    price: 10500,
    depositAmount: 1000,
    currency: 'PLN',
    accentColor: '#0a0a0a',
    packageItems: [],
    travelFeeStatus: 'unresolved',
    travelFeeAmount: 0,
    travelFeeResolvedAt: null,
    travelFeeFreeKmSnapshot: null,
    travelFeeRouteDistanceMSnapshot: null,
    travelFeeNote: null,
    coverageHours: null,
    coverageEndTime: null,
    overtimeRate: null,
    deliveryMonths: null,
    deliveryDays: null,
    deliveryDueDate: null,
    deliveryDueSource: null,
    deliveryCompletedAt: null,
    finalPaymentTerms: null,
    finalPaymentDueDate: null,
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
    createdAt: '2026-08-20',
    ...overrides,
  }
}

function geo(partial: Partial<GeoPlace> & { formattedAddress: string }): GeoPlace {
  return {
    placeId: partial.placeId ?? null,
    formattedAddress: partial.formattedAddress,
    latitude: partial.latitude ?? null,
    longitude: partial.longitude ?? null,
    label: partial.label ?? null,
    provider: partial.provider ?? 'google',
  }
}

type Harness = {
  order: string[]
  placeInserts: Array<{ role: WeddingPlaceRole; place: GeoPlace }>
  extrasAdded: AddWeddingExtraServiceInput[]
  updates: Wedding[]
  deps: CreateFullWeddingDeps
}

function makeHarness(options?: {
  failPhase?: 'places' | 'extras' | 'commercial_recompute'
  createPrice?: number
}): Harness {
  const order: string[] = []
  const placeInserts: Array<{ role: WeddingPlaceRole; place: GeoPlace }> = []
  const extrasAdded: AddWeddingExtraServiceInput[] = []
  const updates: Wedding[] = []

  const deps: CreateFullWeddingDeps = {
    createWedding: async (input) => {
      order.push('create')
      return stubWedding({ price: options?.createPrice ?? input.price })
    },
    insertInitialWeddingPlaces: async (_weddingId, places) => {
      order.push('places')
      if (options?.failPhase === 'places') throw new Error('places-fail')
      placeInserts.push(...places)
      return places.map((row, index) => ({
        id: `place-${index}`,
        weddingId: 'w-full-1',
        role: row.role,
        label: row.place.label ?? null,
        placeId: row.place.placeId,
        formattedAddress: row.place.formattedAddress,
        latitude: row.place.latitude,
        longitude: row.place.longitude,
        sortOrder: index,
        createdAt: '2026-08-20',
        updatedAt: '2026-08-20',
      })) satisfies WeddingPlace[]
    },
    addExtra: async (input) => {
      order.push('extras')
      if (options?.failPhase === 'extras') throw new Error('extras-fail')
      extrasAdded.push(input)
      return {
        id: `extra-${extrasAdded.length}`,
        weddingId: input.weddingId,
        extraServiceId: input.extraServiceId,
        priceSnapshot: input.priceSnapshot ?? 0,
        quantity: input.quantity ?? 1,
        createdAt: '2026-08-20',
      } satisfies WeddingExtraService
    },
    updateWedding: async (wedding) => {
      order.push('commercial_recompute')
      if (options?.failPhase === 'commercial_recompute') {
        throw new Error('cv-fail')
      }
      updates.push(wedding)
      return wedding
    },
  }

  return { order, placeInserts, extrasAdded, updates, deps }
}

function baseInput(
  overrides: Partial<CreateFullWeddingInput> = {},
): CreateFullWeddingInput {
  return {
    wedding: {
      partner1: 'Anna Kowalska',
      partner2: 'Kamil Nowak',
      date: '2027-06-12',
      packageId: 'pkg-1',
      packageName: 'Video Standard',
      price: 10500,
      depositPaid: false,
    },
    ...overrides,
  }
}

run('A — base wedding is created before related records', async () => {
  const harness = makeHarness()
  await createFullWedding(
    baseInput({
      places: { ceremony: geo({ formattedAddress: 'Kościół', placeId: 'p1' }) },
      extras: [{ extraServiceId: 'ex-1', priceSnapshot: 900 }],
    }),
    harness.deps,
  )
  assertEq(harness.order[0], 'create', 'create first')
  assert(harness.order.indexOf('places') > 0, 'places after create')
  assert(harness.order.indexOf('extras') > harness.order.indexOf('places'), 'extras after places')
})

run('B — zero places + zero extras succeeds', async () => {
  const harness = makeHarness()
  const result = await createFullWedding(baseInput(), harness.deps)
  assertEq(result.wedding.id, 'w-full-1', 'wedding')
  assertEq(result.places.length, 0, 'no places')
  assertEq(result.extras.length, 0, 'no extras')
  assertEq(harness.order.join(','), 'create', 'only create')
  assertEq(result.wedding.questionnaires.contractData.status, 'not_sent', 'not_sent')
})

run('C — no questionnaire persistence', () => {
  assertNotIncludes(orchSrc, 'persistWeddingContractAnswerFields', 'no persist answers')
  assertNotIncludes(orchSrc, 'createFormInstance', 'no form instance')
  assertNotIncludes(orchSrc, 'writeSubmittedAnswers', 'no submitted answers')
  assertNotIncludes(orchSrc, 'submitForm', 'no submit')
})

run('D — deposit remains delegated to weddingService.create', async () => {
  const harness = makeHarness()
  await createFullWedding(
    baseInput({
      wedding: {
        partner1: 'Anna Kowalska',
        partner2: 'Kamil Nowak',
        date: '2027-06-12',
        packageName: 'Video Standard',
        price: 10500,
        depositPaid: true,
        depositAmount: 1000,
      },
    }),
    harness.deps,
  )
  assertNotIncludes(orchSrc, 'paymentService', 'orchestrator does not create payments')
  let forwarded: CreateWeddingInput | undefined
  await createFullWedding(
    baseInput({
      wedding: {
        partner1: 'A',
        partner2: 'B',
        date: '2027-06-12',
        packageName: '',
        price: 0,
        depositPaid: true,
        depositAmount: 1000,
      },
    }),
    {
      ...makeHarness().deps,
      createWedding: async (input) => {
        forwarded = input
        return stubWedding({ price: input.price })
      },
    },
  )
  assertEq(forwarded?.depositPaid, true, 'depositPaid forwarded')
  assertEq(forwarded?.depositAmount, 1000, 'depositAmount forwarded')
})

run('E — all four roles passed to insertInitialWeddingPlaces', async () => {
  const harness = makeHarness()
  await createFullWedding(
    baseInput({
      places: {
        bridePreparation: geo({
          formattedAddress: 'Dom panny',
          placeId: 'b1',
          latitude: 50.1,
          longitude: 19.9,
          label: 'Grabowa',
        }),
        groomPreparation: geo({ formattedAddress: 'Dom pana', placeId: 'g1' }),
        ceremony: geo({ formattedAddress: 'Kościół', placeId: 'c1' }),
        reception: geo({ formattedAddress: 'Sala', placeId: 'r1' }),
      },
    }),
    harness.deps,
  )
  assertEq(harness.placeInserts.length, 4, 'four roles')
  assertEq(harness.placeInserts.map((p) => p.role).join(','), 'bride_preparation,groom_preparation,ceremony,reception', 'order')
})

run('F — only non-empty roles persist; placeholders skipped', () => {
  const rows = collectFullCreatePlaces({
    bridePreparation: geo({ formattedAddress: 'Dom panny', placeId: 'b1' }),
    groomPreparation: '   ',
    ceremony: '—',
    reception: null,
  })
  assertEq(rows.length, 1, 'only bride prep')
  assertEq(rows[0]?.role, 'bride_preparation', 'role')
  assertEq(collectFullCreatePlaces(undefined).length, 0, 'undefined places')
})

run('G — GeoPlace metadata is preserved', async () => {
  const harness = makeHarness()
  await createFullWedding(
    baseInput({
      places: {
        ceremony: {
          formattedAddress: 'Kościół pw. św. Anny',
          placeId: 'ChIJabc',
          latitude: 50.061,
          longitude: 19.937,
          name: 'Kościół św. Anny',
          provider: 'google',
        },
      },
    }),
    harness.deps,
  )
  const ceremony = harness.placeInserts[0]
  assert(ceremony != null, 'inserted')
  assertEq(ceremony?.place.placeId, 'ChIJabc', 'placeId')
  assertEq(ceremony?.place.formattedAddress, 'Kościół pw. św. Anny', 'formatted')
  assertEq(ceremony?.place.latitude, 50.061, 'lat')
  assertEq(ceremony?.place.longitude, 19.937, 'lng')
  assertEq(ceremony?.place.label, 'Kościół św. Anny', 'label from name')
})

run('H — no geocode / route / travel during create', () => {
  assertNotIncludes(orchSrc, 'travelProvider', 'no travel provider')
  assertNotIncludes(orchSrc, 'travelService', 'no travel service')
  assertNotIncludes(orchSrc, 'geocode', 'no geocode')
  assertNotIncludes(orchSrc, 'recalculate', 'no route recalc')
  assertIncludes(orchSrc, 'insertInitialWeddingPlaces', 'uses non-geocoding insert')
  assertIncludes(orchSrc, 'normalizeLocationAnswer', 'existing location parse')
  assertIncludes(orchSrc, 'mergeLocationAnswerWithExisting', 'existing geo merge')
})

run('I — venue collapse is not canonical Full Create storage', () => {
  assertNotIncludes(orchSrc, 'ceremonyLocation', 'does not map ceremony scalar')
  assertNotIncludes(orchSrc, 'receptionLocation', 'does not map reception scalar')
  assertNotIncludes(orchSrc, 'venue', 'does not write venue')
  assertIncludes(orchSrc, 'insertInitialWeddingPlaces', 'places service')
})

run('J — selected extras call canonical add', async () => {
  const harness = makeHarness()
  await createFullWedding(
    baseInput({
      extras: [{ extraServiceId: 'ex-drone', priceSnapshot: 900, quantity: 1 }],
    }),
    harness.deps,
  )
  assertEq(harness.extrasAdded.length, 1, 'one add')
  assertEq(harness.extrasAdded[0]?.extraServiceId, 'ex-drone', 'id')
  assertIncludes(orchSrc, 'addExtra', 'deps add')
  assertIncludes(orchSrc, 'weddingExtraServiceService.add', 'canonical service')
})

run('K — each extra exactly once (duplicate ids collapsed)', () => {
  const rows = collectFullCreateExtras([
    { extraServiceId: 'ex-drone', priceSnapshot: 900 },
    { extraServiceId: 'ex-drone', priceSnapshot: 900 },
    { extraServiceId: 'ex-album', priceSnapshot: 400 },
  ])
  assertEq(rows.length, 2, 'two unique')
  assertEq(rows[0]?.extraServiceId, 'ex-drone', 'first')
  assertEq(rows[1]?.extraServiceId, 'ex-album', 'second')
})

run('L — catalog price snapshot is preserved', async () => {
  const harness = makeHarness()
  await createFullWedding(
    baseInput({
      extras: [{ extraServiceId: 'ex-drone', priceSnapshot: 900 }],
    }),
    harness.deps,
  )
  assertEq(harness.extrasAdded[0]?.priceSnapshot, 900, 'snapshot')
})

run('M — zero extras causes no add calls', async () => {
  const harness = makeHarness()
  await createFullWedding(baseInput({ extras: [] }), harness.deps)
  assertEq(harness.extrasAdded.length, 0, 'no add')
  assert(!harness.order.includes('extras'), 'no extras phase')
})

run('N — 10 500 + 900 = 11 400', async () => {
  const harness = makeHarness({ createPrice: 10500 })
  const result = await createFullWedding(
    baseInput({
      extras: [{ extraServiceId: 'ex-1', priceSnapshot: 900 }],
    }),
    harness.deps,
  )
  assertEq(result.wedding.price, 11400, 'cv')
})

run('O — 10 500 + 900 + 400 = 11 800', async () => {
  const harness = makeHarness({ createPrice: 10500 })
  const result = await createFullWedding(
    baseInput({
      extras: [
        { extraServiceId: 'ex-1', priceSnapshot: 900 },
        { extraServiceId: 'ex-2', priceSnapshot: 400 },
      ],
    }),
    harness.deps,
  )
  assertEq(result.wedding.price, 11800, 'cv')
  assertEq(result.extras.length, 2, 'two extras')
})

run('P — manual package 11 000 + 900 = 11 900', async () => {
  const harness = makeHarness({ createPrice: 11000 })
  const result = await createFullWedding(
    {
      wedding: {
        partner1: 'A',
        partner2: 'B',
        date: '2027-06-12',
        packageName: 'Video Standard',
        price: 11000,
        depositPaid: false,
      },
      extras: [{ extraServiceId: 'ex-1', priceSnapshot: 900 }],
      explicitPackagePrice: 11000,
    },
    harness.deps,
  )
  assertEq(result.wedding.price, 11900, 'manual + extra')
  assertEq(
    recomputeContractValueAfterExtrasSync({
      currentWeddingPrice: 11000,
      extrasBeforeSync: [],
      extrasAfterSync: [{ priceSnapshot: 900, quantity: 1 }],
      effectiveTravelFee: 0,
      explicitPackagePrice: 11000,
    }),
    11900,
    'helper agrees',
  )
})

run('Q — zero extras keeps original CV (no price update)', async () => {
  const harness = makeHarness({ createPrice: 10500 })
  const result = await createFullWedding(baseInput(), harness.deps)
  assertEq(result.wedding.price, 10500, 'unchanged')
  assertEq(harness.updates.length, 0, 'no update')
})

run('R — existing recomputeContractValueAfterExtrasSync is used', () => {
  assertIncludes(orchSrc, 'recomputeContractValueAfterExtrasSync', 'helper import/call')
  assertIncludes(orchSrc, 'getEffectiveTravelFeeAmount', 'travel helper')
  assertIncludes(orchSrc, 'explicitPackagePrice', 'manual base')
})

run('S — no new pricing formula in orchestrator', () => {
  assertNotIncludes(orchSrc, 'price + ', 'no incremental add')
  assertNotIncludes(orchSrc, 'extrasTotal', 'no local extras sum formula')
  assertIncludes(
    orchSrc,
    "from '@/lib/forms/weddingExtraPricing'",
    'imports existing helper',
  )
})

run('T — place failure after create exposes weddingId + phase places', async () => {
  const harness = makeHarness({ failPhase: 'places' })
  try {
    await createFullWedding(
      baseInput({
        places: { ceremony: geo({ formattedAddress: 'Kościół', placeId: 'c1' }) },
      }),
      harness.deps,
    )
    throw new Error('expected failure')
  } catch (err) {
    assert(isFullCreatePartialError(err), 'typed partial error')
    if (!isFullCreatePartialError(err)) return
    assertEq(err.weddingId, 'w-full-1', 'weddingId')
    assertEq(err.phase, 'places', 'phase')
    assertEq(err.wedding.id, 'w-full-1', 'wedding remains')
    assert(harness.order.includes('create'), 'created')
  }
})

run('U — extras failure after create exposes weddingId + phase extras', async () => {
  const harness = makeHarness({ failPhase: 'extras' })
  try {
    await createFullWedding(
      baseInput({
        extras: [{ extraServiceId: 'ex-1', priceSnapshot: 900 }],
      }),
      harness.deps,
    )
    throw new Error('expected failure')
  } catch (err) {
    assert(isFullCreatePartialError(err), 'typed partial error')
    if (!isFullCreatePartialError(err)) return
    assertEq(err.weddingId, 'w-full-1', 'weddingId')
    assertEq(err.phase, 'extras', 'phase')
  }
})

run('V — commercial update failure leaves extras; phase commercial_recompute', async () => {
  const harness = makeHarness({ failPhase: 'commercial_recompute' })
  try {
    await createFullWedding(
      baseInput({
        extras: [{ extraServiceId: 'ex-1', priceSnapshot: 900 }],
      }),
      harness.deps,
    )
    throw new Error('expected failure')
  } catch (err) {
    assert(isFullCreatePartialError(err), 'typed partial error')
    if (!isFullCreatePartialError(err)) return
    assertEq(err.weddingId, 'w-full-1', 'weddingId')
    assertEq(err.phase, 'commercial_recompute', 'phase')
    assertEq(harness.extrasAdded.length, 1, 'extras already written')
    assertEq(err.wedding.price, 10500, 'create price retained on error')
  }
})

run('W — Quick Create still bypasses orchestration', () => {
  assertIncludes(pageSrc, 'useCreateWedding', 'page still simple create')
  assertIncludes(pageSrc, 'useCreateFullWedding', 'full path wired')
  assertIncludes(
    pageSrc,
    'data.completeLater\n          ? await createWedding.mutateAsync(buildNewWeddingCreatePayload(data))',
    'Quick Create explicit simple mutation branch',
  )
  assertNotIncludes(payloadSrc, 'createFullWedding', 'payload helper unchanged')
  const quick = buildNewWeddingCreatePayload({
    partner1: 'Anna Kowalska',
    partner2: 'Michał Nowak',
    date: '2027-06-12',
    completeLater: true,
    packageId: 'pkg-1',
    packageName: 'Video Standard',
    price: 10500,
    depositPaid: true,
  })
  assertEq(quick.packageId, null, 'quick packageId')
  assertEq(quick.price, 0, 'quick price')
  assertEq(quick.depositPaid, false, 'quick deposit')
})

run('X — hook invalidates places + extras without new mega keys', () => {
  assertIncludes(hookSrc, "queryKey: ['weddings']", 'weddings')
  assertIncludes(hookSrc, "queryKey: ['wedding-places']", 'places')
  assertIncludes(hookSrc, "queryKey: ['wedding-extras']", 'extras')
  assertIncludes(hookSrc, "queryKey: ['calendar']", 'calendar')
  assertIncludes(hookSrc, "queryKey: ['dashboard']", 'dashboard')
  assertIncludes(hookSrc, 'invalidateFinanceQueries', 'finance')
})

run('Y — FullCreatePartialError is distinguishable', () => {
  const err = new FullCreatePartialError({
    wedding: stubWedding(),
    phase: 'places',
  })
  assert(err instanceof Error, 'error')
  assert(isFullCreatePartialError(err), 'guard')
  assertEq(err.code, 'FULL_CREATE_PARTIAL', 'code')
  assert(!isFullCreatePartialError(new Error('x')), 'plain error')
})

await Promise.all(jobs)
