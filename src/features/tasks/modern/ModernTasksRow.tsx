import { Link } from 'react-router-dom'
import type { StudioTask } from '@/lib/api/taskService'
import type { TaskWeddingMeta } from '@/features/tasks/taskWeddingMeta'
import { TaskOverflowMenu } from '@/features/tasks/modern/TaskOverflowMenu'
import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'
import styles from './ModernTasksWorkspace.module.css'

function formatDueLabel(dueDate: string, todayKey: string): string {
  const key = dueDate.slice(0, 10)
  if (!key) return ''
  if (key === todayKey) return 'Dziś'
  const [y, m, d] = key.split('-').map(Number)
  if (!y || !m || !d) return key
  return new Date(y, m - 1, d).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
  })
}

export interface ModernTasksRowProps {
  task: StudioTask
  wedding: TaskWeddingMeta | undefined
  /** Show due date beside the title (hide inside “Dziś” section). */
  showDueDate?: boolean
  /** Completed list — checked + reopen. */
  completed?: boolean
  /** Soft overdue cue on due label only. */
  overdue?: boolean
  toggling?: boolean
  menuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
  onToggleComplete: (task: StudioTask) => void
  onEdit: (task: StudioTask) => void
  onDelete: (task: StudioTask) => void
}

export function ModernTasksRow({
  task,
  wedding,
  showDueDate = true,
  completed = false,
  overdue = false,
  toggling = false,
  menuOpen,
  onMenuOpenChange,
  onToggleComplete,
  onEdit,
  onDelete,
}: ModernTasksRowProps) {
  const todayKey = localCalendarDateKey()
  const dueLabel =
    showDueDate && task.dueDate ? formatDueLabel(task.dueDate, todayKey) : null

  return (
    <li className={styles.row}>
      <button
        type="button"
        className={completed ? styles.checkDone : styles.check}
        aria-pressed={completed}
        aria-label={completed ? 'Oznacz jako aktywne' : 'Oznacz jako wykonane'}
        disabled={toggling}
        onClick={() => onToggleComplete(task)}
      />
      <div className={styles.identity}>
        <p className={completed ? styles.titleDone : styles.title}>{task.title}</p>
        {task.weddingId && wedding ? (
          <Link
            to={`/sluby/${task.weddingId}`}
            className={styles.weddingLink}
          >
            {wedding.label}
          </Link>
        ) : task.weddingId ? (
          <Link to={`/sluby/${task.weddingId}`} className={styles.weddingLink}>
            Ślub
          </Link>
        ) : null}
      </div>
      {dueLabel ? (
        <span
          className={
            overdue && !completed ? styles.dueOverdue : styles.due
          }
        >
          {dueLabel}
        </span>
      ) : (
        <span className={styles.dueSlot} aria-hidden="true" />
      )}
      <TaskOverflowMenu
        open={menuOpen}
        onOpenChange={onMenuOpenChange}
        onEdit={() => onEdit(task)}
        onDelete={() => onDelete(task)}
      />
    </li>
  )
}
