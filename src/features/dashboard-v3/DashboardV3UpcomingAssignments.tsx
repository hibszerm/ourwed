import { Link } from 'react-router-dom'
import { IconMapPin } from '@/components/icons'
import {
  UNKNOWN_TIME_LABEL,
  type CalendarUiEvent,
} from '@/features/calendar/utils/calendarEvents'
import { getDashboardLocationLabel } from '@/features/dashboard/presentation/getDashboardLocationLabel'
import { dashboardAssignmentRelativeLabel } from './dashboardV3AssignmentPresentation'
import styles from './DashboardV3UpcomingAssignments.module.css'

interface DashboardV3UpcomingAssignmentsProps {
  assignments: CalendarUiEvent[]
  labelledBy: string
}

function assignmentTime(assignment: CalendarUiEvent): string | null {
  if (assignment.ceremonyTime && assignment.timeLabel !== UNKNOWN_TIME_LABEL) {
    return assignment.timeLabel
  }
  return assignment.ceremonyTime ?? null
}

function dateParts(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`)
  return {
    day: date.toLocaleDateString('pl-PL', { day: 'numeric' }),
    month: date.toLocaleDateString('pl-PL', { month: 'short' }),
  }
}

function UpcomingCard({ assignment }: { assignment: CalendarUiEvent }) {
  const timeDisplay = assignmentTime(assignment)
  const location = getDashboardLocationLabel(assignment)
  const parts = dateParts(assignment.dateKey)

  return (
    <Link
      to={assignment.href}
      className={`${styles.card} v3MaterialSecondaryCard v3MaterialSecondaryCardInteractive`}
      aria-label={`${assignment.assignmentTypeLabel}: ${assignment.title}`}
    >
      <div className={styles.dateCol} aria-hidden>
        <span className={styles.day}>{parts.day}</span>
        <span className={styles.month}>{parts.month}</span>
      </div>
      <div className={styles.content}>
        <div className={styles.top}>
          <span className={styles.typeChip}>{assignment.assignmentTypeLabel}</span>
          <span className={styles.countdown}>
            {dashboardAssignmentRelativeLabel(assignment.dateKey)}
          </span>
        </div>
        <h3 className={styles.name}>{assignment.title}</h3>
        {timeDisplay ? <p className={styles.time}>{timeDisplay}</p> : null}
        <p className={styles.location}>
          <IconMapPin width={13} height={13} aria-hidden />
          <span title={location.primary}>{location.primary}</span>
        </p>
      </div>
    </Link>
  )
}

export function DashboardV3UpcomingAssignments({
  assignments,
  labelledBy,
}: DashboardV3UpcomingAssignmentsProps) {
  if (assignments.length === 0) return null

  return (
    <section
      className={styles.section}
      aria-labelledby={labelledBy}
      data-testid="dashboard-v3-upcoming"
    >
      <div className={styles.grid}>
        {assignments.map((assignment) => (
          <UpcomingCard
            key={`${assignment.entityType}:${assignment.entityId}`}
            assignment={assignment}
          />
        ))}
      </div>
    </section>
  )
}
