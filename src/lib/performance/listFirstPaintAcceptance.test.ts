/**
 * Weddings + Sessions list first-paint performance architecture.
 * Run: npm run test:list-first-paint
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

const weddingsPage = read('src/pages/WeddingsPage.tsx')
const sessionsPage = read('src/pages/SessionsPage.tsx')
const useWeddings = read('src/features/weddings/hooks/useWeddings.ts')
const useSessions = read('src/features/sessions/hooks/useSessions.ts')
const weddingLight = read('src/lib/api/weddingListLightService.ts')
const sessionLight = read('src/lib/api/sessionListLightService.ts')
const hydrate = read('src/lib/api/weddings/weddingHydrate.ts')
const weddingService = read('src/lib/api/weddingService.ts')
const sessionService = read('src/lib/api/sessionService.ts')
const invalidateWedding = read(
  'src/features/weddings/hooks/useInvalidateWedding.ts',
)
const invalidateSession = read(
  'src/features/sessions/invalidateSessionFinanceQueries.ts',
)

console.log('\nList first-paint performance\n')

{
  assertIncludes(weddingsPage, 'useWeddings', 'WeddingsPage uses list hook')
  assertNotIncludes(
    weddingsPage,
    'weddingService.getAll',
    'WeddingsPage no getAll',
  )
  assertNotIncludes(
    weddingsPage,
    'finalizeWeddingViews',
    'WeddingsPage no finalize',
  )
  console.log('PASS  WeddingsPage wiring')
}

{
  assertIncludes(sessionsPage, 'useSessions', 'SessionsPage uses list hook')
  assertNotIncludes(
    sessionsPage,
    'sessionService.getAll',
    'SessionsPage no getAll',
  )
  console.log('PASS  SessionsPage wiring')
}

{
  assertIncludes(useWeddings, 'weddingListLightService.listWeddingsForList', 'hook light fn')
  assertIncludes(useWeddings, "['weddings', 'list', userId]", 'list query key')
  assertIncludes(useWeddings, 'staleTime', 'warm-cache staleTime')
  assertNotIncludes(useWeddings, 'weddingService.getAll', 'hook no getAll')
  assertNotIncludes(useWeddings, 'finalizeWedding', 'hook no finalize')
  console.log('PASS  useWeddings light query')
}

{
  assertIncludes(useSessions, 'sessionListLightService.listSessionsForList', 'hook light fn')
  assertIncludes(useSessions, "['sessions', 'list', userId]", 'list query key')
  assertIncludes(useSessions, 'staleTime', 'warm-cache staleTime')
  assertNotIncludes(useSessions, 'sessionService.getAll', 'hook no getAll')
  console.log('PASS  useSessions light query')
}

{
  assertIncludes(weddingLight, 'WEDDING_LIST_LIGHT_SELECT', 'pinned columns')
  assertIncludes(weddingLight, 'paymentService.listByWeddingIds', 'batch payments')
  assertIncludes(weddingLight, 'weddingPlaceService.listByWeddingIds', 'batch places')
  assertIncludes(weddingLight, 'Promise.all', 'parallel enrich')
  assertNotIncludes(weddingLight, 'finalizeWeddingViews', 'no full finalize')
  assertNotIncludes(weddingLight, 'noteService', 'no notes hydrate')
  assertNotIncludes(weddingLight, 'timelineEventService', 'no timeline hydrate')
  assertNotIncludes(weddingLight, 'galleryService', 'no gallery hydrate')
  assertNotIncludes(weddingLight, 'contractService', 'no contract hydrate')
  assertNotIncludes(weddingLight, 'hydrateWeddingFromContractForm', 'no form N+1')
  assertNotIncludes(weddingLight, "select('*')", 'no wildcard select')
  assertIncludes(weddingLight, 'coverage_end_time', 'coverage on list select')
  console.log('PASS  weddingListLightService architecture')
}

{
  assertIncludes(sessionLight, 'SESSION_LIST_LIGHT_SELECT', 'pinned columns')
  assertIncludes(sessionLight, 'sessionPaymentService.listBySessionIds', 'batch payments')
  assertNotIncludes(sessionLight, "select('*')", 'no wildcard select')
  assertNotIncludes(sessionLight, 'for (const', 'no per-session loop fetch')
  console.log('PASS  sessionListLightService architecture')
}

{
  assertIncludes(hydrate, 'finalizeWeddingViews', 'full hydrate still exists for detail')
  assertIncludes(weddingService, 'async getAll()', 'getAll remains for non-list callers')
  assertIncludes(weddingService, 'finalizeWeddingViews', 'getAll still full hydrate')
  assertIncludes(sessionService, 'async getAll()', 'session getAll remains for detail paths')
  console.log('PASS  detail-rich getAll preserved')
}

{
  assertIncludes(invalidateWedding, "queryKey: ['weddings']", 'wedding invalidate prefix')
  assertIncludes(invalidateSession, "queryKey: ['sessions']", 'session invalidate prefix')
  console.log('PASS  invalidation still covers list keys')
}

console.log('\nlist-first-paint: done\n')
