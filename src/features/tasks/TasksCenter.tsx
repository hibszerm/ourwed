import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { useCurrentStudioUser } from '@/features/auth/useCurrentStudioUser'
import { ProGateAction } from '@/features/billing/ProAccessGate'
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
import { TasksCenterRow } from '@/features/tasks/TasksCenterRow'
import { useStudioTasks } from '@/features/tasks/useStudioTasks'
import { taskService, type StudioTask } from '@/lib/api/taskService'
import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'
import styles from './TasksCenter.module.css'

export function TasksCenter() {
  const query = useStudioTasks()
  const queryClient = useQueryClient()
  const { data: studioUser } = useCurrentStudioUser()
  const userId = studioUser?.id
  const { showToast } = useToast()
  const [filter, setFilter] = useState<TasksCenterFilter>('active')
  const [formOpen, setFormOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<StudioTask | null>(null)
  const [deleteTask, setDeleteTask] = useState<StudioTask | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const todayKey = localCalendarDateKey()

  const bundle = query.data
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
    setFormOpen(true)
  }

  function openEdit(task: StudioTask) {
    setEditingTask(task)
    setFormOpen(true)
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
    const previous = patchStudioTaskStatus(queryClient, userId, task.id, next)
    patchWeddingTaskStatus(queryClient, userId, task, {
      completed: next.completed,
    })
    setFilter(completing ? 'done' : 'active')
    setTogglingId(task.id)

    try {
      if (completing) {
        await taskService.complete(task.id)
      } else {
        await taskService.reopen(task.id)
      }
      // Background verify — do not block the row transition.
      void invalidateTaskDomain(queryClient, {
        weddingIds: [task.weddingId],
      })
    } catch (err) {
      restoreStudioTasksBundle(queryClient, userId, previous)
      if (previous) {
        const rolled = previous.tasks.find((t) => t.id === task.id)
        if (rolled) {
          patchWeddingTaskStatus(queryClient, userId, rolled, {
            completed: rolled.completed,
          })
        }
      }
      setFilter(completing ? 'active' : 'done')
      const message =
        err instanceof Error
          ? err.message
          : 'Nie udało się zaktualizować zadania.'
      showToast(message, 'error')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Filtr zadań">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'active'}
            className={`${styles.tab} ${filter === 'active' ? styles.tabActive : ''}`}
            onClick={() => setFilter('active')}
          >
            Aktywne
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'done'}
            className={`${styles.tab} ${filter === 'done' ? styles.tabActive : ''}`}
            onClick={() => setFilter('done')}
          >
            Wykonane
          </button>
        </div>

        <ProGateAction
          actionKey="create_task"
          className={styles.addBtn}
          onAllowed={openCreate}
        >
          Dodaj zadanie
        </ProGateAction>
      </div>

      {query.isError && !bundle ? (
        <EmptyState
          title="Nie udało się załadować zadań"
          description="Spróbuj odświeżyć stronę."
        />
      ) : !showBody ? null : filter === 'active' ? (
        activeCount === 0 ? (
          <EmptyState
            title="Brak aktywnych zadań"
            description="Dodaj pierwsze zadanie albo dokończ je przy ślubie w Historii."
          />
        ) : (
          <div className={styles.sections}>
            {activeSections.map((section) => (
              <section
                key={section.id}
                className={styles.section}
                data-section={section.id}
              >
                <h2
                  className={
                    section.id === 'overdue'
                      ? `${styles.sectionTitle} ${styles.sectionTitleOverdue}`
                      : styles.sectionTitle
                  }
                >
                  {section.title}
                </h2>
                <ul className={styles.list}>
                  {section.tasks.map((task) => (
                    <TasksCenterRow
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
                      onToggleComplete={handleToggle}
                      onEdit={openEdit}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : doneTasks.length === 0 ? (
        <EmptyState
          title="Brak wykonanych zadań"
          description="Ukończone zadania pojawią się w tej liście."
        />
      ) : (
        <ul className={styles.list}>
          {doneTasks.map((task) => (
            <TasksCenterRow
              key={task.id}
              task={task}
              wedding={
                task.weddingId
                  ? bundle.weddingById.get(task.weddingId)
                  : undefined
              }
              completed
              toggling={togglingId === task.id}
              onToggleComplete={handleToggle}
              onEdit={openEdit}
            />
          ))}
        </ul>
      )}

      <TaskFormModal
        open={formOpen}
        task={editingTask}
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
