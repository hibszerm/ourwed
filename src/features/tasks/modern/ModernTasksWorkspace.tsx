import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useCurrentStudioUser } from '@/features/auth/useCurrentStudioUser'
import { ProGateAction } from '@/features/billing/ProAccessGate'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import {
  groupActiveStudioTasks,
  listDoneStudioTasks,
  type TasksCenterFilter,
} from '@/features/tasks/groupStudioTasks'
import {
  invalidateTaskDomain,
  patchStudioTaskStatus,
  patchWeddingTaskStatus,
  restoreStudioTasksBundle,
} from '@/features/tasks/invalidateTaskDomain'
import { TaskDeleteModal } from '@/features/tasks/TaskDeleteModal'
import { TaskFormModal } from '@/features/tasks/TaskFormModal'
import { ModernTasksRow } from '@/features/tasks/modern/ModernTasksRow'
import {
  TASKS_ADD_LABEL,
  TASKS_EMPTY_ACTIVE_COPY,
  TASKS_EMPTY_ACTIVE_TITLE,
  TASKS_EMPTY_DONE_COPY,
  TASKS_EMPTY_DONE_TITLE,
  TASKS_ERROR_RETRY,
  TASKS_ERROR_TITLE,
  TASKS_FILTER_ARIA,
  TASKS_SUBTITLE,
  TASKS_TAB_ACTIVE,
  TASKS_TAB_DONE,
  TASKS_TITLE,
} from '@/features/tasks/modern/tasksCopy'
import { useStudioTasks } from '@/features/tasks/useStudioTasks'
import { taskService, type StudioTask } from '@/lib/api/taskService'
import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import styles from './ModernTasksWorkspace.module.css'
import { collaborativeTasksService } from '@/features/collaboration/collaborativeTasksService'
import { useQuery } from '@tanstack/react-query'
import { collaborativeTaskErrorCode, reconcileSharedTaskCaches } from '@/features/tasks/invalidateTaskDomain'

const SKELETON_ROWS = 4

