import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { IconMapPin } from '@/components/icons'
import { formatDate, getDaysUntil } from '@/lib/utils/dates'
import {
  UNKNOWN_TIME_LABEL,
  type CalendarUiEvent,
} from '@/features/calendar/utils/calendarEvents'
import styles from './NextAssignmentsSection.module.css'

interface NextAssignmentsSectionProps {
  assignments: CalendarUiEvent[]
}

function countdownLabel(dateKey: string): string {
  const days = getDaysUntil(dateKey)
  if (days === 0) return 'Dziś'
  if (days === 1) return 'Jutro'
  return `Za ${days} dni`
}

function CompactAssignmentCard({
  assignment,
}: {
  assignment: CalendarUiEvent
}) {
  const timeDisplay =
    assignment.ceremonyTime && assignment.timeLabel !== UNKNOWN_TIME_LABEL
      ? assignment.timeLabel
      : assignment.ceremonyTime ?? null

  return (
    <Link to={assignment.href} className={styles.card}>
      <div className={styles.cardTop}>
        <Badge
          variant={assignment.entityType === 'wedding' ? 'info' : 'neutral'}
        >
          {assignment.assignmentTypeLabel}
        </Badge>
        <span className={styles.countdown}>{countdownLabel(assignment.dateKey)}</span>
      </div>
      <h3 className={styles.name}>{assignment.title}</h3>
      <p className={styles.meta}>
        <time>{formatDate(assignment.dateKey)}</time>
        {timeDisplay ? (
          <>
            <span aria-hidden> · </span>
            <span>{timeDisplay}</span>
          </>
        ) : null}
      </p>
      {assignment.locationSummary ? (
        <p className={styles.location}>
          <IconMapPin width={13} height={13} aria-hidden />
          <span title={assignment.locationSummary}>
            {assignment.locationSummary}
          </span>
        </p>
      ) : null}
    </Link>
  )
}

export function NextAssignmentsSection({
  assignments,
}: NextAssignmentsSectionProps) {
  if (assignments.length === 0) return null

  return (
    <section className={styles.section} aria-labelledby="next-assignments-title">
      <header className={styles.header}>
        <h2 id="next-assignments-title" className={styles.title}>
          Kolejne zlecenia
        </h2>
      </header>
      <div className={styles.grid}>
        {assignments.map((assignment) => (
          <CompactAssignmentCard
            key={`${assignment.entityType}:${assignment.entityId}`}
            assignment={assignment}
          />
        ))}
      </div>
    </section>
  )
}
