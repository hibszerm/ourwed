/**
 * Performance P0 architectural guards.
 * Run: npm run test:performance-p0
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

// --- Ownership: ID-only, never full hydrate ---
{
  const ownership = read('src/lib/api/ownership.ts')
  const fnStart = ownership.indexOf('export async function listOwnedWeddingIds')
  const fnEnd = ownership.indexOf('export async function assertWeddingOwned')
  assert(fnStart >= 0 && fnEnd > fnStart, 'listOwnedWeddingIds function bounds')
  const fnBody = ownership.slice(fnStart, fnEnd)

  assertIncludes(fnBody, "select('id')", 'listOwnedWeddingIds selects id only')
  assertIncludes(fnBody, ".eq('user_id', userId)", 'filters by studio user')
  assertNotIncludes(
    fnBody,
    'weddingService.getAll',
    'listOwnedWeddingIds must not call getAll',
  )
  assertNotIncludes(
    fnBody,
    'finalizeWeddingView',
    'listOwnedWeddingIds must not hydrate',
  )
  assertNotIncludes(
    fnBody,
    'finalizeWeddingViews',
    'listOwnedWeddingIds must not hydrate views',
  )
  console.log('PASS  ownership listOwnedWeddingIds is ID-only')
}

// --- Dashboard: no duplicate wedding hydrate ---
{
  const dash = read('src/lib/api/dashboardService.ts')
  const dashFn = dash.slice(dash.indexOf('async getDashboardData'))
  assertNotIncludes(
    dashFn,
    'weddingService.',
    'getDashboardData must not call weddingService',
  )
  assertNotIncludes(
    dash,
    'calendarEventService',
    'dashboard must not load all calendar events',
  )
  assertNotIncludes(dash, 'taskService.listAll', 'dashboard must not listAll tasks')
  assertNotIncludes(dash, 'upcomingDeadlines', 'removed dead upcomingDeadlines')
  assertNotIncludes(dash, 'nextWedding', 'nextWedding not owned by dashboardService')
  assertIncludes(dash, 'listDueThrough', 'loads overdue+today tasks')
  assertNotIncludes(
    dash,
    'notificationService.list',
    'dashboard must not load full notification history',
  )
  assertNotIncludes(dash, 'listNeedingVerification', 'no synthetic location verify tasks')
  assertNotIncludes(dash, 'verify-locations', 'no fake verify task ids')
  assertIncludes(dash, 'localCalendarDateKey', 'local calendar day')
  assertIncludes(dash, 'getAssignmentLists', 'light assignment lists')
  assertIncludes(dash, 'DASHBOARD_LIGHT_WEDDING_SELECT', 'pinned wedding select')
  assertNotIncludes(dash, 'finalizeWedding', 'no finalize hydrate')
  assertNotIncludes(dash, 'weddingService', 'no weddingService')

  const page = read('src/pages/DashboardPage.tsx')
  assertIncludes(page, 'assignmentsLoading', 'primary gate light assignments')
  assertNotIncludes(page, 'useWeddings', 'V1 must not use heavy useWeddings')
  assertIncludes(page, 'useDashboardAssignments', 'V1 uses light assignment hook')
  assertNotIncludes(
    page,
    'isLoading || assignmentsLoading',
    'must not wait on dashboard tasks for primary paint',
  )

  const router = read('src/routes/router.tsx')
  assertNotIncludes(router, 'DashboardV2Page', 'V2 page not in production router')
  assertIncludes(
    router,
    'Navigate to="/dashboard"',
    'legacy /dashboard-v2 redirects to V1',
  )
  assertNotIncludes(
    read('src/pages/DashboardPage.tsx'),
    'useWeddings',
    'V1 must not use heavy useWeddings',
  )

  console.log('PASS  dashboard no hydrate storm / dead work removed')
}

// --- Approve: travel off critical path + non-blocking invalidations ---
{
  const approve = read('src/lib/api/questionnaireService.ts')
  assertIncludes(
    approve,
    'void travelService.recalculate',
    'approve must not await travel recalculate',
  )
  assertNotIncludes(
    approve,
    'await travelService.recalculate',
    'approve must not await travel recalculate',
  )

  const pending = read('src/pages/PendingWeddingsPage.tsx')
  assertIncludes(
    pending,
    'afterApprove()',
    'pending approve uses non-blocking invalidation helper',
  )
  const approveFn = pending.slice(
    pending.indexOf('async function handleApprove'),
    pending.indexOf('async function handleReject'),
  )
  assertNotIncludes(
    approveFn,
    'await queryClient.invalidateQueries',
    'handleApprove must not await invalidations',
  )
  assertNotIncludes(
    approveFn,
    'await Promise.all',
    'handleApprove must not await Promise.all invalidations',
  )

  const detail = read('src/pages/QuestionnaireDetailPage.tsx')
  const detailApprove = detail.slice(
    detail.indexOf('async function handleApprove'),
    detail.indexOf('return (', detail.indexOf('async function handleApprove')),
  )
  assertIncludes(
    detailApprove,
    'void Promise.all',
    'questionnaire detail non-blocking invalidations',
  )
  assertNotIncludes(
    detailApprove,
    'await Promise.all',
    'questionnaire detail must not await invalidations',
  )

  console.log('PASS  approve travel off-path + non-blocking invalidations')
}

// --- Calendar: listAll / sync must not hydrate weddings ---
{
  const cal = read('src/lib/api/calendarEventService.ts')
  assertIncludes(cal, 'listOwnedWeddingIds', 'listAll uses ownership ids')
  assertNotIncludes(
    cal,
    'weddingService.getAll',
    'calendarEventService must not hydrate weddings',
  )
  assertIncludes(
    cal,
    'needsEnsure',
    'sync only ensures missing/stale events',
  )
  assertIncludes(cal, 'CONCURRENCY', 'bounded parallel ensure')
  // Must not use the old serial for-loop over all weddings as the only strategy
  assertNotIncludes(
    cal,
    'for (const wedding of weddings) {\n      if (wedding.date) {\n        await this.ensureWeddingDayEvent(wedding)',
    'must not serial-ensure every wedding unconditionally',
  )

  console.log('PASS  calendar no nested hydrate + smart sync')
}

// --- Detail: placeholder from canonical list only ---
{
  const hook = read('src/features/weddings/hooks/useWedding.ts')
  assertIncludes(hook, 'placeholderData', 'detail seeds from list cache')
  assertIncludes(hook, "['weddings', userId]", 'uses canonical weddings key')
  assertIncludes(hook, 'weddingService.getById', 'still fetches authoritative detail')

  console.log('PASS  wedding detail placeholderData')
}

// --- DEV perf helper exists and is gated ---
{
  const perf = read('src/lib/performance/devPerf.ts')
  assertIncludes(perf, 'import.meta.env?.DEV', 'DEV-only logging')
  assertIncludes(perf, 'withDevPerf', 'timing helper')
  assertIncludes(perf, 'weddingService.getAll', 'tracks getAll')
  assertIncludes(perf, 'listOwnedWeddingIds', 'tracks ownership')

  console.log('PASS  DEV performance helper')
}

console.log('PASS  performance P0')
