import { Link } from 'react-router-dom'
import { IconMapPin } from '@/components/icons'
import {
  UNKNOWN_TIME_LABEL,
  type CalendarUiEvent,
} from '@/features/calendar/utils/calendarEvents'
import { getDashboardLocationLabel } from '@/features/dashboard/presentation/getDashboardLocationLabel'
import { getDaysUntil } from '@/lib/utils/dates'
import { dashboardAssignmentRelativeLabel } from './dashboardV3AssignmentPresentation'
import styles from './DashboardV3Hero.module.css'

interface DashboardV3HeroProps {
  assignment: CalendarUiEvent | null
}

function countdownCopy(
  days: number,
  entityType: CalendarUiEvent['entityType'],
) {
  const caption = entityType === 'session' ? 'do sesji' : 'do ślubu'
  if (days === 0) {
    return { value: 'Dziś', unit: null, caption: null }
  }
  return {
    value: String(days),
    unit: days === 1 ? 'dzień' : 'dni',
    caption,
  }
}

function heroDateParts(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`)
  return {
    day: date.toLocaleDateString('pl-PL', { day: 'numeric' }),
    month: date.toLocaleDateString('pl-PL', { month: 'short' }),
    weekday: date.toLocaleDateString('pl-PL', { weekday: 'long' }),
  }
}

function assignmentTime(assignment: CalendarUiEvent): string | null {
  if (assignment.ceremonyTime && assignment.timeLabel !== UNKNOWN_TIME_LABEL) {
    return assignment.timeLabel
  }
  return assignment.ceremonyTime ?? null
}

export function DashboardV3Hero({ assignment }: DashboardV3HeroProps) {
  if (!assignment) {
    return (
      <section
        id="dashboard-v3-nearest-assignment"
        className={`${styles.hero} ${styles.emptyHero} v3MaterialHero`}
        data-testid="dashboard-v3-hero"
      >
        <p className={styles.empty}>Brak nadchodzących zleceń</p>
      </section>
    )
  }

  const days = getDaysUntil(assignment.dateKey)
  const timeDisplay = assignmentTime(assignment)
  const location = getDashboardLocationLabel(assignment)
  const dateParts = heroDateParts(assignment.dateKey)
  const countdown = countdownCopy(days, assignment.entityType)
  const mobileRelative = dashboardAssignmentRelativeLabel(assignment.dateKey)

  return (
    <section
      id="dashboard-v3-nearest-assignment"
      className={`${styles.hero} v3MaterialHero`}
      data-testid="dashboard-v3-hero"
      aria-labelledby="dashboard-v3-hero-name"
    >
      <Link
        to={assignment.href}
        className={styles.heroLink}
        aria-label={`${assignment.assignmentTypeLabel}: ${assignment.title}`}
      />
      <div className={styles.dateBlock} aria-hidden>
        <span className={styles.dateDay}>{dateParts.day}</span>
        <span className={styles.dateMonth}>{dateParts.month}</span>
        <span className={styles.dateWeek}>{dateParts.weekday}</span>
      </div>

      <div className={styles.body}>
        <p className={styles.eyebrow}>Najbliższe zlecenie</p>
        <div className={styles.identity}>
          <div className={styles.typeRow}>
            <span className={`${styles.typeChip} v3MaterialOverlay`}>
              {assignment.assignmentTypeLabel}
            </span>
          </div>
          <h2 id="dashboard-v3-hero-name" className={styles.name}>
            {assignment.title}
          </h2>
        </div>

        <div className={styles.chips}>
          {timeDisplay ? (
            <span className={`${styles.chip} ${styles.timeChip} v3MaterialOverlay`}>
              {timeDisplay}
            </span>
          ) : null}
          <span
            className={`${styles.chip} ${styles.locationChip} v3MaterialOverlay`}
            title={location.primary}
          >
            <IconMapPin width={13} height={13} aria-hidden />
            <span>{location.primary}</span>
          </span>
        </div>

        <Link
          to={assignment.href}
          className={styles.cta}
          aria-label={`Otwórz ${assignment.title}`}
        >
          Otwórz
        </Link>
      </div>

      <div
        className={`${styles.countdown}${days === 0 ? ` ${styles.countdownToday}` : ''}`}
        aria-label={`Odliczanie: ${mobileRelative}`}
      >
        <span className={styles.countdownDesktop}>
          <span className={styles.dateDay}>{countdown.value}</span>
          {countdown.unit ? (
            <span className={styles.dateMonth}>{countdown.unit}</span>
          ) : null}
          {countdown.caption ? (
            <span className={styles.dateWeek}>{countdown.caption}</span>
          ) : null}
        </span>
        <span className={styles.countdownMobile}>{mobileRelative}</span>
      </div>
    </section>
  )
}
