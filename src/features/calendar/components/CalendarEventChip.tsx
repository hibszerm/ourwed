import type { CalendarWeddingEvent } from '../utils/calendarEvents'
import styles from './CalendarEventChip.module.css'

interface CalendarEventChipProps {
  event: CalendarWeddingEvent
  compact?: boolean
  onClick: (event: CalendarWeddingEvent) => void
}

export function CalendarEventChip({ event, compact = false, onClick }: CalendarEventChipProps) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${compact ? styles.compact : ''}`}
      style={{
        background: event.colors.background,
        color: event.colors.text,
        borderColor: event.colors.border,
        borderLeftColor: event.packageColor,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onClick(event)
      }}
      title={`${event.coupleLabel} — ${event.statusMessage}`}
    >
      <span className={styles.name}>{event.coupleLabel}</span>
      {!compact && <span className={styles.status}>{event.statusMessage}</span>}
    </button>
  )
}
