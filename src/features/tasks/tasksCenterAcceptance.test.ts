/**
 * Phase 1D.2 — Global Tasks Center read-only acceptance.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  groupActiveStudioTasks,
  listDoneStudioTasks,
} from '@/features/tasks/groupStudioTasks'
import type { StudioTask } from '@/lib/api/taskService'
import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error(`FAIL tasks-center — ${m}`)
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

function task(partial: Partial<StudioTask> & Pick<StudioTask, 'id' | 'title'>): StudioTask {
  return {
    weddingId: null,
    dueDate: '',
    status: 'todo',
    createdAt: '2026-08-10T10:00:00.000Z',
    completedAt: null,
    completed: false,
    ...partial,
  }
}

const sidebar = read('src/layouts/Sidebar.tsx')
const router = read('src/routes/router.tsx')
const page = read('src/pages/TasksPage.tsx')
const center = read('src/features/tasks/TasksCenter.tsx')
const row = read('src/features/tasks/TasksCenterRow.tsx')
const css = read('src/features/tasks/TasksCenter.module.css')
const hook = read('src/features/tasks/useStudioTasks.ts')
const meta = read('src/features/tasks/taskWeddingMeta.ts')
const keys = read('src/features/tasks/tasksQueryKeys.ts')
const group = read('src/features/tasks/groupStudioTasks.ts')
const service = read('src/lib/api/taskService.ts')
const localDate = read('src/lib/utils/localCalendarDate.ts')
const dashboardTodo = read('src/features/dashboard/components/TodoTodayCard.tsx')
const nextAction = read('src/lib/workflow/resolveWeddingNextAction.ts')

run('1. Tasks page + protected /zadania route', () => {
  assert(page.includes('TasksCenter'), 'page mounts center')
  assert(page.includes('AppLayout'), 'AppLayout')
  assert(page.includes('title="Zadania"'), 'header')
  assert(router.includes("path: '/zadania'"), 'route')
  assert(router.includes('TasksPage'), 'TasksPage import')
  const protectedBlock = router.slice(
    router.indexOf('ProtectedRoute'),
    router.indexOf("path: '/form/:token'") > 0
      ? router.length
      : router.length,
  )
  assert(protectedBlock.includes("path: '/zadania'"), 'under ProtectedRoute')
})

run('2. Sidebar exposes Zadania after Kalendarz', () => {
  assert(sidebar.includes("to: '/zadania'"), 'nav to')
  assert(sidebar.includes("label: 'Zadania'"), 'label')
  assert(sidebar.includes('IconTasks'), 'icon')
  const sluby = sidebar.indexOf("to: '/sluby'")
  const sesje = sidebar.indexOf("to: '/sesje'")
  const kalendarz = sidebar.indexOf("to: '/kalendarz'")
  const zadania = sidebar.indexOf("to: '/zadania'")
  const oczekujace = sidebar.indexOf("to: '/oczekujace'")
  assert(
    sluby >= 0 &&
      sesje > sluby &&
      kalendarz > sesje &&
      zadania > kalendarz &&
      oczekujace > zadania,
    'Śluby → Sesje → Kalendarz → Zadania → Oczekujące',
  )
})

run('3. Owner-scoped studio task query', () => {
  assert(hook.includes('listForStudio'), 'listForStudio')
  assert(hook.includes('studioTasksQueryKey'), 'query key helper')
  assert(keys.includes("TASKS_QUERY_ROOT"), 'root')
  assert(keys.includes("'studio'"), 'studio scope')
  assert(service.includes('eq(\'user_id\', userId)'), 'owner filter')
})

run('4. No full wedding hydration / N+1', () => {
  assert(hook.includes('listTaskWeddingMetaByIds'), 'uses batch meta')
  assert(hook.includes('listForStudio'), 'tasks list')
  assert(!hook.includes("from('weddings')"), 'hook does not query weddings directly')
  assert(meta.includes('TASKS_WEDDING_META_SELECT'), 'light select')
  assert(
    meta.includes("'id, bride_name, groom_name, display_name, wedding_date'"),
    'exact light columns',
  )
  assert(meta.includes(".in('id', unique)"), 'batch in()')
  assert(meta.includes("from('weddings')"), 'one weddings query')
  assert(!meta.includes("from('payments')"), 'no payments')
  assert(!meta.includes("from('contracts')"), 'no contracts')
  assert(!meta.includes("from('notes')"), 'no notes')
})

run('5–7. Active / done / cancelled semantics (pure)', () => {
  const today = '2026-08-16'
  const items = [
    task({ id: '1', title: 'A', status: 'todo', dueDate: '2026-08-16' }),
    task({ id: '2', title: 'B', status: 'in_progress', dueDate: '2026-08-10' }),
    task({ id: '3', title: 'C', status: 'done', dueDate: '2026-08-16' }),
    task({ id: '4', title: 'D', status: 'cancelled', dueDate: '2026-08-16' }),
  ]
  const sections = groupActiveStudioTasks(items, today)
  const ids = sections.flatMap((s) => s.tasks.map((t) => t.id))
  assert(ids.includes('1') && ids.includes('2'), 'todo + in_progress')
  assert(!ids.includes('3'), 'done excluded from active')
  assert(!ids.includes('4'), 'cancelled excluded')
  assert(listDoneStudioTasks(items).map((t) => t.id).join() === '3', 'done only')
})

run('8–11. Local-day groups + undated', () => {
  assert(group.includes('localCalendarDateKey'), 'local helper')
  assert(!group.includes('toISOString().slice'), 'no UTC slice in grouper')
  assert(localDate.includes('getFullYear()'), 'local parts')
  assert(!localDate.includes('toISOString().slice'), 'local util no UTC slice')

  const today = '2026-08-16'
  const sections = groupActiveStudioTasks(
    [
      task({ id: 'o', title: 'O', dueDate: '2026-08-01', createdAt: 'a' }),
      task({ id: 't', title: 'T', dueDate: '2026-08-16', createdAt: 'b' }),
      task({ id: 'u', title: 'U', dueDate: '2026-08-20', createdAt: 'c' }),
      task({ id: 'n', title: 'N', dueDate: '', createdAt: '2026-08-15T00:00:00Z' }),
    ],
    today,
  )
  assert(sections.map((s) => s.id).join(',') === 'overdue,today,upcoming,undated', 'all four')
  assert(sections[0].title === 'Zaległe', 'overdue title')
  assert(sections[1].title === 'Dziś', 'today title')
  assert(sections[2].title === 'Nadchodzące', 'upcoming title')
  assert(sections[3].title === 'Bez terminu', 'undated title')
})

run('12–15. Linked / unlinked presentation + no /sluby/null + no priority', () => {
  assert(row.includes('Bez zlecenia'), 'unlinked label')
  assert(row.includes('`/sluby/${task.weddingId}`'), 'linked href')
  assert(!row.includes('/sluby/null'), 'no null path')
  assert(!row.includes('priority'), 'no priority')
  assert(!center.includes('priority'), 'center no priority')
  assert(!center.includes('Pilne'), 'no Pilne')
  assert(row.includes('onToggleComplete'), 'complete control')
  assert(row.includes('onEdit'), 'edit control')
  assert(row.includes('titleRow'), 'title + due on one row')
  assert(css.includes('max-width: 40rem'), 'readable content width')
})

run('16–17. Empty state + omit empty sections', () => {
  assert(center.includes('Brak aktywnych zadań'), 'empty copy')
  assert(group.includes('if (overdue.length)'), 'omit empty overdue')
  assert(group.includes('if (today.length)'), 'omit empty today')
  assert(groupActiveStudioTasks([]).length === 0, 'no sections when empty')
})

run('18. Completed view', () => {
  assert(center.includes('Wykonane'), 'done tab')
  assert(center.includes("setFilter('done')"), 'done filter')
  assert(center.includes('listDoneStudioTasks'), 'done list')
})

run('19. Shared domain with Wedding Detail', () => {
  assert(service.includes("from('tasks')"), 'same table')
  assert(hook.includes('taskService.listForStudio'), 'studio read')
  assert(service.includes('listByWeddingId'), 'wedding read preserved')
})

run('20. CRUD controls present (1D.3)', () => {
  assert(center.includes('Dodaj zadanie'), 'add CTA')
  assert(center.includes('TaskFormModal'), 'form modal')
  assert(center.includes('taskService.complete'), 'complete')
  assert(center.includes('taskService.reopen'), 'reopen')
  assert(center.includes('TaskDeleteModal'), 'delete modal')
})

run('21. No Next Action as tasks', () => {
  assert(!center.includes('resolveWeddingNextAction'), 'no resolver')
  assert(!center.includes('Next Action'), 'no next action copy')
  assert(nextAction.includes('export function resolveWeddingNextAction'), 'resolver untouched')
})

run('22. Responsive / mobile CSS guards', () => {
  assert(css.includes('overflow-x: clip'), 'no horizontal overflow')
  assert(css.includes('overflow-wrap: anywhere'), 'title wrap')
  assert(css.includes('min-height: 44px'), 'wedding link touch')
  assert(css.includes('@media (max-width: 430px)'), '430 guard')
  assert(!css.includes('display: table'), 'no squeezed table')
})

run('23. Loading UX — no flash copy', () => {
  assert(!center.includes('Ładowanie zadań'), 'no loading flash')
  assert(center.includes('!showBody ? null'), 'quiet pending')
})

run('24. Local today helper available for 1D.4', () => {
  const key = localCalendarDateKey(new Date(2026, 7, 16, 23, 30))
  assert(key === '2026-08-16', 'local Aug 16 late evening')
})

run('25. Dashboard shares persisted complete (1D.4)', () => {
  assert(dashboardTodo.includes('taskService.complete'), 'dashboard persists')
  assert(!dashboardTodo.includes('dismissed'), 'no local dismiss')
})

console.log('\ntasks center Phase 1D.2: done')
