import { useAppearance } from '@/features/appearance/useAppearance'
import type { CalendarUiEvent } from '../utils/calendarEvents'
import {
  resolveCalendarEventColors,
  resolveSessionPackageAccent,
} from '@/features/theme/calendarEventColors'
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
  const { appearance } = useAppearance()
  const colors = resolveCalendarEventColors(appearance)
  const accentColor =
    event.entityType === 'session'
      ? resolveSessionPackageAccent(appearance)
      : event.packageColor

  const subtitle =
    event.entityType === 'wedding'
      ? event.packageName || event.timeLabel
      : event.sessionTypeLabel

  return (
    <button
      type="button"
      className={`${styles.chip} ${compact ? styles.compact : ''}`}
      style={{
        background: colors.background,
        color: colors.text,
        borderColor: colors.border,
        borderLeftColor: accentColor,
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
