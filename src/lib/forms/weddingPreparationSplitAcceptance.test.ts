/**
 * Bride/groom preparation split + Travel/detail consistency.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildTravelFlow } from '@/features/travel/travelUi'
import type { TravelPlan, WeddingPlace } from '@/types/travel'

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

function place(
  role: WeddingPlace['role'],
  address: string,
  id: string,
): WeddingPlace {
  return {
    id,
    weddingId: 'w1',
    role,
    label: address,
    placeId: `pid-${id}`,
    formattedAddress: address,
    latitude: 52 + id.length * 0.01,
    longitude: 21,
    sortOrder: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

run('1–2. Wedding detail hero shows bride and groom preparation separately', () => {
  const hero = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/components/detail/WeddingDetailHero.tsx',
    ),
    'utf8',
  )
  assert(hero.includes("role: 'bride_preparation'"), 'bride role')
  assert(hero.includes("role: 'groom_preparation'"), 'groom role')
  assert(hero.includes('Przygotowania Panny Młodej'), 'bride label')
  assert(hero.includes('Przygotowania Pana Młodego'), 'groom label')
  assert(
    !hero.includes("label: 'Przygotowania'"),
    'no generic Przygotowania label',
  )
})

run('3–4. Editing bride vs groom uses distinct roles (no cross-write)', () => {
  const hero = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/components/detail/WeddingDetailHero.tsx',
    ),
    'utf8',
  )
  assert(hero.includes('saveMutation.mutateAsync({ role, place })'), 'role scoped')
  assert(hero.includes('LOCATION_FIELDS.map'), 'per-field map')
})

run('5. Questionnaire maps into same canonical fields', () => {
  const blocks = readFileSync(
    resolve(process.cwd(), 'src/types/questionnaireBlocks.ts'),
    'utf8',
  )
  assert(
    blocks.includes("bride_preparation: 'bridePreparationLocation'"),
    'bride map',
  )
  assert(
    blocks.includes("groom_preparation: 'groomPreparationLocation'"),
    'groom map',
  )
  const q = readFileSync(
    resolve(process.cwd(), 'src/lib/api/questionnaireService.ts'),
    'utf8',
  )
  assert(q.includes("role: 'bride_preparation'"), 'sync bride place')
  assert(q.includes("role: 'groom_preparation'"), 'sync groom place')
})

run('6–8. Travel creates distinct stops, markers, route order', () => {
  const plan: TravelPlan = {
    weddingId: 'w1',
    studio: {
      id: 's1',
      userId: 'u1',
      studioName: 'Studio',
      street: null,
      buildingNumber: null,
      postalCode: null,
      city: null,
      country: 'PL',
      formattedAddress: 'Studio Addr',
      latitude: 52.2,
      longitude: 21.0,
      placeId: 'studio',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    places: [
      place('bride_preparation', 'Bride Prep', 'b'),
      place('groom_preparation', 'Groom Prep', 'g'),
      place('ceremony', 'Ceremony', 'c'),
      place('reception', 'Reception', 'r'),
    ],
    segments: [],
    hasError: false,
    errorMessage: null,
  }
  const flow = buildTravelFlow(plan)
  assertEq(flow.stops.length, 5, '5 stops with studio')
  assertEq(flow.stops[1].role, 'bride_preparation', 'bride')
  assertEq(flow.stops[2].role, 'groom_preparation', 'groom')
  assertEq(flow.stops[3].role, 'ceremony', 'ceremony')
  assertEq(flow.stops[4].role, 'reception', 'reception')
  assertEq(flow.stops[0].kind, 'studio', 'studio first')
  assertEq(flow.stops[0].markerIndex, 0, 'base marker Start/0')
  assertEq(flow.stops[1].markerIndex, 1, 'first wedding marker')
  assert(flow.stops.slice(1).every((s) => s.markerIndex >= 1), 'wedding markers')
  assertEq(flow.routeLegs.length, 4, '4 legs including base')
  assertEq(flow.routeLegs[0].origin.kind, 'studio', 'first leg from base')
  assert(!flow.routeLegs.some((l) => l.destination.kind === 'studio'), 'no return')

  const travel = readFileSync(
    resolve(process.cwd(), 'src/lib/api/travelService.ts'),
    'utf8',
  )
  assert(travel.includes("'bride_preparation'"), 'STOP_ORDER bride')
  assert(travel.includes("'groom_preparation'"), 'STOP_ORDER groom')
  const stopOrderBlock = travel.slice(
    travel.indexOf('const STOP_ORDER'),
    travel.indexOf(']', travel.indexOf('const STOP_ORDER')) + 1,
  )
  assert(!stopOrderBlock.includes("'preparation'"), 'no legacy in STOP_ORDER')
})

run('9. Missing one preparation stop is omitted cleanly', () => {
  const plan: TravelPlan = {
    weddingId: 'w1',
    studio: null,
    places: [
      place('bride_preparation', 'Bride Prep', 'b'),
      place('ceremony', 'Ceremony', 'c'),
      place('reception', 'Reception', 'r'),
    ],
    segments: [],
    hasError: false,
    errorMessage: null,
  }
  const flow = buildTravelFlow(plan)
  assertEq(flow.stops.length, 3, '3 stops')
  assert(!flow.stops.some((s) => s.role === 'groom_preparation'), 'no empty groom')
})

run('10. Legacy generic preparation remains readable (compat → bride)', () => {
  const placeService = readFileSync(
    resolve(process.cwd(), 'src/lib/api/weddingPlaceService.ts'),
    'utf8',
  )
  assert(
    placeService.includes(
      "if (role === 'preparation') return 'bride_preparation'",
    ),
    'normalize to bride',
  )
  const plan: TravelPlan = {
    weddingId: 'w1',
    studio: null,
    places: [place('preparation', 'Old Prep Addr', 'legacy')],
    segments: [],
    hasError: false,
    errorMessage: null,
  }
  const flow = buildTravelFlow(plan)
  assertEq(flow.stops.length, 1, 'legacy stop')
  assertEq(flow.stops[0].role, 'bride_preparation', 'compat role')
  assertEq(flow.stops[0].address, 'Old Prep Addr', 'address')
})

run('11. No active UI label uses only Przygotowania for canonical fields', () => {
  const hero = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/components/detail/WeddingDetailHero.tsx',
    ),
    'utf8',
  )
  const travelUi = readFileSync(
    resolve(process.cwd(), 'src/features/travel/travelUi.ts'),
    'utf8',
  )
  const template = readFileSync(
    resolve(process.cwd(), 'src/lib/forms/contractQuestionnaireTemplate.ts'),
    'utf8',
  )
  for (const src of [hero, travelUi, template]) {
    assert(src.includes('Przygotowania Panny Młodej'), 'bride label present')
    assert(src.includes('Przygotowania Pana Młodego'), 'groom label present')
  }
  assert(
    travelUi.includes('Przygotowania — starszy zapis'),
    'legacy heading only',
  )
})

run('12. New wedding flow does not write merged preparation field', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'src/pages/NewWeddingPage.tsx'),
    'utf8',
  )
  assert(page.includes('ceremonyLocation'), 'ceremony')
  assert(page.includes('receptionLocation'), 'reception')
  assert(!page.includes('preparationLocation'), 'no prep write')
  assert(!page.includes('bridePreparationLocation'), 'short wizard ok')
})

run('guard: active write paths do not upsert role preparation', () => {
  const placeService = readFileSync(
    resolve(process.cwd(), 'src/lib/api/weddingPlaceService.ts'),
    'utf8',
  )
  assert(placeService.includes("role: 'bride_preparation'"), 'writes bride')
  assert(placeService.includes("role: 'groom_preparation'"), 'writes groom')
  assert(
    !placeService.includes("role: 'preparation'"),
    'no write role preparation',
  )

  const srcRoot = resolve(process.cwd(), 'src')
  const files = [
    'lib/api/questionnaireService.ts',
    'features/weddings/components/detail/WeddingDetailHero.tsx',
    'lib/api/travelService.ts',
  ]
  for (const rel of files) {
    const src = readFileSync(resolve(srcRoot, rel), 'utf8')
    assert(
      !src.includes("role: 'preparation'") &&
        !src.includes('role: "preparation"'),
      `${rel} no preparation role write`,
    )
  }
})

run('migration exists for bride/groom roles', () => {
  const mig = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260725240000_wedding_places_bride_groom_preparation.sql',
    ),
    'utf8',
  )
  assert(mig.includes("role = 'bride_preparation'"), 'migrate to bride')
  assert(mig.includes("'groom_preparation'"), 'groom in check')
  assert(
    mig.includes('never copied to both') ||
      mig.includes('never copied to both'),
    'semantics comment',
  )
})

run('schema.sql has split roles', () => {
  const schema = readFileSync(
    resolve(process.cwd(), 'supabase/schema.sql'),
    'utf8',
  )
  assert(schema.includes("'bride_preparation'"), 'schema bride')
  assert(schema.includes("'groom_preparation'"), 'schema groom')
})

console.log('\nwedding preparation split: done')
