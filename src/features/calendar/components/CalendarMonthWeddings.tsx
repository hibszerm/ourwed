import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { IconMapPin } from '@/components/icons'
import { formatDate, getDaysUntil } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import { getAssignmentsInMonth } from '../utils/assignmentMetrics'
import { UNKNOWN_TIME_LABEL } from '../utils/calendarEvents'
import { formatMonthTitle, startOfMonth, toDateKey } from '../utils/calendarDates'
import type { CalendarUiEvent } from '../utils/calendarEvents'
import styles from './CalendarMonthWeddings.module.css'

interface CalendarMonthWeddingsProps {
  events: CalendarUiEvent[]
  anchor: Date
  /** When set, open CTA uses callback instead of router Link (landing demo). */
  onOpenAssignment?: (event: CalendarUiEvent) => void
  /** Opens the assignment chooser (generic “Dodaj zlecenie”). */
  onAddAssignment?: (dateKey: string) => void
  /** Hide empty-state create button (landing demo). */
  hideCreate?: boolean
}

function countdownLabel(dateKey: string): string | null {
  const days = getDaysUntil(dateKey)
  if (days < 0) return null
  if (days === 0) return 'Dziś'
  if (days === 1) return 'Jutro'
  return `Za ${days} dni`
}

function MonthAssignmentCard({
  event,
  onOpenAssignment,
}: {
  event: CalendarUiEvent
  onOpenAssignment?: (event: CalendarUiEvent) => void
}) {
  const countdown = countdownLabel(event.dateKey)
  const timeDisplay =
    event.ceremonyTime && event.timeLabel !== UNKNOWN_TIME_LABEL
      ? event.timeLabel
      : event.ceremonyTime
        ? event.ceremonyTime
        : null

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div className={styles.titles}>
          <h3 className={styles.name}>{event.title}</h3>
          <p className={styles.date}>{formatDate(event.dateKey)}</p>
          {timeDisplay ? <p className={styles.countdown}>{timeDisplay}</p> : null}
          {countdown ? <p className={styles.countdown}>{countdown}</p> : null}
        </div>
        <Badge variant={event.entityType === 'wedding' ? 'info' : 'neutral'}>
          {event.assignmentTypeLabel}
        </Badge>
      </header>

      <dl className={styles.meta}>
        <div className={styles.metaRow}>
          <dt>Lokalizacja</dt>
          <dd>
            {event.locationSummary ? (
              <>
                <IconMapPin width={12} height={12} />
                {event.locationSummary}
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Wartość</dt>
          <dd>{formatCurrency(event.assignmentValue)}</dd>
        </div>
      </dl>

      <footer className={styles.footer}>
        {onOpenAssignment ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenAssignment(event)}
          >
            Otwórz zlecenie
          </Button>
        ) : (
          <Link to={event.href}>
            <Button type="button" variant="secondary" size="sm">
              Otwórz zlecenie
            </Button>
          </Link>
        )}
      </footer>
    </article>
  )
}

export function CalendarMonthWeddings({
  events,
  anchor,
  onOpenAssignment,
  onAddAssignment,
  hideCreate = false,
}: CalendarMonthWeddingsProps) {
  const monthAnchor = startOfMonth(anchor)
  const monthAssignments = getAssignmentsInMonth(events, monthAnchor)
  const monthLabel = formatMonthTitle(monthAnchor)
  const emptyDateKey = toDateKey(monthAnchor)

  return (
    <section className={styles.section} aria-label={`Zlecenia w ${monthLabel}`}>
      <header className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Zlecenia w tym miesiącu</h2>
        <span className={styles.sectionMeta}>{monthLabel}</span>
      </header>

      {monthAssignments.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>Brak zleceń w tym miesiącu</p>
          {!hideCreate ? (
            onAddAssignment ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onAddAssignment(emptyDateKey)}
              >
                + Dodaj zlecenie
              </Button>
            ) : (
              <Link to={`/sluby/nowy?date=${emptyDateKey}`}>
                <Button type="button" variant="secondary" size="sm">
                  + Dodaj zlecenie
                </Button>
              </Link>
            )
          ) : null}
        </div>
      ) : (
        <div className={styles.grid}>
          {monthAssignments.map((event) => (
            <MonthAssignmentCard
              key={event.id}
              event={event}
              onOpenAssignment={onOpenAssignment}
            />
          ))}
        </div>
      )}
    </section>
  )
}
