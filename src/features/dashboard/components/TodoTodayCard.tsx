import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { IconCheck, IconChevronDown } from '@/components/icons'
import { useToast } from '@/components/ui/Toast'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import {
  DASHBOARD_TASK_HORIZONS,
  DASHBOARD_TASK_HORIZON_MENU,
  DASHBOARD_TASK_HORIZON_TRIGGER,
  DEFAULT_DASHBOARD_TASK_HORIZON,
  dashboardTaskHorizonEmptyCopy,
  dashboardTaskHorizonEndDate,
  type DashboardTaskHorizon,
} from '@/features/dashboard/dashboardTaskHorizon'
import { useDashboard } from '@/features/dashboard/hooks/useDashboard'
import {
  invalidateTaskDomain,
  patchStudioTaskStatus,
  patchWeddingTaskStatus,
  removeDashboardDueTask,
  restoreDashboardDueTasks,
  restoreStudioTasksBundle,
} from '@/features/tasks/invalidateTaskDomain'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { taskService } from '@/lib/api/taskService'
import { formatShortDate } from '@/lib/utils/dates'
import {
  localCalendarDateKey,
  toLocalCalendarDateKey,
} from '@/lib/utils/localCalendarDate'
import type { Task, Wedding } from '@/types/wedding'
import styles from './TodoTodayCard.module.css'

interface TodoTodayCardProps {
  weddings: Wedding[]
  /**
   * Optional override (landing demo). When set, skips relying on live query
   * results and filters this list by the selected horizon locally.
   */
  tasks?: Task[]
  /** When set, task rows open via callback instead of router Link. */
  onOpenWedding?: (weddingId: string) => void
}

function filterTasksThroughEndDate(tasks: Task[], endDate: string): Task[] {
  return tasks
    .filter((task) => {
      if (task.completed) return false
      const due = toLocalCalendarDateKey(task.dueDate)
      if (!due) return false
      return due <= endDate
    })
    .sort((a, b) => {
      const da = toLocalCalendarDateKey(a.dueDate) ?? ''
      const db = toLocalCalendarDateKey(b.dueDate) ?? ''
      if (da !== db) return da.localeCompare(db)
      return a.id.localeCompare(b.id)
    })
}

