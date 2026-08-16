/**
 * Phase 1D.3 / 1D.3.1 — Global Tasks Center CRUD + UX hotfix acceptance.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  groupActiveStudioTasks,
  listDoneStudioTasks,
} from '@/features/tasks/groupStudioTasks'
import type { StudioTask } from '@/lib/api/taskService'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error(`FAIL tasks-crud — ${m}`)
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

function task(
  partial: Partial<StudioTask> & Pick<StudioTask, 'id' | 'title'>,
): StudioTask {
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

const center = read('src/features/tasks/TasksCenter.tsx')
const row = read('src/features/tasks/TasksCenterRow.tsx')
const form = read('src/features/tasks/TaskFormModal.tsx')
const del = read('src/features/tasks/TaskDeleteModal.tsx')
const service = read('src/lib/api/taskService.ts')
const weddingMeta = read('src/features/tasks/taskWeddingMeta.ts')
const invalidate = read('src/features/tasks/invalidateTaskDomain.ts')
const keys = read('src/features/tasks/tasksQueryKeys.ts')
const css = read('src/features/tasks/TasksCenter.module.css')
const detailPage = read('src/pages/WeddingDetailPage.tsx')
const persist = read('src/features/weddings/edit/persistWeddingEditDraft.ts')
const nextAction = read('src/lib/workflow/resolveWeddingNextAction.ts')
const dashboardTodo = read('src/features/dashboard/components/TodoTodayCard.tsx')
const gates = read('src/features/billing/proGateActions.ts')

run('1–2. Add CTA + create modal', () => {
  assert(center.includes('Dodaj zadanie'), 'CTA')
  assert(center.includes('ProGateAction'), 'pro gate')
  assert(center.includes('actionKey="create_task"'), 'create_task key')
  assert(center.includes('TaskFormModal'), 'form modal')
  assert(form.includes('Dodaj zadanie'), 'create title')
  assert(form.includes('Edytuj zadanie'), 'edit title')
  assert(gates.includes("'create_task'"), 'gate key registered')
})

run('3–8. Create fields + ownership', () => {
  assert(form.includes('Nazwa zadania'), 'title field')
  assert(form.includes('type="date"'), 'optional date')
  assert(form.includes('Brak powiązania'), 'unlinked option')
  assert(form.includes('listActiveTaskWeddingOptions'), 'active weddings')
  assert(weddingMeta.includes(".eq('status', 'active')"), 'active filter')
  assert(form.includes('taskService.create'), 'create call')
  assert(form.includes('taskService.update'), 'update call')
  assert(!form.includes('input.userId'), 'no caller userId')
  assert(!/\bname=["']userId["']/.test(form), 'no userId form field')
  assert(service.includes('resolveStudioUserId()'), 'owner resolved')
  assert(!service.includes('input.userId'), 'no input.userId')
  assert(form.includes('Podaj nazwę zadania'), 'whitespace/empty reject')
})

run('9–10. Invalidation + wedding domain', () => {
  assert(invalidate.includes("queryKey: [TASKS_QUERY_ROOT]"), 'root invalidate')
  assert(invalidate.includes("refetchType: 'all'"), 'inactive wedding refresh')
  assert(form.includes('invalidateTaskDomain'), 'form invalidates')
  assert(form.includes('syncWeddingTaskCaches'), 'form patches wedding cache')
  assert(form.includes('weddingIds:'), 'form passes wedding ids')
  assert(del.includes('invalidateTaskDomain'), 'delete invalidates')
  assert(del.includes('removeTaskFromWeddingCaches'), 'delete patches wedding')
  assert(center.includes('invalidateTaskDomain'), 'toggle invalidates')
  assert(persist.includes('taskService.create'), 'wedding create still')
})

run('11–19. Complete / reopen', () => {
  assert(service.includes('async complete'), 'complete')
  assert(service.includes('async reopen'), 'reopen')
  assert(service.includes("status: 'done'"), 'done status')
  assert(service.includes("status: 'todo'"), 'reopen todo')
  assert(
    service.includes("input.status === 'done' ? new Date().toISOString() : null"),
    'completed_at set/clear',
  )
  assert(center.includes('taskService.complete'), 'center complete')
  assert(center.includes('taskService.reopen'), 'center reopen')
  assert(row.includes('onToggleComplete'), 'checkbox wired')
  assert(
    css.includes('min-height: 2.75rem') || css.includes('height: 2.75rem'),
    'touch target',
  )

  const today = '2026-08-16'
  const items = [
    task({ id: 'a', title: 'A', status: 'todo', dueDate: '2026-08-16' }),
    task({
      id: 'b',
      title: 'B',
      status: 'in_progress',
      dueDate: '2026-08-10',
    }),
    task({
      id: 'c',
      title: 'C',
      status: 'done',
      dueDate: '2026-08-16',
      completedAt: '2026-08-16T12:00:00Z',
      completed: true,
    }),
    task({ id: 'd', title: 'D', status: 'cancelled', dueDate: '2026-08-16' }),
  ]
  const active = groupActiveStudioTasks(items, today).flatMap((s) => s.tasks)
  assert(active.map((t) => t.id).sort().join() === 'a,b', 'active set')
  assert(listDoneStudioTasks(items).map((t) => t.id).join() === 'c', 'done only')
})

run('20–28. Edit semantics', () => {
  assert(form.includes('dueDate: nextDue'), 'due persist incl null')
  assert(form.includes('weddingId: nextWeddingId'), 'reassignment')
  assert(!form.includes('label="Opis"'), 'no description field')
  assert(!form.includes('description:'), 'no description patch')
  assert(!center.includes('Pilne') && !form.includes('priority'), 'no priority')
  assert(form.includes("showToast('Zadanie zostało dodane.')"), 'create toast')
  assert(form.includes("showToast('Zadanie zostało zapisane.')"), 'edit toast')
  const createIdx = form.indexOf('taskService.create')
  const createToastIdx = form.indexOf("showToast('Zadanie zostało dodane.')")
  const createCall = form.slice(createIdx, createToastIdx)
  assert(createIdx >= 0 && createToastIdx > createIdx, 'create block')
  assert(!createCall.includes('status:'), 'create defaults status')
  const editIdx = form.indexOf('taskService.update')
  const editToastIdx = form.indexOf("showToast('Zadanie zostało zapisane.')")
  const editCall = form.slice(editIdx, editToastIdx)
  assert(editIdx >= 0 && editToastIdx > editIdx, 'edit block')
  assert(!editCall.includes('status:'), 'edit omits status')
  assert(!editCall.includes('description'), 'edit omits description')
})

run('29–35. Delete UX', () => {
  assert(del.includes('Usunąć zadanie?'), 'confirm title')
  assert(del.includes('taskService.delete'), 'delete call')
  assert(del.includes('variant="danger"'), 'danger confirm')
  assert(form.includes('onRequestDelete'), 'edit → delete')
  assert(center.includes('TaskDeleteModal'), 'wired')
  assert(del.includes('Zadanie zostało usunięte'), 'success copy')
})

run('36–42. Cross-surface + Next Action freeze', () => {
  assert(service.includes('listByWeddingId'), 'wedding list')
  assert(service.includes('listForStudio'), 'studio list')
  assert(invalidate.includes('TASKS_QUERY_ROOT'), 'shared root')
  assert(keys.includes('weddingTasksQueryKey'), 'canonical wedding key')
  assert(detailPage.includes('weddingTasksQueryKey'), 'detail uses canonical key')
  assert(detailPage.includes('taskService.listByWeddingId'), 'detail dynamic list')
  assert(nextAction.includes('export function resolveWeddingNextAction'), 'resolver')
  assert(!center.includes('resolveWeddingNextAction'), 'no NA in center')
  assert(!form.includes('resolveWeddingNextAction'), 'no NA in form')
})

run('1D.3.1 cross-surface cache matrix', () => {
  assert(invalidate.includes('syncWeddingTaskCaches'), 'sync helper')
  assert(invalidate.includes('removeTaskFromWeddingCaches'), 'remove helper')
  assert(invalidate.includes('patchWeddingTaskStatus'), 'status patch helper')
  assert(form.includes('previousWeddingId'), 'tracks old wedding')
  assert(form.includes('nextWeddingId'), 'tracks new wedding')
  assert(
    form.includes('weddingIds: [previousWeddingId, nextWeddingId]'),
    'invalidates both weddings',
  )
  assert(persist.includes('taskService.create'), 'wedding-created → same table')
  assert(
    service.includes("from('tasks')") || service.includes('from("tasks")'),
    'one table',
  )
})

run('1D.3.1 complete UX optimistic', () => {
  assert(center.includes('patchStudioTaskStatus'), 'optimistic studio patch')
  assert(center.includes('patchWeddingTaskStatus'), 'optimistic wedding patch')
  assert(center.includes('restoreStudioTasksBundle'), 'rollback')
  assert(center.includes("showToast(message, 'error')"), 'error toast')
  const toggleStart = center.indexOf('async function handleToggle')
  const toggleEnd = center.indexOf('return (', toggleStart)
  const toggle = center.slice(toggleStart, toggleEnd)
  assert(toggle.includes('patchStudioTaskStatus'), 'patch before await')
  assert(
    toggle.indexOf('patchStudioTaskStatus') <
      toggle.indexOf('taskService.complete'),
    'optimistic before mutate',
  )
  assert(toggle.includes('void invalidateTaskDomain'), 'background invalidate')
  assert(
    !toggle.includes('await invalidateTaskDomain'),
    'does not await invalidate',
  )
  assert(
    !center.includes('isFetching') && !center.includes('Loading…'),
    'no global spinner',
  )
})

run('1D.3.1 edit affordance', () => {
  assert(row.includes('Edytuj'), 'Edytuj cue')
  assert(row.includes('styles.editCue'), 'editCue class')
  assert(row.includes('onEdit(task)'), 'opens edit')
  assert(css.includes('.editCue'), 'css')
  assert(css.includes('.row:hover .editCue'), 'hover shows')
  assert(css.includes('.row:focus-within .editCue'), 'focus shows')
  assert(css.includes('display: none'), 'hidden on mobile')
  assert(row.includes('stopPropagation'), 'wedding link isolated')
  assert(row.includes('onToggleComplete'), 'checkbox separate')
  assert(row.includes('titleBtn'), 'title still opens edit without hover')
})

run('1D.3.2 mobile calm sheet focus', () => {
  assert(form.includes('useIsMobileOverlay'), 'mobile sheet detection')
  assert(form.includes('useIsMobileOverlay(768)'), 'matches Modal 767 sheet bp')
  assert(
    form.includes("initialFocus={isMobileSheet ? 'panel' : 'first'}"),
    'panel focus on mobile',
  )
  assert(form.includes('autofocusTitle={!isMobileSheet}'), 'no title autofocus mobile')
  assert(form.includes('autoFocus={autofocusTitle}'), 'desktop title autofocus gated')
  assert(
    !form.includes('autoFocus\n') && !/\bautoFocus\s*\/>/.test(form) && !/\bautoFocus\s*>/.test(form),
    'no bare autoFocus prop',
  )
  const dateBlock = form.slice(form.indexOf('type="date"') - 80, form.indexOf('type="date"') + 120)
  assert(!dateBlock.includes('autoFocus'), 'date not autofocused')
  assert(form.includes('Dodaj zadanie') && form.includes('Edytuj zadanie'), 'create/edit parity')

  const modal = read('src/components/ui/Modal.tsx')
  const overlay = read('src/components/ui/overlay/useOverlay.ts')
  assert(modal.includes('initialFocus'), 'Modal exposes initialFocus')
  assert(modal.includes('tabIndex={-1}'), 'dialog panel focusable')
  assert(overlay.includes("initialFocus === 'panel'"), 'overlay panel mode')
  assert(overlay.includes('OVERLAY_FOCUSABLE'), 'focus trap preserved')
})

run('43–49. Mobile / interaction', () => {
  assert(form.includes('compactMobileForm'), 'compact sheet')
  assert(form.includes('type="date"'), 'native date')
  assert(css.includes('overflow-x: clip'), 'no x overflow')
  assert(css.includes('@media (max-width: 430px)'), '430')
  assert(row.includes('stopPropagation'), 'wedding link isolated')
  assert(row.includes('onEdit'), 'title opens edit')
  assert(row.includes('onToggleComplete'), 'checkbox separate')
  assert(css.includes('height: 2.75rem'), '44px check')
})

run('50. Dashboard shares complete domain (1D.4)', () => {
  assert(dashboardTodo.includes('taskService.complete'), 'dashboard persists via complete')
  assert(!dashboardTodo.includes('dismissed'), 'no local dismiss hack')
})

run('51. Reassignment implemented', () => {
  assert(form.includes('weddingId: nextWeddingId'), 'global reassignment')
  assert(form.includes('Brak powiązania'), 'unlink supported')
})

console.log('\ntasks center CRUD Phase 1D.3.1: done')
