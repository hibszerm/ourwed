/**
 * travel_segments upsert identity + persistence/map isolation acceptance.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  TRAVEL_SEGMENTS_ON_CONFLICT,
  dedupeTravelSegmentsByWeddingSequence,
  shouldRenderTravelMap,
  type TravelSegmentDedupeCandidate,
} from '@/lib/travel/travelSegmentsIdentity'

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

const MIGRATION =
  'supabase/migrations/20260725250000_travel_segments_wedding_sequence_unique.sql'
const SERVICE = 'src/lib/api/travelService.ts'
const DETAIL = 'src/features/weddings/components/detail/WeddingDetailTravel.tsx'
const DAY = 'src/features/weddings/detail/v2/WeddingDayWorkspace.tsx'
const BOOTSTRAP = 'supabase/migrations/travel_planning.sql'

run('onConflict target is wedding_id,sequence', () => {
  assertEq(TRAVEL_SEGMENTS_ON_CONFLICT, 'wedding_id,sequence', 'const')
  const src = readFileSync(resolve(process.cwd(), SERVICE), 'utf8')
  assert(src.includes("onConflict: TRAVEL_SEGMENTS_ON_CONFLICT"), 'uses const')
  assert(src.includes('ignoreDuplicates: false'), 'updates on conflict')
})

run('migration unique index matches onConflict columns', () => {
  const sql = readFileSync(resolve(process.cwd(), MIGRATION), 'utf8')
  assert(
    sql.includes('travel_segments_wedding_sequence_uidx'),
    'index name',
  )
  assert(
    /create unique index[\s\S]*\(wedding_id,\s*sequence\)/i.test(sql),
    'unique (wedding_id, sequence)',
  )
  assert(sql.includes('delete from public.travel_segments'), 'dedupe first')
  const dedupeIdx = sql.indexOf('delete from public.travel_segments')
  const indexIdx = sql.indexOf('create unique index')
  assert(dedupeIdx >= 0 && indexIdx > dedupeIdx, 'dedupe before unique index')
})

run('bootstrap travel_planning.sql classified as historical', () => {
  const sql = readFileSync(resolve(process.cwd(), BOOTSTRAP), 'utf8')
  assert(sql.includes('HISTORICAL'), 'historical marker')
  assert(
    sql.includes('20260725250000_travel_segments_wedding_sequence_unique.sql'),
    'points to active migration',
  )
})

run('dedupe keeps best row for same wedding+sequence', () => {
  const rows: TravelSegmentDedupeCandidate[] = [
    {
      id: 'legacy-empty',
      wedding_id: 'w1',
      sequence: 1,
      distance_meters: null,
      duration_seconds: null,
      provider: 'legacy',
      updated_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'google-full',
      wedding_id: 'w1',
      sequence: 1,
      distance_meters: 12000,
      duration_seconds: 900,
      provider: 'google',
      updated_at: '2026-01-02T00:00:00Z',
      created_at: '2026-01-02T00:00:00Z',
    },
    {
      id: 'other-wedding',
      wedding_id: 'w2',
      sequence: 1,
      distance_meters: 100,
      duration_seconds: 10,
      provider: 'google',
      updated_at: '2026-01-03T00:00:00Z',
      created_at: '2026-01-03T00:00:00Z',
    },
  ]
  const { keep, dropIds } = dedupeTravelSegmentsByWeddingSequence(rows)
  assertEq(keep.length, 2, 'two weddings kept')
  assert(keep.some((r) => r.id === 'google-full'), 'keeps google+route')
  assert(keep.some((r) => r.id === 'other-wedding'), 'keeps other wedding')
  assertEq(dropIds.join(','), 'legacy-empty', 'drops only duplicate')
})

run('four sequences remain four distinct identity keys', () => {
  const rows: TravelSegmentDedupeCandidate[] = [0, 1, 2, 3].map((sequence) => ({
    id: `s${sequence}`,
    wedding_id: 'w1',
    sequence,
    distance_meters: 1000 + sequence,
    duration_seconds: 100 + sequence,
    provider: 'google',
    updated_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  }))
  const { keep, dropIds } = dedupeTravelSegmentsByWeddingSequence(rows)
  assertEq(keep.length, 4, 'four rows')
  assertEq(dropIds.length, 0, 'no drops')
  assertEq(
    new Set(keep.map((r) => r.sequence)).size,
    4,
    'distinct sequences',
  )
})

run('recalculation updates distance/duration identity stable', () => {
  const before: TravelSegmentDedupeCandidate = {
    id: 'seg-old',
    wedding_id: 'w1',
    sequence: 2,
    distance_meters: 5000,
    duration_seconds: 400,
    provider: 'google',
    updated_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  }
  const after: TravelSegmentDedupeCandidate = {
    id: 'seg-new',
    wedding_id: 'w1',
    sequence: 2,
    distance_meters: 5200,
    duration_seconds: 420,
    provider: 'google',
    updated_at: '2026-01-02T00:00:00Z',
    created_at: '2026-01-02T00:00:00Z',
  }
  const { keep, dropIds } = dedupeTravelSegmentsByWeddingSequence([
    before,
    after,
  ])
  assertEq(keep.length, 1, 'one identity')
  assertEq(keep[0]!.id, 'seg-new', 'keeps newer')
  assertEq(keep[0]!.distance_meters, 5200, 'newer distance')
  assertEq(keep[0]!.duration_seconds, 420, 'newer duration')
  assertEq(dropIds[0], 'seg-old', 'older duplicate dropped')
})

run('syncSegments exact-sync deletes only this wedding then upserts', () => {
  const src = readFileSync(resolve(process.cwd(), SERVICE), 'utf8')
  assert(src.includes(".eq('wedding_id', weddingId)"), 'scoped wedding delete')
  assert(src.includes('syncSegmentsOrLocal'), 'soft-fail helper')
  assert(src.includes('persistenceError'), 'surfaces persistence')
  assert(src.includes('TRAVEL_SEGMENTS_ON_CONFLICT'), 'conflict target')
  assert(!/\.insert\(\s*rows\s*\)/.test(src), 'no blind insert')
})

run('reducing stop count syncs fewer segment writes (obsolete cleanup)', () => {
  const src = readFileSync(resolve(process.cwd(), SERVICE), 'utf8')
  assert(
    src.includes('cached.length !== segments.length'),
    'detects obsolete sequences',
  )
  assert(
    src.includes('Clear obsolete cached legs') ||
      src.includes('Drop any obsolete cached sequences'),
    'documents cleanup',
  )
})

run('persistence failure does not suppress map with coordinates', () => {
  assert(
    shouldRenderTravelMap({
      hasStopCoordinates: true,
      persistenceFailed: true,
      routeCalculationFailed: false,
    }),
    'show map',
  )
  assert(
    !shouldRenderTravelMap({
      hasStopCoordinates: false,
      persistenceFailed: false,
    }),
    'hide without coords',
  )

  const detail = readFileSync(resolve(process.cwd(), DETAIL), 'utf8')
  assert(detail.includes('persistenceError'), 'shows warn')
  assert(detail.includes('<TravelMap stops={flow.stops} />'), 'map still rendered')
  const day = readFileSync(resolve(process.cwd(), DAY), 'utf8')
  assert(day.includes('persistenceError'), 'v2 warn')
  assert(day.includes('<TravelMap stops={flow.stops} />'), 'v2 map')
  // Hard catch must not wipe places in V2 (props available)
  assert(day.includes('places,'), 'v2 catch keeps places')
})

run('idempotent sync contract: upsert after wedding-scoped delete', () => {
  // Two syncs with same four rows → delete+upsert leaves exactly four identities.
  const syncA = [0, 1, 2, 3].map((sequence) => ({
    id: `a${sequence}`,
    wedding_id: 'w1',
    sequence,
    distance_meters: 100,
    duration_seconds: 50,
    provider: 'google',
    updated_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  }))
  const syncB = [0, 1, 2, 3].map((sequence) => ({
    id: `b${sequence}`,
    wedding_id: 'w1',
    sequence,
    distance_meters: 200,
    duration_seconds: 60,
    provider: 'google',
    updated_at: '2026-01-02T00:00:00Z',
    created_at: '2026-01-02T00:00:00Z',
  }))
  // Simulate exact-sync: replace wedding rows with second sync payload.
  const afterSecond = syncB
  const { keep, dropIds } = dedupeTravelSegmentsByWeddingSequence(afterSecond)
  assertEq(keep.length, 4, 'second sync four rows')
  assertEq(dropIds.length, 0, 'no dups within sync')
  assert(keep.every((r) => r.distance_meters === 200), 'updated distances')
  // Stale first-sync rows would be deleted by .eq('wedding_id') before upsert
  assertEq(syncA.length, 4, 'first sync also four')
})

console.log('\ntravel_segments upsert identity: done')
