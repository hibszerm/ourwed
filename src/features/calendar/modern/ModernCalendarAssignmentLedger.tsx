import { Link } from 'react-router-dom'
import {
  formatLedgerFullDate,
  getEditorialDateParts,
} from '@/features/weddings/modern/modernWeddingsModel'
import {
  getModernCalendarSupportingLine,
  getModernCalendarValueLabel,
} from '@/features/calendar/modern/modernCalendarModel'
import type { CalendarUiEvent } from '@/features/calendar/utils/calendarEvents'
import styles from './ModernCalendarAssignmentLedger.module.css'

interface ModernCalendarAssignmentLedgerProps {
  events: CalendarUiEvent[]
}

function LedgerDate({ date }: { date: string }) {
  const parts = getEditorialDateParts(date)
  if (!parts) return null
  const month = parts.month.replace(/\./g, '').trim()
  const year = parts.dateTime.slice(0, 4)
  return (
    <time
      className={styles.date}
      dateTime={parts.dateTime}
      aria-label={formatLedgerFullDate(parts)}
    >
      <span className={styles.dateDay}>{parts.day}</span>
      <span className={styles.dateMonth}>{month}</span>
      <span className={styles.dateYear}>{year}</span>
    </time>
  )
}

function ModernCalendarAssignmentLedgerRow({
  event,
}: {
  event: CalendarUiEvent
}) {
  const value = getModernCalendarValueLabel(event)
  const meta = getModernCalendarSupportingLine(event)
  const openLabel =
    event.entityType === 'wedding'
      ? `Otwórz ślub: ${event.title}`
      : `Otwórz sesję: ${event.title}`

  return (
    <li className={styles.item}>
      <Link to={event.href} className={styles.row} aria-label={openLabel}>
        <div className={styles.dateCol}>
          <LedgerDate date={event.dateKey} />
        </div>

        <div className={styles.booking}>
          <span className={styles.name}>{event.title}</span>
          {meta ? <span className={styles.meta}>{meta}</span> : null}
        </div>

        {value ? (
          <span className={styles.value}>{value}</span>
        ) : (
          <span className={styles.valueEmpty} />
        )}
      </Link>
    </li>
  )
}

export function ModernCalendarAssignmentLedger({
  events,
}: ModernCalendarAssignmentLedgerProps) {
  return (
    <ul className={styles.list} data-testid="modern-calendar-list">
      {events.map((event) => (
        <ModernCalendarAssignmentLedgerRow key={event.id} event={event} />
      ))}
    </ul>
  )
}
