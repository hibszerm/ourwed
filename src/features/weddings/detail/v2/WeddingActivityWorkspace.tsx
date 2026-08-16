import { Button } from '@/components/ui/Button'
import { formatShortDate } from '@/lib/utils/dates'
import type {
  ActivityFeedItem,
  ActivityFilter,
} from '@/features/weddings/detail/v2/weddingDetailV2Types'
import { useMemo, useState } from 'react'
import styles from './WeddingDetailV2.module.css'

const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: 'all', label: 'Wszystko' },
  { id: 'notes', label: 'Notatki' },
  { id: 'tasks', label: 'Zadania' },
  { id: 'questionnaires', label: 'Ankiety' },
  { id: 'system', label: 'Zmiany systemowe' },
]

interface Props {
  feed: ActivityFeedItem[]
  onEditTasks?: () => void
  onEditNotes?: () => void
}

/**
 * Historia — chronological event log + entry to Tasks/Notes drawer CRUD.
 * Current-state summaries and Next Action live on Overview.
 */
export function WeddingActivityWorkspace({
  feed,
  onEditTasks,
  onEditNotes,
}: Props) {
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const filtered = useMemo(
    () =>
      filter === 'all' ? feed : feed.filter((item) => item.filter === filter),
    [feed, filter],
  )

  const showTaskActions =
    Boolean(onEditTasks) && (filter === 'all' || filter === 'tasks')
  const showNoteActions =
    Boolean(onEditNotes) && (filter === 'all' || filter === 'notes')

  return (
    <div
      className={styles.activityWorkspace}
      data-testid="wedding-activity-workspace"
    >
      <div className={styles.activityHeader}>
        <h2 className={styles.sectionHeading}>Historia</h2>
        {showTaskActions || showNoteActions ? (
          <div className={styles.activityActions} data-testid="history-crud-actions">
            {showTaskActions ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="history-edit-tasks"
                onClick={onEditTasks}
              >
                Edytuj zadania
              </Button>
            ) : null}
            {showNoteActions ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="history-edit-notes"
                onClick={onEditNotes}
              >
                Edytuj notatki
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className={styles.activityFilters}
        role="tablist"
        aria-label="Filtr historii"
        data-testid="history-filters"
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
            data-testid={`history-filter-${f.id}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className={styles.activityFeed} data-testid="history-event-list">
        {filtered.length === 0 ? (
          <li className={styles.contextMuted} data-testid="history-empty">
            Brak pozycji w tym filtrze.
          </li>
        ) : (
          filtered.map((item) => (
            <li
              key={item.id}
              className={styles.activityFeedItem}
              data-testid="history-event"
              data-filter={item.filter}
            >
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
