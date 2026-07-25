import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatShortDate } from '@/lib/utils/dates'
import type {
  ActivityFeedItem,
  ActivityFilter,
} from '@/features/weddings/detail/v2/weddingDetailV2Types'
import type { Task, Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: 'all', label: 'Wszystko' },
  { id: 'notes', label: 'Notatki' },
  { id: 'tasks', label: 'Zadania' },
  { id: 'questionnaires', label: 'Ankiety' },
  { id: 'system', label: 'Zmiany systemowe' },
]

interface Props {
  wedding: Wedding
  feed: ActivityFeedItem[]
  tasks: Task[]
  editing: boolean
  onAddNote?: () => void
  onChangeTasks: (tasks: Task[]) => void
  onEditTasks?: () => void
  onEditNotes?: () => void
}

export function WeddingActivityWorkspace({
  wedding,
  feed,
  tasks,
  editing,
  onAddNote,
  onChangeTasks,
  onEditTasks,
  onEditNotes,
}: Props) {
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const filtered = useMemo(
    () =>
      filter === 'all' ? feed : feed.filter((item) => item.filter === filter),
    [feed, filter],
  )

  const q = wedding.questionnaires.contractData
  const pendingTasks = tasks.filter((t) => !t.completed)

  function addTask() {
    onChangeTasks([
      ...tasks,
      {
        id: `temp-${crypto.randomUUID()}`,
        weddingId: wedding.id,
        title: '',
        dueDate: new Date().toISOString().slice(0, 10),
        completed: false,
        priority: 'medium',
      },
    ])
  }

  return (
    <div
      className={styles.activityWorkspace}
      data-testid="wedding-activity-workspace"
    >
      <div className={styles.activitySummaries}>
        <div className={styles.activitySummaryChip}>
          <span className={styles.bandLabel}>Ankieta do umowy</span>
          <p className={styles.contextStrong}>
            {q.status === 'completed'
              ? `Wypełniona${q.completedAt ? ` · ${formatShortDate(q.completedAt)}` : ''}`
              : q.status === 'not_sent'
                ? 'Nie wysłana'
                : 'Wysłana'}
          </p>
        </div>
        <div className={styles.activitySummaryChip}>
          <span className={styles.bandLabel}>Zadania</span>
          <p className={styles.contextStrong}>
            {tasks.length === 0
              ? 'Brak zadań'
              : pendingTasks.length === 0
                ? 'Wszystko wykonane'
                : `${pendingTasks.length} otwarte`}
          </p>
        </div>
      </div>

      <div className={styles.activityQuick}>
        {onAddNote && !editing ? (
          <Button type="button" variant="secondary" size="sm" onClick={onAddNote}>
            Dodaj notatkę
          </Button>
        ) : null}
        {onEditNotes && !editing ? (
          <Button type="button" variant="ghost" size="sm" onClick={onEditNotes}>
            Edytuj notatki
          </Button>
        ) : null}
        {onEditTasks && !editing ? (
          <Button type="button" variant="ghost" size="sm" onClick={onEditTasks}>
            Edytuj zadania
          </Button>
        ) : null}
        {editing ? (
          <Button type="button" variant="secondary" size="sm" onClick={addTask}>
            Dodaj zadanie
          </Button>
        ) : null}
      </div>

      <div
        className={styles.activityFilters}
        role="tablist"
        aria-label="Filtr aktywności"
      >
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={
              filter === f.id ? styles.filterActive : styles.filterTab
            }
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className={styles.activityFeed}>
        {filtered.length === 0 ? (
          <li className={styles.contextMuted}>Brak pozycji w tym filtrze.</li>
        ) : (
          filtered.map((item) => (
            <li key={item.id} className={styles.activityFeedItem}>
              <div className={styles.activityFeedMeta}>
                <span className={styles.activityBadge}>
                  {item.badge || item.source}
                </span>
                <time>{formatShortDate(item.date)}</time>
              </div>
              <p className={styles.recentTitle}>{item.title}</p>
              {item.body ? (
                <p className={styles.activityBody}>{item.body}</p>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
