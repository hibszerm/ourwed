import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { IconMapPin } from '@/components/icons'
import { formatDate, getDaysUntil } from '@/lib/utils/dates'
import {
  toCalendarEvent,
  UNKNOWN_TIME_LABEL,
  type CalendarUiEvent,
} from '@/features/calendar/utils/calendarEvents'
import {
  getAssignmentContextItems,
  type AssignmentContextItem,
} from '@/features/dashboard/presentation/getAssignmentContextItems'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import type { Session } from '@/types/session'
import type { Wedding } from '@/types/wedding'
import styles from './NextWeddingCard.module.css'

interface NextAssignmentCardProps {
  assignment: CalendarUiEvent | null
  /** Sessions linked to the hero wedding (for context checklist). */
  linkedSessions?: Session[]
  /** When set, CTA does not navigate via router — used by landing demo. */
  onOpen?: () => void
}

function countdownUnit(days: number, entityType: CalendarUiEvent['entityType']) {
  if (entityType === 'session') {
    return days === 1 ? 'dzień do sesji' : 'dni do sesji'
  }
  return days === 1 ? 'dzień do ślubu' : 'dni do ślubu'
}

function ContextList({ items }: { items: AssignmentContextItem[] }) {
  if (items.length === 0) {
    return <p className={styles.contextEmpty}>Wszystko na bieżąco</p>
  }

  return (
    <ul className={styles.contextList}>
      {items.map((item) => (
        <li
          key={item.id}
          className={styles.contextItem}
          data-tone={item.tone}
        >
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export function NextAssignmentCard({
  assignment,
  linkedSessions = [],
  onOpen,
}: NextAssignmentCardProps) {
  if (!assignment) {
    return (
      <section className={styles.card}>
        <p className={styles.empty}>Brak nadchodzących zleceń</p>
      </section>
    )
  }

  const days = getDaysUntil(assignment.dateKey)
  const timeDisplay =
    assignment.ceremonyTime && assignment.timeLabel !== UNKNOWN_TIME_LABEL
      ? assignment.timeLabel
      : assignment.ceremonyTime ?? null
  const contextItems = getAssignmentContextItems(assignment, linkedSessions)
  const location =
    assignment.entityType === 'wedding'
      ? getWeddingPrimaryLocationSummary(assignment.wedding).displayText
      : assignment.locationSummary

  return (
    <section className={styles.card}>
      <div className={styles.body}>
        <div className={styles.eyebrowRow}>
          <span
            className={styles.dot}
            style={{ background: assignment.packageColor }}
          />
          <span className={styles.eyebrow}>Najbliższe zlecenie</span>
          <Badge
            variant={assignment.entityType === 'wedding' ? 'info' : 'neutral'}
          >
            {assignment.assignmentTypeLabel}
          </Badge>
        </div>

        <h2 className={styles.coupleName}>{assignment.title}</h2>

        <div className={styles.meta}>
          <time className={styles.date}>{formatDate(assignment.dateKey)}</time>
          {timeDisplay ? (
            <>
              <span className={styles.metaDot}>·</span>
              <span className={styles.package}>{timeDisplay}</span>
            </>
          ) : null}
        </div>

        {location ? (
          <div className={styles.location}>
            <IconMapPin width={15} height={15} />
            <span title={location}>{location}</span>
          </div>
        ) : null}

        <div className={styles.status}>
          <ContextList items={contextItems} />
        </div>

        {onOpen ? (
          <button type="button" className={styles.cta} onClick={onOpen}>
            <span className={styles.ctaLabel}>Otwórz</span>
          </button>
        ) : (
          <Link to={assignment.href} className={styles.cta}>
            <Button variant="primary">Otwórz</Button>
          </Link>
        )}
      </div>

      <div className={styles.countdown}>
        {days === 0 ? (
          <span className={styles.today}>Dziś</span>
        ) : (
          <>
            <span className={styles.days}>{days}</span>
            <span className={styles.daysUnit}>
              {countdownUnit(days, assignment.entityType)}
            </span>
          </>
        )}
      </div>
    </section>
  )
}

/** @deprecated Prefer NextAssignmentCard — kept for landing demo compatibility. */
export function NextWeddingCard({
  wedding,
  onOpen,
}: {
  wedding: Wedding | null
  onOpen?: () => void
}) {
  return (
    <NextAssignmentCard
      assignment={wedding ? toCalendarEvent(wedding) : null}
      onOpen={onOpen}
    />
  )
}
