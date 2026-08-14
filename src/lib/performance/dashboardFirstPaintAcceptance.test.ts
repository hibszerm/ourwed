/**
 * Dashboard first-paint performance architecture.
 * Run: npm run test:dashboard-first-paint
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

const page = read('src/pages/DashboardPage.tsx')
const v2 = read('src/pages/DashboardV2Page.tsx')
const service = read('src/lib/api/dashboardService.ts')
const hook = read('src/features/dashboard/hooks/useDashboardAssignments.ts')
const noDemo = read('src/lib/api/weddings/noDemoWeddingSeedAcceptance.test.ts')
const notificationsCard = read(
  'src/features/dashboard/components/NotificationsCard.tsx',
)

{
  assertIncludes(page, 'useDashboardAssignments', 'V1 light assignments hook')
  assertNotIncludes(page, 'useWeddings', 'V1 no heavy useWeddings')
  assertNotIncludes(page, 'useSessions', 'V1 no full useSessions')
  assertNotIncludes(page, 'weddingService', 'V1 page no weddingService')
  assertNotIncludes(page, 'finalizeWedding', 'V1 page no finalize')
  console.log('PASS  DashboardPage first-paint wiring')
}

{
  assertIncludes(v2, 'useDashboardAssignments', 'V2 light assignments hook')
  assertNotIncludes(v2, 'useWeddings', 'V2 no heavy useWeddings')
  console.log('PASS  DashboardV2 first-paint wiring')
}

{
  assertIncludes(hook, "['dashboard', 'assignments', userId]", 'canonical RQ key')
  assertIncludes(hook, 'getAssignmentLists', 'hook calls light lists')
  assertNotIncludes(hook, 'weddingService', 'hook no weddingService')
  assertNotIncludes(hook, 'useWeddings', 'hook no useWeddings')
  console.log('PASS  useDashboardAssignments query key')
}

{
  assertIncludes(service, 'DASHBOARD_LIGHT_WEDDING_SELECT', 'pinned wedding columns')
  assertIncludes(service, 'DASHBOARD_LIGHT_SESSION_SELECT', 'pinned session columns')
  assertIncludes(service, 'getAssignmentLists', 'assignment lists API')
  assertIncludes(service, 'contractService.listByWeddingIds', 'batch contracts')
  assertIncludes(service, 'weddingPlaceService.listByWeddingIds', 'batch places')
  assertNotIncludes(service, 'weddingService', 'no weddingService')
  assertNotIncludes(service, 'finalizeWedding', 'no finalize')
  assertNotIncludes(service, 'paymentService', 'no payment hydrate')
  assertNotIncludes(service, 'galleryService', 'no gallery hydrate')
  assertNotIncludes(service, 'noteService', 'no notes hydrate')
  assertNotIncludes(service, 'timelineEventService', 'no timeline hydrate')
  assertNotIncludes(service, 'getLatestSubmittedFormAnswerRecord', 'no form hydrate')
  assertNotIncludes(service, 'sessionPaymentService', 'no session payments')
  const listsFn = service.slice(service.indexOf('async getAssignmentLists'))
  assertNotIncludes(
    listsFn,
    "select('*')",
    'assignment lists must not select-star weddings/sessions',
  )
  assertIncludes(
    listsFn,
    'DASHBOARD_LIGHT_WEDDING_SELECT',
    'assignment lists use pinned wedding select',
  )
  assertIncludes(
    listsFn,
    'DASHBOARD_LIGHT_SESSION_SELECT',
    'assignment lists use pinned session select',
  )
  assertIncludes(
    service,
    'Empty account → { weddings: [], sessions: [] } with ZERO inserts',
    'empty-account invariant documented',
  )
  assertNotIncludes(service, 'ensureDemo', 'no demo seed')
  assertNotIncludes(service, '.insert(', 'assignment lists are read-only')
  console.log('PASS  dashboardService light assignment architecture')
}

{
  assertIncludes(
    notificationsCard,
    'useLatestNotifications',
    'notifications stay on dedicated hooks',
  )
  assertNotIncludes(
    service,
    'notificationService',
    'dashboardService does not embed notifications',
  )
  console.log('PASS  notifications architecture preserved')
}

{
  assertIncludes(noDemo, 'ensureDemoWedding', 'P0 demo-seed guard still asserts against seed helper')
  assertIncludes(noDemo, 'fetchWeddingsForUser(userId)', 'P0 still pins read-only getAll')
  console.log('PASS  empty-account demo-seed guard still present')
}

console.log('\nAll dashboard first-paint acceptance checks passed.')
