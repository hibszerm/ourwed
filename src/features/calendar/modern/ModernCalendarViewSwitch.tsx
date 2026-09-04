import type { CalendarCollectionViewMode } from '@/features/calendar/modern/calendarViewMode'
import styles from './ModernCalendarViewSwitch.module.css'

interface ModernCalendarViewSwitchProps {
  value: CalendarCollectionViewMode
  onChange: (mode: CalendarCollectionViewMode) => void
}

export function ModernCalendarViewSwitch({
  value,
  onChange,
}: ModernCalendarViewSwitchProps) {
  return (
    <div
      className={styles.wrap}
      role="group"
      aria-label="Sposób wyświetlania zleceń"
      data-testid="modern-calendar-view-switch"
    >
      <button
        type="button"
        className={value === 'grid' ? styles.active : styles.tab}
        aria-pressed={value === 'grid'}
        aria-label="Kafelki"
        onClick={() => onChange('grid')}
      >
        Kafelki
      </button>
      <button
        type="button"
        className={value === 'list' ? styles.active : styles.tab}
        aria-pressed={value === 'list'}
        aria-label="Lista"
        onClick={() => onChange('list')}
      >
        Lista
      </button>
    </div>
  )
}
