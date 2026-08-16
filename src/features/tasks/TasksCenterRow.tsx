import { Link } from 'react-router-dom'
import type { StudioTask } from '@/lib/api/taskService'
import type { TaskWeddingMeta } from '@/features/tasks/taskWeddingMeta'
import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'
import styles from './TasksCenter.module.css'

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

function formatWeddingDate(iso: string | null): string | null {
  if (!iso) return null
  const key = iso.slice(0, 10)
  const [y, m, d] = key.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export interface TasksCenterRowProps {
  task: StudioTask
  wedding: TaskWeddingMeta | undefined
  /** Show due date beside the title (hide inside “Dziś” section). */
  showDueDate?: boolean
  /** Completed list — checked + reopen. */
  completed?: boolean
  /** Soft overdue cue on due label only. */
  overdue?: boolean
  toggling?: boolean
  onToggleComplete: (task: StudioTask) => void
  onEdit: (task: StudioTask) => void
}

export function TasksCenterRow({
  task,
  wedding,
  showDueDate = true,
  completed = false,
  overdue = false,
  toggling = false,
  onToggleComplete,
  onEdit,
}: TasksCenterRowProps) {
  const todayKey = localCalendarDateKey()
  const dueLabel =
    showDueDate && task.dueDate ? formatDueLabel(task.dueDate, todayKey) : null

  const weddingDateLabel = wedding
    ? formatWeddingDate(wedding.weddingDate)
    : null

  return (
    <li className={styles.row}>
      <button
        type="button"
        className={completed ? styles.checkDone : styles.check}
        aria-pressed={completed}
        aria-label={completed ? 'Oznacz jako aktywne' : 'Oznacz jako wykonane'}
        disabled={toggling}
        onClick={(e) => {
          e.stopPropagation()
          onToggleComplete(task)
        }}
      />
      <div className={styles.body}>
        <div className={styles.titleRow}>
          <button
            type="button"
            className={completed ? styles.titleDoneBtn : styles.titleBtn}
            onClick={() => onEdit(task)}
          >
            {task.title}
          </button>
          {dueLabel ? (
            <button
              type="button"
              className={
                overdue && !completed ? styles.dueOverdueBtn : styles.dueBtn
              }
              onClick={() => onEdit(task)}
            >
              {dueLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={styles.editCue}
            aria-label="Edytuj zadanie"
            onClick={() => onEdit(task)}
          >
            Edytuj
          </button>
        </div>
        <div className={styles.meta}>
          {task.weddingId && wedding ? (
            <Link
              to={`/sluby/${task.weddingId}`}
              className={styles.weddingLink}
              onClick={(e) => e.stopPropagation()}
            >
              {wedding.label}
              {weddingDateLabel ? ` · ${weddingDateLabel}` : ''}
            </Link>
          ) : task.weddingId ? (
            <Link
              to={`/sluby/${task.weddingId}`}
              className={styles.weddingLink}
              onClick={(e) => e.stopPropagation()}
            >
              Ślub
            </Link>
          ) : (
            <button
              type="button"
              className={styles.unlinkedBtn}
              onClick={() => onEdit(task)}
            >
              Bez zlecenia
            </button>
          )}
        </div>
      </div>
    </li>
  )
}
