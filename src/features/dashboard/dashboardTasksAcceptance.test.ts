/**
 * Phase 1D.4 / 1D.4.1 — Dashboard Dzisiaj: persisted tasks + horizon select.
 * Run: npm run test:dashboard-tasks
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  addLocalCalendarDays,
  addLocalCalendarMonths,
  DEFAULT_DASHBOARD_TASK_HORIZON,
  dashboardTaskHorizonEndDate,
  DASHBOARD_TASK_HORIZON_MENU,
  DASHBOARD_TASK_HORIZON_TRIGGER,
} from '@/features/dashboard/dashboardTaskHorizon'
import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error(`FAIL dashboard-tasks — ${m}`)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (e) {
    console.error(`FAIL  ${name}`)
    throw e
  }
}

const service = read('src/lib/api/taskService.ts')
const dashService = read('src/lib/api/dashboardService.ts')
const card = read('src/features/dashboard/components/TodoTodayCard.tsx')
const css = read('src/features/dashboard/components/TodoTodayCard.module.css')
const horizonMod = read('src/features/dashboard/dashboardTaskHorizon.ts')
const hook = read('src/features/dashboard/hooks/useDashboard.ts')
const keys = read('src/features/tasks/tasksQueryKeys.ts')
const invalidate = read('src/features/tasks/invalidateTaskDomain.ts')
const localDate = read('src/lib/utils/localCalendarDate.ts')
const page = read('src/pages/DashboardPage.tsx')
const nextAction = read('src/lib/workflow/resolveWeddingNextAction.ts')

const listDueThrough = service.slice(
  service.indexOf('async listDueThrough'),
  service.indexOf('async create'),
)

run('1–10. listDueThrough service semantics', () => {
  assert(listDueThrough.includes(".eq('user_id', userId)"), 'owner scoped')
  assert(listDueThrough.includes(".not('due_date', 'is', null)"), 'null due excluded')
  assert(listDueThrough.includes(".lte('due_date', day)"), 'due <= end')
  assert(
    listDueThrough.includes(".in('status', ['todo', 'in_progress'])"),
    'active statuses only',
  )
  assert(listDueThrough.includes("order('due_date'"), 'due sort')
  assert(!listDueThrough.includes('listForStudio'), 'no full dump')
})

run('11–18. Dashboard complete persistence', () => {
  assert(card.includes('taskService.complete'), 'real complete')
  assert(!card.includes('dismissed'), 'no local dismissed Set')
  assert(card.includes('removeDashboardDueTask'), 'optimistic remove')
  assert(card.includes('restoreDashboardDueTasks'), 'rollback')
  assert(card.includes('void invalidateTaskDomain'), 'background invalidate')
  assert(card.includes('endDate'), 'horizon-aware cache patch')
})

run('1D.4.1 horizon defaults + no persistence', () => {
  assert(DEFAULT_DASHBOARD_TASK_HORIZON === 'today', 'default today')
  assert(card.includes('DEFAULT_DASHBOARD_TASK_HORIZON'), 'mounts at today')
  assert(card.includes('useState<DashboardTaskHorizon>'), 'ephemeral state')
  assert(!card.includes('localStorage'), 'no localStorage')
  assert(!card.includes('sessionStorage'), 'no sessionStorage')
  assert(!horizonMod.includes('localStorage'), 'no settings persist')
  assert(!page.includes('searchParams'), 'no URL filter')
})

run('1D.4.1 end-date boundaries', () => {
  const today = '2026-08-16'
  assert(dashboardTaskHorizonEndDate('today', today) === '2026-08-16', 'today end')
  assert(dashboardTaskHorizonEndDate('7_days', today) === '2026-08-23', '7 days')
  assert(dashboardTaskHorizonEndDate('14_days', today) === '2026-08-30', '14 days')
  assert(dashboardTaskHorizonEndDate('month', today) === '2026-09-16', 'month Aug→Sep')
  assert(addLocalCalendarDays(today, 7) === '2026-08-23', 'add days')
  assert(addLocalCalendarMonths('2026-01-31', 1) === '2026-02-28', 'month-end clamp')
  assert(addLocalCalendarMonths('2024-01-31', 1) === '2024-02-29', 'leap clamp')
})

run('1D.4.1 query key + bounded fetch', () => {
  assert(keys.includes('endDate'), 'query key includes endDate')
  assert(hook.includes('dashboardDueTasksQueryKey(userId, resolvedEnd)'), 'hook key')
  assert(hook.includes('keepPreviousData'), 'calm horizon switch')
  assert(dashService.includes('listDueThrough(through)'), 'bounded service')
  assert(dashService.includes('getDashboardData(endDate'), 'endDate arg')
  assert(!dashService.includes('listAll'), 'no listAll')
  assert(!dashService.includes('listForStudio'), 'no listForStudio')
})

run('1D.4.1 dropdown UX', () => {
  assert(card.includes('IconChevronDown'), 'chevron')
  assert(card.includes('DASHBOARD_TASK_HORIZON_TRIGGER'), 'compact trigger')
  assert(card.includes('DASHBOARD_TASK_HORIZON_MENU'), 'menu labels')
  assert(DASHBOARD_TASK_HORIZON_TRIGGER.today === 'Dzisiaj', 'trigger today')
  assert(DASHBOARD_TASK_HORIZON_TRIGGER['7_days'] === '7 dni', 'trigger 7')
  assert(DASHBOARD_TASK_HORIZON_MENU['7_days'] === 'Najbliższe 7 dni', 'menu 7')
  assert(card.includes('aria-expanded'), 'a11y expanded')
  assert(card.includes('aria-haspopup'), 'a11y popup')
  assert(css.includes('min-height: 2.75rem'), '44px trigger')
  assert(css.includes('white-space: nowrap'), 'trigger single-line')
  assert(css.includes('.horizonLabel'), 'label class')
  assert(!card.includes('<select'), 'no native select')
  assert(!card.includes('segmented'), 'no segmented toolbar')
})

run('1D.4.1 presentation + empty', () => {
  assert(card.includes('Zaległe'), 'overdue meta')
  assert(card.includes('isFuture'), 'future due shown')
  assert(card.includes('dashboardTaskHorizonEmptyCopy'), 'horizon empty')
  assert(card.includes('Bez zlecenia'), 'unlinked')
  assert(!card.includes('/sluby/null'), 'no null route')
  assert(!card.includes('Pilne'), 'no Pilne')
})

run('24–27. Synthetic cleanup + Next Action separation', () => {
  assert(!dashService.includes('verify-locations'), 'no fake verify id')
  assert(!dashService.includes('listNeedingVerification'), 'no place verify→tasks')
  assert(!page.includes('resolveWeddingNextAction'), 'no NA on Dashboard page')
  assert(!nextAction.includes('taskService'), 'NA not writing tasks')
})

run('28–30. Local calendar day', () => {
  assert(horizonMod.includes('localCalendarDateKey'), 'horizon local')
  assert(card.includes('localCalendarDateKey'), 'card local')
  assert(!dashService.includes("toISOString().slice(0, 10)"), 'no UTC today')
  assert(localDate.includes('export function localCalendarDateKey'), 'helper')
  assert(localCalendarDateKey(new Date(2026, 7, 16, 23, 30, 0)) === '2026-08-16', 'local eve')
})

run('31. Dashboard wiring + performance freeze', () => {
  assert(page.includes('TodoTodayCard'), 'card mounted')
  assert(!page.includes('useDashboard(') && !page.includes('useDashboard()'), 'page no task gate')
  assert(page.includes('useDashboardAssignments'), 'light assignments')
  assert(!page.includes('useWeddings'), 'no heavy useWeddings')
  assert(!dashService.includes('weddingService'), 'no weddingService')
  assert(!dashService.includes('finalizeWedding'), 'no finalize')
  assert(invalidate.includes('removeDashboardDueTask'), 'cache helper')
  assert(card.includes('taskService.complete'), 'complete frozen path')
})

console.log('\ndashboard tasks Phase 1D.4.1: done')
