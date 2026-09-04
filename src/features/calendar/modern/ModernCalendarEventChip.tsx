import type { CalendarUiEvent } from '@/features/calendar/utils/calendarEvents'
import { getModernCalendarTypeSlot } from '@/features/calendar/modern/modernCalendarModel'
import styles from './ModernCalendarEventChip.module.css'

interface ModernCalendarEventChipProps {
  event: CalendarUiEvent
  compact?: boolean
  onClick: (event: CalendarUiEvent) => void
}

export function ModernCalendarEventChip({
  event,
  compact = false,
  onClick,
}: ModernCalendarEventChipProps) {
  const subtitle = getModernCalendarTypeSlot(event)

  return (
    <button
      type="button"
      className={`${styles.chip} ${compact ? styles.compact : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onClick(event)
      }}
      title={subtitle ? `${event.title} — ${subtitle}` : event.title}
    >
      <span className={styles.name}>{event.title}</span>
      {!compact && subtitle ? (
        <span className={styles.meta}>{subtitle}</span>
      ) : null}
    </button>
  )
}
