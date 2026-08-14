/**
 * Performance P0.5 — approval critical-path cuts + pending freshness.
 * Run: npm run test:performance-p05
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  mergeLocationAnswerWithExisting,
  normalizeLocationAnswer,
  parseFiniteCoordinate,
} from '@/features/travel/weddingLocationModel'
import {
  answerToGeoPlace,
  geoPlaceToAnswer,
} from '@/features/prewedding/preweddingLocation'
import type { GeoPlace } from '@/types/travel'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

// --- Coordinate normalization ---
{
  assertEq(parseFiniteCoordinate(50.1), 50.1, 'number')
  assertEq(parseFiniteCoordinate('50.12345'), 50.12345, 'numeric string')
  assertEq(parseFiniteCoordinate('  -19.5 '), -19.5, 'trimmed string')
  assertEq(parseFiniteCoordinate(''), null, 'empty string')
  assertEq(parseFiniteCoordinate('abc'), null, 'invalid string')
  assertEq(parseFiniteCoordinate(Number.NaN), null, 'NaN')
  assertEq(parseFiniteCoordinate(Number.POSITIVE_INFINITY), null, 'Infinity')
  assertEq(parseFiniteCoordinate(null), null, 'null')

  const fromStrings = normalizeLocationAnswer({
    formattedAddress: 'Lwowska 78, Izdebnik',
    placeId: 'ChIJ_x',
    latitude: '49.8123',
    longitude: '19.7456',
    label: 'Villa Love',
  })
  assertEq(fromStrings.latitude, 49.8123, 'normalize string lat')
  assertEq(fromStrings.longitude, 19.7456, 'normalize string lng')
  assertEq(fromStrings.placeId, 'ChIJ_x', 'placeId kept')

  const fromNumbers = normalizeLocationAnswer({
    formattedAddress: 'A',
    latitude: 1.5,
    longitude: 2.5,
  })
  assertEq(fromNumbers.latitude, 1.5, 'normalize number lat')

  const invalid = normalizeLocationAnswer({
    formattedAddress: 'A',
    latitude: 'nope',
    longitude: 'Infinity',
  })
  assertEq(invalid.latitude, null, 'invalid lat discarded')
  assertEq(invalid.longitude, null, 'invalid lng discarded')

  const viaAnswer = answerToGeoPlace({
    formattedAddress: 'Test',
    latitude: '52.2',
    longitude: '21.0',
    placeId: 'ChIJ1',
  })
  assertEq(viaAnswer?.latitude, 52.2, 'answerToGeoPlace string lat')
  assertEq(viaAnswer?.longitude, 21.0, 'answerToGeoPlace string lng')

  console.log('PASS  coordinate normalization')
}

// --- GeoPlace preserved / merge does not drop coords ---
{
  const villa: GeoPlace = {
    placeId: 'ChIJ_villa',
    formattedAddress: 'Lwowska 78',
    latitude: 49.8123,
    longitude: 19.7456,
    label: 'Villa Love',
    provider: 'google',
  }
  const stored = geoPlaceToAnswer(villa)
  const incoming = normalizeLocationAnswer(stored)
  const merged = mergeLocationAnswerWithExisting(incoming, null)
  assertEq(merged.latitude, 49.8123, 'merged lat')
  assertEq(merged.longitude, 19.7456, 'merged lng')
  assertEq(merged.placeId, 'ChIJ_villa', 'merged placeId')
  console.log('PASS  GeoPlace coords preserved through normalize/merge')
}

// --- Approval place sync never geocodes ---
{
  const syncStart = read('src/lib/api/questionnaireService.ts')
  const fnStart = syncStart.indexOf('async function syncQuestionnaireLocationsToPlaces')
  const fnEnd = syncStart.indexOf('export const QUESTIONNAIRE_STATUS_LABELS')
  assert(fnStart >= 0 && fnEnd > fnStart, 'sync fn bounds')
  const body = syncStart.slice(fnStart, fnEnd)
  assertIncludes(body, 'insertInitialWeddingPlaces', 'approval batch insert')
  assertNotIncludes(body, 'getByRole', 'no getByRole probes')
  assertNotIncludes(body, 'getCoordinates', 'no direct geocode in sync')
  assertNotIncludes(body, 'travelProvider', 'no travelProvider in sync')
  assertNotIncludes(body, 'resolve: true', 'never geocode resolve true')
  console.log('PASS  approval place sync never geocodes')
}

// --- Approval: no final getById; light create/update; side effects off path ---
{
  const svc = read('src/lib/api/questionnaireService.ts')
  const approveStart = svc.indexOf('async approve(')
  assert(approveStart >= 0, 'approve exists')
  const afterApprove = svc.slice(approveStart)
  // Approve is the last method on questionnaireService — take until file end of method
  // by cutting at the final `},\n}` of the export object near releaseClaimed.
  const releaseIdx = afterApprove.indexOf('releaseClaimedLeadInstance')
  assert(releaseIdx >= 0, 'rollback claim present')
  const approveBody = afterApprove.slice(0, releaseIdx + 400)

  assertNotIncludes(
    approveBody,
    'weddingService.getById',
    'approve must not call getById',
  )
  assertIncludes(
    approveBody,
    'hydrate: false',
    'create skips hydrate',
  )
  assertIncludes(approveBody, 'seedMode: \'calendar_only\'', 'approval calendar-only seed')
  assertIncludes(approveBody, 'hydrate: false', 'light write hydrate false')
  assertIncludes(
    approveBody,
    'ensureCalendarEvent: false',
    'update skips second calendar ensure',
  )
  assertIncludes(
    approveBody,
    'return { wedding: { id: wedding.id }',
    'returns id only',
  )
  assertIncludes(
    approveBody,
    'void travelService.recalculate',
    'travel off critical path',
  )
  assertIncludes(
    approveBody,
    'void notificationService',
    'notification non-blocking',
  )
  assertIncludes(
    approveBody,
    'void timelineEventService',
    'timeline non-blocking',
  )
  assertIncludes(
    approveBody,
    'claimSubmittedLeadInstance',
    'claim preserved',
  )
  assertIncludes(
    approveBody,
    'attachWeddingToApprovedInstance',
    'attach preserved',
  )
  assertIncludes(
    approveBody,
    'syncWeddingExtrasFromQuestionnaireAnswer',
    'extras sync preserved',
  )
  assertIncludes(
    approveBody,
    'syncQuestionnaireLocationsToPlaces',
    'places sync preserved',
  )

  console.log('PASS  approval critical path cuts')
}

// --- weddingService light options ---
{
  const ws = read('src/lib/api/weddingService.ts')
  assertIncludes(ws, 'creationOptions?.hydrate === false', 'create hydrate skip')
  assertIncludes(ws, 'options?.hydrate === false', 'update hydrate skip')
  assertIncludes(
    ws,
    'options?.ensureCalendarEvent !== false',
    'update calendar gate',
  )
  assertIncludes(
    ws,
    'createWeddingDayEventForNewWedding',
    'create seed uses new-wedding calendar path',
  )
  assertIncludes(
    ws,
    'await calendarEventService.ensureWeddingDayEvent(wedding)',
    'legacy ensure still available for updates',
  )
  console.log('PASS  weddingService light write options')
}

// --- Invalidations do not block navigation ---
{
  const page = read('src/pages/PendingWeddingsPage.tsx')
  const approveFn = page.slice(
    page.indexOf('async function handleApprove'),
    page.indexOf('async function handleReject'),
  )
  assertIncludes(approveFn, 'afterApprove()', 'fires invalidation helper')
  assertIncludes(approveFn, 'navigate(`/sluby/${wedding.id}`)', 'navigates by id')
  assertNotIncludes(approveFn, 'await afterApprove', 'does not await helper')
  assertNotIncludes(
    approveFn,
    'await Promise.all',
    'does not await invalidation Promise.all',
  )

  const card = read('src/features/dashboard/components/PendingWeddingsCard.tsx')
  assertIncludes(card, 'afterApprove()', 'card non-blocking invalidate')
  assertNotIncludes(
    card,
    'await queryClient.invalidateQueries',
    'card does not await invalidate',
  )

  const hook = read(
    'src/features/questionnaires/hooks/usePendingQuestionnaires.ts',
  )
  assertIncludes(
    hook,
    'void Promise.all([',
    'invalidation helper is fire-and-forget',
  )

  console.log('PASS  invalidations do not block navigation')
}

// --- Pending shared hook + freshness ---
{
  const hook = read(
    'src/features/questionnaires/hooks/usePendingQuestionnaires.ts',
  )
  assertIncludes(hook, "PENDING_QUESTIONNAIRES_KEY = 'pending-questionnaires'", 'key')
  assertIncludes(hook, 'staleTime: 0', 'staleTime 0')
  assertIncludes(hook, "refetchOnMount: 'always'", 'refetchOnMount always')
  assertIncludes(hook, 'refetchOnWindowFocus: true', 'focus refetch scoped')
  assertNotIncludes(hook, 'refetchInterval', 'no polling')
  assertNotIncludes(hook, 'postgres_changes', 'no realtime')
  assertNotIncludes(hook, 'supabase.channel', 'no channel')

  const card = read('src/features/dashboard/components/PendingWeddingsCard.tsx')
  const page = read('src/pages/PendingWeddingsPage.tsx')
  assertIncludes(card, 'usePendingQuestionnaires', 'card uses shared hook')
  assertIncludes(page, 'usePendingQuestionnaires', 'page uses shared hook')
  assertNotIncludes(
    card,
    "queryKey: ['pending-questionnaires'",
    'card does not duplicate query options',
  )
  assertNotIncludes(
    page,
    "queryKey: ['pending-questionnaires'",
    'page does not duplicate query options',
  )

  const qc = read('src/lib/queryClient.ts')
  assertIncludes(qc, 'staleTime: 1000 * 60 * 5', 'global staleTime unchanged')
  assertIncludes(qc, 'refetchOnWindowFocus: false', 'global focus refetch unchanged')

  console.log('PASS  pending shared hook freshness policy')
}

console.log('PASS  performance P0.5')
