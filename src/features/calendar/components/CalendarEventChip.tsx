import type { CalendarUiEvent } from '../utils/calendarEvents'
import styles from './CalendarEventChip.module.css'

interface CalendarEventChipProps {
  event: CalendarUiEvent
  compact?: boolean
  onClick: (event: CalendarUiEvent) => void
}

export function CalendarEventChip({
  event,
  compact = false,
  onClick,
}: CalendarEventChipProps) {
  const subtitle =
    event.entityType === 'wedding'
      ? event.packageName || event.timeLabel
      : event.sessionTypeLabel

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
      title={`${event.title} — ${subtitle}`}
    >
      <span className={styles.name}>{event.title}</span>
      {!compact && <span className={styles.status}>{subtitle}</span>}
    </button>
  )
}
