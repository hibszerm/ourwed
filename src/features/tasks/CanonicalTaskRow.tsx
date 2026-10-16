import { Link } from 'react-router-dom'
import { IconCheck } from '@/components/icons'
import { UsersRound } from 'lucide-react'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { formatShortDate } from '@/lib/utils/dates'
import { localCalendarDateKey, toLocalCalendarDateKey } from '@/lib/utils/localCalendarDate'
import type { Task, Wedding } from '@/types/wedding'
import styles from '@/features/dashboard/components/TodoTodayCard.module.css'

export function CanonicalTaskRow({ task, wedding, canComplete, onComplete, onEdit, onDelete, shared = false, onOpenWedding, completing = false, animationDelay, rowStyles = styles }: {
  task: Task; wedding?: Wedding; canComplete: boolean; onComplete?: (task: Task) => void
  onEdit?: (task: Task) => void; onDelete?: (task: Task) => void; shared?: boolean
  onOpenWedding?: (weddingId: string) => void; completing?: boolean; animationDelay?: string
  rowStyles?: Record<string, string>
}) {
  const today = localCalendarDateKey()
  const due = toLocalCalendarDateKey(task.dueDate)
  const couple = wedding ? getWeddingDisplayName(wedding) : task.weddingLabel ?? null
  const body = <>
    {couple ? <span className={rowStyles.couple}>{couple}</span> : null}
    {!task.weddingId ? <span className={rowStyles.unlinked}>Bez zlecenia</span> : null}
    <span className={rowStyles.taskTitle}>{task.title}</span>
    {shared ? <span className={rowStyles.sharedMark} aria-label="Wspólne zlecenie"><UsersRound size={14} strokeWidth={1.75} aria-hidden="true" /></span> : null}
    {due ? <span className={due < today ? rowStyles.overdueMeta : rowStyles.date}>{due < today ? 'Zaległe · ' : ''}{formatShortDate(due)}</span> : null}
  </>
  return <li className={canComplete ? rowStyles.item : rowStyles.itemReadOnly} style={animationDelay ? { animationDelay } : undefined}>
    {canComplete ? <button type="button" className={task.completed ? rowStyles.checkboxDone : rowStyles.checkbox} aria-pressed={task.completed} aria-label={`${task.completed ? 'Oznacz jako aktywne' : 'Oznacz jako wykonane'}: ${task.title}`} disabled={completing} onClick={() => onComplete?.(task)}>
      <IconCheck className={rowStyles.checkIcon} width={14} height={14} aria-hidden />
    </button> : null}
    {task.weddingId && onOpenWedding ? <button type="button" className={rowStyles.body} onClick={() => onOpenWedding(task.weddingId!)}>{body}</button>
      : task.weddingId ? <Link to={`/sluby/${task.weddingId}`} className={rowStyles.body}>{body}</Link>
      : <div className={rowStyles.body}><span className={rowStyles.taskTitle}>{task.title}</span></div>}
    {canComplete && (onEdit || onDelete) ? <div className={rowStyles.rowActions}>
      {onEdit ? <button type="button" onClick={() => onEdit(task)} aria-label={`Edytuj: ${task.title}`}>Edytuj</button> : null}
      {onDelete ? <button type="button" onClick={() => onDelete(task)} aria-label={`Usuń: ${task.title}`}>Usuń</button> : null}
    </div> : null}
  </li>
}