export function TodoTodayCard({
  weddings,
  tasks: tasksOverride,
  onOpenWedding,
}: TodoTodayCardProps) {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const { showToast } = useToast()
  const [horizon, setHorizon] = useState<DashboardTaskHorizon>(
    DEFAULT_DASHBOARD_TASK_HORIZON,
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPlacement, setMenuPlacement] = useState<'below' | 'above'>('below')
  const [completingId, setCompletingId] = useState<string | null>(null)

  const todayKey = localCalendarDateKey()
  const endDate = dashboardTaskHorizonEndDate(horizon, todayKey)
  const { data } = useDashboard(endDate)
  const tasks = tasksOverride
    ? filterTasksThroughEndDate(tasksOverride, endDate)
    : (data?.todayTasks ?? [])

  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const weddingById = new Map(weddings.map((w) => [w.id, w]))
  const emptyCopy = dashboardTaskHorizonEmptyCopy(horizon)

  useLayoutEffect(() => {
    if (!menuOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    setMenuPlacement(spaceBelow < 220 ? 'above' : 'below')
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  async function handleComplete(task: Task) {
    if (completingId) return

    setCompletingId(task.id)

    const previousDashboard = removeDashboardDueTask(
      queryClient,
      userId,
      endDate,
      task.id,
    )
    const previousStudio = patchStudioTaskStatus(queryClient, userId, task.id, {
      status: 'done',
      completed: true,
      completedAt: new Date().toISOString(),
    })
    patchWeddingTaskStatus(queryClient, userId, task, { completed: true })

    try {
      await taskService.complete(task.id)
      void invalidateTaskDomain(queryClient, {
        weddingIds: [task.weddingId],
      })
    } catch {
      restoreDashboardDueTasks(
        queryClient,
        userId,
        endDate,
        previousDashboard,
      )
      restoreStudioTasksBundle(queryClient, userId, previousStudio)
      if (previousStudio) {
        const rolled = previousStudio.tasks.find((t) => t.id === task.id)
        if (rolled) {
          patchWeddingTaskStatus(queryClient, userId, rolled, {
            completed: rolled.completed,
          })
        }
      } else {
        patchWeddingTaskStatus(queryClient, userId, task, {
          completed: false,
        })
      }
      showToast('Nie udało się oznaczyć zadania jako wykonane.', 'error')
    } finally {
      setCompletingId(null)
    }
  }

  function selectHorizon(next: DashboardTaskHorizon) {
    setHorizon(next)
    setMenuOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <div className={styles.horizon} ref={rootRef}>
          <button
            ref={triggerRef}
            type="button"
            className={styles.horizonTrigger}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className={styles.horizonLabel}>
              {DASHBOARD_TASK_HORIZON_TRIGGER[horizon]}
            </span>
            <IconChevronDown
              className={`${styles.horizonChevron} ${menuOpen ? styles.horizonChevronOpen : ''}`}
              width={14}
              height={14}
              aria-hidden
            />
          </button>
          {menuOpen ? (
            <div
              id={menuId}
              className={`${styles.horizonMenu} ${
                menuPlacement === 'above' ? styles.horizonMenuAbove : ''
              }`}
              role="menu"
              aria-label="Zakres zadań"
            >
              {DASHBOARD_TASK_HORIZONS.map((option) => {
                const selected = option === horizon
                return (
                  <button
                    key={option}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={`${styles.horizonOption} ${selected ? styles.horizonOptionSelected : ''}`}
                    onClick={() => selectHorizon(option)}
                  >
                    <span>{DASHBOARD_TASK_HORIZON_MENU[option]}</span>
                    {selected ? (
                      <IconCheck width={14} height={14} aria-hidden />
                    ) : null}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
        {tasks.length > 0 && (
          <span className={styles.count}>{tasks.length}</span>
        )}
      </header>

      {tasks.length === 0 ? (
        <div className={styles.done}>
          <span className={styles.doneIcon}>
            <IconCheck width={20} height={20} />
          </span>
          <p className={styles.doneText}>{emptyCopy.title}</p>
          <p className={styles.doneSub}>{emptyCopy.subtitle}</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {tasks.map((task, i) => {
            const wedding = task.weddingId
              ? weddingById.get(task.weddingId)
              : undefined
            const couple = wedding ? getWeddingDisplayName(wedding) : null
            const dueKey = toLocalCalendarDateKey(task.dueDate)
            const overdue = Boolean(dueKey && dueKey < todayKey)
            const isToday = dueKey === todayKey
            const isFuture = Boolean(dueKey && dueKey > todayKey)

            const bodyClass = styles.body
            const bodyLabel = couple
              ? `Otwórz ślub: ${couple}`
              : task.weddingId
                ? `Otwórz ślub`
                : task.title
            const bodyContent = (
              <>
                {couple ? (
                  <span className={styles.couple}>{couple}</span>
                ) : !task.weddingId ? (
                  <span className={styles.unlinked}>Bez zlecenia</span>
                ) : null}
                <span className={styles.taskTitle}>{task.title}</span>
                {overdue && dueKey ? (
                  <span className={styles.overdueMeta}>
                    Zaległe · {formatShortDate(dueKey)}
                  </span>
                ) : isFuture && dueKey ? (
                  <span className={styles.date}>{formatShortDate(dueKey)}</span>
                ) : isToday && wedding ? (
                  <span className={styles.date}>
                    {formatShortDate(wedding.date)}
                  </span>
                ) : null}
              </>
            )

            return (
              <li
                key={task.id}
                className={styles.item}
                style={{ animationDelay: `${0.16 + i * 0.06}s` }}
              >
                <button
                  type="button"
                  className={styles.checkbox}
                  disabled={completingId === task.id}
                  onClick={() => void handleComplete(task)}
                  aria-label={`Oznacz jako wykonane: ${task.title}`}
                >
                  <IconCheck
                    className={styles.checkIcon}
                    width={14}
                    height={14}
                  />
                </button>

                {onOpenWedding && wedding ? (
                  <button
                    type="button"
                    className={bodyClass}
                    aria-label={bodyLabel}
                    onClick={() => onOpenWedding(wedding.id)}
                  >
                    {bodyContent}
                  </button>
                ) : wedding ? (
                  <Link
                    to={`/sluby/${wedding.id}`}
                    className={bodyClass}
                    aria-label={bodyLabel}
                  >
                    {bodyContent}
                  </Link>
                ) : task.weddingId ? (
                  <Link
                    to={`/sluby/${task.weddingId}`}
                    className={bodyClass}
                    aria-label={bodyLabel}
                  >
                    {bodyContent}
                  </Link>
                ) : (
                  <div className={bodyClass} aria-label={bodyLabel}>
                    {bodyContent}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
