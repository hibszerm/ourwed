/**
 * Compact primary Wedding location — reception venue + locality.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getLocationLocality,
  getWeddingPrimaryLocationSummary,
} from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import type { WeddingPlace } from '@/types/travel'
import type { Couple, Wedding } from '@/types/wedding'

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

function couple(partial: Partial<Couple> = {}): Couple {
  return {
    partner1: 'A',
    partner2: 'B',
    email: '',
    phone: '',
    venue: '',
    city: '',
    ...partial,
  }
}

function wedding(partial: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w1',
    couple: couple(),
    date: '2026-08-01',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Photo + Video Standard',
    price: 0,
    packageItems: [],
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
    accentColor: '#000',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

function place(
  role: WeddingPlace['role'],
  formattedAddress: string,
  label: string | null = null,
): WeddingPlace {
  return {
    id: role,
    weddingId: 'w1',
    role,
    label,
    placeId: `pid-${role}`,
    formattedAddress,
    latitude: 50,
    longitude: 19,
    sortOrder: 10,
    createdAt: '',
    updatedAt: '',
  }
}

run('1. Locality extraction from Polish formatted addresses', () => {
  assertEq(
    getLocationLocality({
      formattedAddress: 'Lwowska 78, 34-144 Izdebnik',
    }),
    'Izdebnik',
    'izdebnik',
  )
  assertEq(
    getLocationLocality({
      formattedAddress: 'Szpitalna 12, 33-332 Kraków',
    }),
    'Kraków',
    'krakow',
  )
  assertEq(
    getLocationLocality({
      formattedAddress: 'Lwowska 78, 34-144 Izdebnik, Polska',
    }),
    'Izdebnik',
    'skip country',
  )
  assertEq(
    getLocationLocality({ city: 'Katowice', formattedAddress: 'x' }),
    'Katowice',
    'structured city',
  )
})

run('2. Reception name beats ceremony', () => {
  const w = wedding()
  const places = [
    place('ceremony', 'Kolegiacka 11, 33-300 Nowy Sącz', 'Bazylika Mniejsza'),
    place(
      'reception',
      'Lwowska 78, 34-144 Izdebnik',
      'Villa Love',
    ),
  ]
  const summary = getWeddingPrimaryLocationSummary(w, places)
  assertEq(summary.displayText, 'Villa Love, Izdebnik', 'kinga')
  assertEq(summary.source, 'reception', 'source')
  assertEq(summary.venueName, 'Villa Love', 'name')
  assertEq(summary.locality, 'Izdebnik', 'locality')
})

run('3. Ceremony fallback when reception absent', () => {
  const summary = getWeddingPrimaryLocationSummary(wedding(), [
    place('ceremony', 'Szpitalna 12, 33-332 Kraków', 'Kościół Mariacki'),
  ])
  assertEq(summary.displayText, 'Kościół Mariacki, Kraków', 'ceremony')
  assertEq(summary.source, 'ceremony', 'source')
})

run('4. Reception address-only → locality; no street as name', () => {
  const summary = getWeddingPrimaryLocationSummary(wedding(), [
    place('reception', 'Lwowska 78, 34-144 Izdebnik', 'Lwowska 78'),
  ])
  assertEq(summary.venueName, null, 'no fake name')
  assertEq(summary.displayText, 'Izdebnik', 'locality only')
})

run('5. Name only / locality only / missing', () => {
  assertEq(
    getWeddingPrimaryLocationSummary(wedding(), [
      place('reception', '', 'Villa Love'),
    ]).displayText,
    'Villa Love',
    'name only',
  )
  // Empty formatted with null coords still has label
  assertEq(
    getWeddingPrimaryLocationSummary(wedding(), [
      {
        ...place('reception', '34-144 Izdebnik', null),
        label: null,
      },
    ]).displayText,
    'Izdebnik',
    'locality from postal city',
  )
  assertEq(
    getWeddingPrimaryLocationSummary(wedding()).displayText,
    null,
    'missing',
  )
})

run('6. Preparation only after reception and ceremony', () => {
  const summary = getWeddingPrimaryLocationSummary(wedding(), [
    place('bride_preparation', 'Domowa 1, 30-001 Kraków', 'Dom Panny Młodej'),
  ])
  assertEq(summary.source, 'preparation', 'prep')
  assertEq(summary.displayText, 'Dom Panny Młodej, Kraków', 'prep text')
})

run('7. Legacy couple.venue / city fallback', () => {
  const summary = getWeddingPrimaryLocationSummary(
    wedding({ couple: couple({ venue: 'Hotel Monopol', city: 'Katowice' }) }),
  )
  assertEq(summary.displayText, 'Hotel Monopol, Katowice', 'legacy')
  assertEq(summary.source, 'legacy', 'source')
})

run('8. Precomputed primaryLocation used without places', () => {
  const summary = getWeddingPrimaryLocationSummary(
    wedding({
      ceremonyLocation: 'Szpitalna 12, 33-332 Kraków',
      primaryLocation: {
        venueName: 'Villa Love',
        locality: 'Izdebnik',
        displayText: 'Villa Love, Izdebnik',
        source: 'reception',
      },
    }),
  )
  assertEq(summary.displayText, 'Villa Love, Izdebnik', 'hydrated wins')
  assert(
    !summary.displayText?.includes('Szpitalna'),
    'ceremony address not shown',
  )
})

run('9. Surfaces use shared helper (source)', () => {
  const card = readFileSync(
    resolve(process.cwd(), 'src/features/weddings/components/WeddingCard.tsx'),
    'utf8',
  )
  assert(card.includes('getWeddingPrimaryLocationSummary'), 'card')
  assert(!card.includes('ceremonyLocation ??'), 'no ceremony prefer')

  const list = readFileSync(
    resolve(process.cwd(), 'src/features/weddings/components/WeddingList.tsx'),
    'utf8',
  )
  assert(list.includes('getWeddingPrimaryLocationSummary'), 'list')
  assert(!list.includes('ceremonyLocation ??'), 'no ceremony prefer list')

  const dash = readFileSync(
    resolve(
      process.cwd(),
      'src/features/dashboard/components/NextWeddingCard.tsx',
    ),
    'utf8',
  )
  assert(
    dash.includes('getDashboardLocationLabel') ||
      dash.includes('getWeddingPrimaryLocationSummary'),
    'dashboard',
  )
  assert(!dash.includes('ceremonyLocation ??'), 'no ceremony prefer dash')

  const dashLoc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/dashboard/presentation/getDashboardLocationLabel.ts',
    ),
    'utf8',
  )
  assert(
    dashLoc.includes('getWeddingPrimaryLocationSummary'),
    'dashboard location wraps primary',
  )

  const header = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingWorkspaceHeader.tsx',
    ),
    'utf8',
  )
  assert(header.includes('getWeddingPrimaryLocationSummary'), 'header')
  assert(!header.includes('getReceptionDisplayName'), 'no old helper')

  const hydrate = readFileSync(
    resolve(process.cwd(), 'src/lib/api/weddings/weddingHydrate.ts'),
    'utf8',
  )
  assert(hydrate.includes('listByWeddingIds'), 'batch places')
  assert(hydrate.includes('primaryLocation'), 'sets primaryLocation')
})

run('10. No street/postal in compact output', () => {
  const text = getWeddingPrimaryLocationSummary(wedding(), [
    place('reception', 'Lwowska 78, 34-144 Izdebnik', 'Villa Love'),
  ]).displayText!
  assert(!text.includes('Lwowska'), 'no street')
  assert(!text.includes('34-144'), 'no postal')
  assert(!text.includes('78'), 'no number')
})
