import { Link } from 'react-router-dom'
import { ModernWeddingsDate } from '@/features/weddings/modern/ModernWeddingsDate'
import {
  getEditorialDateParts,
} from '@/features/weddings/modern/modernWeddingsModel'
import {
  getModernCalendarLocationSlot,
  getModernCalendarTypeSlot,
  getModernCalendarValueLabel,
} from '@/features/calendar/modern/modernCalendarModel'
import type { CalendarUiEvent } from '@/features/calendar/utils/calendarEvents'
import styles from './ModernCalendarAssignmentCard.module.css'

interface ModernCalendarAssignmentCardProps {
  event: CalendarUiEvent
}

export function ModernCalendarAssignmentCard({
  event,
}: ModernCalendarAssignmentCardProps) {
  const location = getModernCalendarLocationSlot(event)
  const typeSlot = getModernCalendarTypeSlot(event)
  const value = getModernCalendarValueLabel(event)
  const dateParts = getEditorialDateParts(event.dateKey)
  const openLabel =
    event.entityType === 'wedding'
      ? `Otwórz ślub: ${event.title}`
      : `Otwórz sesję: ${event.title}`

  return (
    <Link
      to={event.href}
      className={`${styles.card} v3MaterialSecondaryCard`}
      aria-label={openLabel}
    >
      {dateParts ? (
        <ModernWeddingsDate parts={dateParts} weekday size="card" />
      ) : null}

      <div className={styles.body}>
        <div className={styles.couple}>
          <h3 className={styles.name}>{event.title}</h3>
        </div>
        <div className={styles.locationSlot}>
          {location ? <p className={styles.location}>{location}</p> : null}
        </div>
        <div className={styles.packageSlot}>
          {typeSlot ? <p className={styles.package}>{typeSlot}</p> : null}
        </div>
        <div className={styles.value}>
          {value ? (
            <>
              <span className={styles.valueLabel}>Wartość</span>
              <span className={styles.valueAmount}>{value}</span>
            </>
          ) : null}
        </div>
      </div>
    </Link>
  )
}
