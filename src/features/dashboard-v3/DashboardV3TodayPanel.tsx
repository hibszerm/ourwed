import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { IconCheck, IconChevronDown } from '@/components/icons'
import { FloatingPortal } from '@/components/ui/FloatingPortal'
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
  collaborativeTaskErrorCode,
  reconcileSharedTaskCaches,
} from '@/features/tasks/invalidateTaskDomain'
import { taskService } from '@/lib/api/taskService'
import { collaborativeTasksService } from '@/features/collaboration/collaborativeTasksService'
import { CanonicalTaskRow } from '@/features/tasks/CanonicalTaskRow'
import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'
import type { Task, Wedding } from '@/types/wedding'
import styles from './DashboardV3TodayPanel.module.css'

const TODAY_PREVIEW_LIMIT = 2

const HORIZON_MENU_PLACEMENT = {
  gap: 8,
  minMenuWidth: 196,
  maxMenuWidth: 260,
  align: 'start' as const,
  forceAnchored: true,
  maxMenuHeight: 220,
  minSpace: 120,
  padding: 8,
}

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
  const [completingId, setCompletingId] = useState<string | null>(null)

  const todayKey = localCalendarDateKey()
  const endDate = dashboardTaskHorizonEndDate(horizon, todayKey)
  const { data } = useDashboard(endDate)
  const tasks = data?.todayTasks ?? []

  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const weddingById = new Map(weddings.map((w) => [w.id, w]))
  const emptyCopy = dashboardTaskHorizonEmptyCopy(horizon)
  const preview = tasks.slice(0, TODAY_PREVIEW_LIMIT)
  const remaining = Math.max(0, tasks.length - preview.length)

  useEffect(() => {
    if (!menuOpen) return

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return
      }
      setMenuOpen(false)
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
      task.shared === true,
    )
    const previousStudio = patchStudioTaskStatus(queryClient, userId, task.id, {
      status: 'done', completed: true, completedAt: new Date().toISOString(),
    }, task.shared === true)
    if (!task.shared) patchWeddingTaskStatus(queryClient, userId, task, { completed: true })

    try {
      if (task.shared) {
        if (!task.weddingId || !task.accessVersion || !task.revision) throw new Error('TASK_AUTHORITY_REQUIRED')
        await collaborativeTasksService.mutate({ action: 'complete', weddingId: task.weddingId,
          accessVersion: task.accessVersion, taskId: task.id, expectedRevision: task.revision })
      } else await taskService.complete(task.id)
      void invalidateTaskDomain(queryClient, {
        weddingIds: [task.weddingId],
      })
    } catch (error) {
      const authorityError = task.shared ? collaborativeTaskErrorCode(error) : null
      if (task.shared && authorityError) {
        restoreDashboardDueTasks(queryClient, userId, endDate, previousDashboard, true)
        restoreStudioTasksBundle(queryClient, userId, previousStudio, true)
        await reconcileSharedTaskCaches(queryClient, userId, { weddingId: task.weddingId ?? undefined, outcome: authorityError })
      } else {
        restoreDashboardDueTasks(queryClient, userId, endDate, previousDashboard, task.shared === true)
        restoreStudioTasksBundle(queryClient, userId, previousStudio, task.shared === true)
      }
      if (previousStudio) {
        const rolled = previousStudio.tasks.find((t) => t.id === task.id)
        if (rolled && !task.shared) {
          patchWeddingTaskStatus(queryClient, userId, rolled, {
            completed: rolled.completed,
          })
        }
      } else {
        if (!task.shared) patchWeddingTaskStatus(queryClient, userId, task, {
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
          <FloatingPortal
            open={menuOpen}
            anchorRef={triggerRef}
            options={HORIZON_MENU_PLACEMENT}
          >
            {() => (
              <div
                ref={menuRef}
                id={menuId}
                className={styles.horizonMenu}
                role="menu"
                aria-label="Zakres zadań"
                data-testid="dashboard-v3-horizon-menu"
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
            )}
          </FloatingPortal>
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
          {preview.map((task) => (
            <CanonicalTaskRow
              key={task.id}
              task={task}
              wedding={task.weddingId ? weddingById.get(task.weddingId) : undefined}
              canComplete={task.canEdit !== false}
              onComplete={(selected) => void handleComplete(selected)}
              shared={task.shared === true}
              completing={completingId === task.id}
              rowStyles={styles}
            />
          ))}
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