export function ModernTasksWorkspace() {
  const query = useStudioTasks()
  const queryClient = useQueryClient()
  const { data: studioUser } = useCurrentStudioUser()
  const userId = studioUser?.id
  const { showToast } = useToast()
  const { canUsePro } = useProAccessGate()
  const sharedTargetsQuery = useQuery({
    queryKey: ['collaborative-task-targets-v3', userId],
    queryFn: () => collaborativeTasksService.listTargets(),
    enabled: Boolean(userId), staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true,
    refetchInterval: 30_000, refetchIntervalInBackground: false,
  })
  const [filter, setFilter] = useState<TasksCenterFilter>('active')
  const [formOpen, setFormOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<StudioTask | null>(null)
  const [deleteTask, setDeleteTask] = useState<StudioTask | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const todayKey = localCalendarDateKey()
  const bundle = query.data

  const currentEditingSharedTask = editingTask?.shared
    ? bundle?.tasks.find((task) => task.id === editingTask.id && task.shared)
    : undefined
  const sharedEditStillAuthorized = !editingTask?.shared || Boolean(
    currentEditingSharedTask?.canEdit
    && currentEditingSharedTask.accessVersion === editingTask.accessVersion,
  )

  const showBody = bundle != null

  const activeSections = useMemo(() => {
    if (!bundle) return []
    return groupActiveStudioTasks(bundle.tasks, todayKey)
  }, [bundle, todayKey])

  const doneTasks = useMemo(() => {
    if (!bundle) return []
    return listDoneStudioTasks(bundle.tasks)
  }, [bundle])

  const activeCount = useMemo(() => {
    if (!bundle) return 0
    return activeSections.reduce((n, s) => n + s.tasks.length, 0)
  }, [bundle, activeSections])

  function openCreate() {
    setEditingTask(null)
    setOpenMenuId(null)
    setFormOpen(true)
  }

  function openEdit(task: StudioTask) {
    setOpenMenuId(null)
    setEditingTask(task)
    setFormOpen(true)
  }

  function openDelete(task: StudioTask) {
    setOpenMenuId(null)
    setFormOpen(false)
    setEditingTask(null)
    setDeleteTask(task)
  }

  async function handleToggle(task: StudioTask) {
    if (togglingId) return

    const completing = task.status !== 'done'
    const next = completing
      ? {
          status: 'done' as const,
          completed: true,
          completedAt: new Date().toISOString(),
        }
      : {
          status: 'todo' as const,
          completed: false,
          completedAt: null,
        }

    // Optimistic: move between Aktywne / Wykonane immediately.
    const previous = patchStudioTaskStatus(queryClient, userId, task.id, next, task.shared)
    if (!task.shared) patchWeddingTaskStatus(queryClient, userId, task, {
      completed: next.completed,
    })
    setFilter(completing ? 'done' : 'active')
    setTogglingId(task.id)

    try {
      if (task.shared) {
        if (!task.weddingId || !task.accessVersion || !task.revision) throw new Error('TASK_AUTHORITY_REQUIRED')
        await collaborativeTasksService.mutate({ action: completing ? 'complete' : 'reopen',
          weddingId: task.weddingId, accessVersion: task.accessVersion, taskId: task.id,
          expectedRevision: task.revision })
      } else if (completing) {
        await taskService.complete(task.id)
      } else {
        await taskService.reopen(task.id)
      }
      // Background verify — do not block the row transition.
      void invalidateTaskDomain(queryClient, {
        weddingIds: [task.weddingId],
      })
    } catch (err) {
      const authorityError = task.shared ? collaborativeTaskErrorCode(err) : null
      if (task.shared && authorityError) {
        restoreStudioTasksBundle(queryClient, userId, previous, true)
        await reconcileSharedTaskCaches(queryClient, userId, { weddingId: task.weddingId ?? undefined, outcome: authorityError })
      } else restoreStudioTasksBundle(queryClient, userId, previous, task.shared)
      if (previous) {
        const rolled = previous.tasks.find((t) => t.id === task.id)
        if (rolled && !task.shared) {
          patchWeddingTaskStatus(queryClient, userId, rolled, {
            completed: rolled.completed,
          })
        }
      }
      if (!task.shared || !authorityError) setFilter(completing ? 'active' : 'done')
      const message =
        getUserFacingErrorMessage(err, 'Nie udało się zaktualizować zadania.')
      showToast(message, 'error')
    } finally {
      setTogglingId(null)
    }
  }

  const createButton = (
    sharedTargetsQuery.data?.length || canUsePro ? <button type="button" className={styles.createAction} onClick={openCreate}>
      {TASKS_ADD_LABEL}
    </button> :
    <ProGateAction
      actionKey="create_task"
      className={styles.createAction}
      onAllowed={openCreate}
    >
      {TASKS_ADD_LABEL}
    </ProGateAction>
  )

  return (
    <div className={styles.page} data-testid="tasks-modern">
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.pageTitle}>{TASKS_TITLE}</h1>
          <p className={styles.lead}>{TASKS_SUBTITLE}</p>
        </div>
        <div className={styles.actions}>{createButton}</div>
      </header>

      <div className={styles.catalog}>
        <div className={styles.tabs} role="tablist" aria-label={TASKS_FILTER_ARIA}>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'active'}
            className={`${styles.tab} ${filter === 'active' ? styles.tabActive : ''}`}
            onClick={() => setFilter('active')}
          >
            {TASKS_TAB_ACTIVE}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'done'}
            className={`${styles.tab} ${filter === 'done' ? styles.tabActive : ''}`}
            onClick={() => setFilter('done')}
          >
            {TASKS_TAB_DONE}
          </button>
        </div>

        {query.isError && !bundle ? (
          <div className={styles.surface} data-testid="tasks-error">
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>{TASKS_ERROR_TITLE}</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void query.refetch()}
              >
                {TASKS_ERROR_RETRY}
              </Button>
            </div>
          </div>
        ) : !showBody ? (
          <div
            className={styles.surface}
            aria-hidden
            data-testid="tasks-loading"
          >
            <div className={styles.skeleton}>
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <div key={index} className={styles.skeletonRow} />
              ))}
            </div>
          </div>
        ) : filter === 'active' ? (
          activeCount === 0 ? (
            <div className={styles.surface} data-testid="tasks-empty-active">
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>{TASKS_EMPTY_ACTIVE_TITLE}</p>
                <p className={styles.emptyDesc}>{TASKS_EMPTY_ACTIVE_COPY}</p>
                {createButton}
              </div>
            </div>
          ) : (
            <div className={styles.sections}>
              {activeSections.map((section) => (
                <section
                  key={section.id}
                  className={styles.section}
                  data-section={section.id}
                >
                  <h2 className={styles.sectionTitle}>{section.title}</h2>
                  <div className={styles.surface}>
                    <ul className={styles.list}>
                      {section.tasks.map((task) => (
                        <ModernTasksRow
                          key={task.id}
                          task={task}
                          wedding={
                            task.weddingId
                              ? bundle.weddingById.get(task.weddingId)
                              : undefined
                          }
                          showDueDate={section.id !== 'today'}
                          overdue={section.id === 'overdue'}
                          toggling={togglingId === task.id}
                          menuOpen={openMenuId === task.id}
                          onMenuOpenChange={(open) =>
                            setOpenMenuId(open ? task.id : null)
                          }
                          onToggleComplete={handleToggle}
                          onEdit={openEdit}
                          onDelete={openDelete}
                          canEdit={task.canEdit !== false}
                        />
                      ))}
                    </ul>
                  </div>
                </section>
              ))}
            </div>
          )
        ) : doneTasks.length === 0 ? (
          <div className={styles.surface} data-testid="tasks-empty-done">
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>{TASKS_EMPTY_DONE_TITLE}</p>
              <p className={styles.emptyDesc}>{TASKS_EMPTY_DONE_COPY}</p>
            </div>
          </div>
        ) : (
          <div className={styles.surface} data-testid="tasks-done-ledger">
            <ul className={styles.list}>
              {doneTasks.map((task) => (
                <ModernTasksRow
                  key={task.id}
                  task={task}
                  wedding={
                    task.weddingId
                      ? bundle.weddingById.get(task.weddingId)
                      : undefined
                  }
                  completed
                  toggling={togglingId === task.id}
                  menuOpen={openMenuId === task.id}
                  onMenuOpenChange={(open) =>
                    setOpenMenuId(open ? task.id : null)
                  }
                  onToggleComplete={handleToggle}
                  onEdit={openEdit}
                  onDelete={openDelete}
                  canEdit={task.canEdit !== false}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      <TaskFormModal
        open={formOpen && sharedEditStillAuthorized}
        task={editingTask}
        sharedTargets={sharedTargetsQuery.data ?? []}
        allowOwnedTargets={canUsePro === true}
        onClose={() => {
          setFormOpen(false)
          setEditingTask(null)
        }}
        onRequestDelete={
          editingTask
            ? () => {
                const t = editingTask
                setFormOpen(false)
                setEditingTask(null)
                setDeleteTask(t)
              }
            : undefined
        }
      />

      <TaskDeleteModal
        open={Boolean(deleteTask)}
        task={deleteTask}
        onClose={() => setDeleteTask(null)}
      />
    </div>
  )
}
