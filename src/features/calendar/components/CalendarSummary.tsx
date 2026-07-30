import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { formatDate, getDaysUntil } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import { UNKNOWN_TIME_LABEL } from '../utils/calendarEvents'
import {
  getMonthlyAssignmentStats,
  getNearestUpcomingAssignment,
} from '../utils/assignmentMetrics'
import { formatMonthTitle } from '../utils/calendarDates'
import type { CalendarUiEvent } from '../utils/calendarEvents'
import styles from './CalendarSummary.module.css'

interface CalendarSummaryProps {
  events: CalendarUiEvent[]
  anchor: Date
}

function countdownLabel(dateKey: string): string {
  const days = getDaysUntil(dateKey)
  if (days === 0) return 'Dziś'
  if (days === 1) return 'Jutro'
  return `Za ${days} dni`
}

export function CalendarSummary({ events, anchor }: CalendarSummaryProps) {
  const nearest = getNearestUpcomingAssignment(events)
  const stats = getMonthlyAssignmentStats(events, anchor)
  const monthLabel = formatMonthTitle(anchor)

  return (
    <div className={styles.summary}>
      <div className={styles.item}>
        <span className={styles.label}>Najbliższe zlecenie</span>
        {nearest ? (
          <Link to={nearest.href} className={styles.nearestLink}>
            <p className={styles.value}>{formatDate(nearest.dateKey)}</p>
            <p className={styles.couple}>
              <Badge
                variant={nearest.entityType === 'wedding' ? 'info' : 'neutral'}
              >
                {nearest.assignmentTypeLabel}
              </Badge>
              <span>{nearest.title}</span>
            </p>
            <span className={styles.meta}>
              {[
                nearest.ceremonyTime
                  ? nearest.timeLabel === UNKNOWN_TIME_LABEL
                    ? nearest.ceremonyTime
                    : nearest.timeLabel
                  : null,
                nearest.locationSummary,
                countdownLabel(nearest.dateKey),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </Link>
        ) : (
          <p className={styles.value}>Brak nadchodzących zleceń</p>
        )}
      </div>

      <div className={styles.item}>
        <span className={styles.label}>Śluby · Sesje</span>
        <p className={styles.month}>{monthLabel}</p>
        <p className={styles.valueLarge}>
          {stats.weddingCount}
          <span className={styles.countSep}>·</span>
          {stats.sessionCount}
        </p>
      </div>

      <div className={styles.item}>
        <span className={styles.label}>Wartość zleceń</span>
        <p className={styles.month}>{monthLabel}</p>
        <p className={styles.valueLarge}>
          {formatCurrency(stats.assignmentValue)}
        </p>
      </div>
    </div>
  )
}
