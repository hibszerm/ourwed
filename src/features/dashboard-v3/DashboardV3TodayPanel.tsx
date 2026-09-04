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
import styles from './DashboardV3TodayPanel.module.css'

const TODAY_PREVIEW_LIMIT = 2

interface DashboardV3TodayPanelProps {
  weddings: Wedding[]
}

function remainingTasksLabel(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  const noun =
    mod100 >= 12 && mod100 <= 14
      ? 'kolejnych'
      : mod10 >= 1 && mod10 <= 4
        ? 'kolejne'
        : 'kolejnych'
  return `+${count} ${noun}`
}

export function DashboardV3TodayPanel({ weddings }: DashboardV3TodayPanelProps) {
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
  const tasks = data?.todayTasks ?? []

  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const weddingById = new Map(weddings.map((w) => [w.id, w]))
  const emptyCopy = dashboardTaskHorizonEmptyCopy(horizon)
  const preview = tasks.slice(0, TODAY_PREVIEW_LIMIT)
  const remaining = Math.max(0, tasks.length - preview.length)

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
    <section
      className={`${styles.panel} v3MaterialOperational`}
      data-testid="dashboard-v3-today"
      aria-label="Zadania na dziś"
    >
      <header className={styles.header}>
        <div className={styles.horizon} ref={rootRef}>
          <button
            ref={triggerRef}
            type="button"
            className={`${styles.horizonTrigger} v3MaterialOverlay`}
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
        {tasks.length > 0 ? (
          <span className={styles.count}>{tasks.length}</span>
        ) : null}
      </header>

      {tasks.length === 0 ? (
        <div className={styles.done}>
          <span className={styles.doneIcon} aria-hidden>
            <IconCheck width={22} height={22} />
          </span>
          <p className={styles.doneText}>{emptyCopy.title}</p>
          <p className={styles.doneSub}>{emptyCopy.subtitle}</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {preview.map((task) => {
            const wedding = task.weddingId
              ? weddingById.get(task.weddingId)
              : undefined
            const couple = wedding ? getWeddingDisplayName(wedding) : null
            const dueKey = toLocalCalendarDateKey(task.dueDate)
            const overdue = Boolean(dueKey && dueKey < todayKey)
            const isToday = dueKey === todayKey
            const isFuture = Boolean(dueKey && dueKey > todayKey)

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
              <li key={task.id} className={styles.item}>
                <button
                  type="button"
                  className={styles.checkbox}
                  disabled={completingId === task.id}
                  onClick={() => void handleComplete(task)}
                  aria-label={`Oznacz jako wykonane: ${task.title}`}
                >
                  <IconCheck
                    className={styles.checkIcon}
                    width={12}
                    height={12}
                  />
                </button>

                {wedding ? (
                  <Link
                    to={`/sluby/${wedding.id}`}
                    className={styles.body}
                    aria-label={bodyLabel}
                  >
                    {bodyContent}
                  </Link>
                ) : task.weddingId ? (
                  <Link
                    to={`/sluby/${task.weddingId}`}
                    className={styles.body}
                    aria-label={bodyLabel}
                  >
                    {bodyContent}
                  </Link>
                ) : (
                  <div className={styles.body} aria-label={bodyLabel}>
                    {bodyContent}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {remaining > 0 ? (
        <div className={styles.moreSlot}>
          <Link to="/zadania" className={styles.more}>
            {remainingTasksLabel(remaining)}
          </Link>
        </div>
      ) : (
        <div className={styles.moreSlot} aria-hidden />
      )}
    </section>
  )
}
