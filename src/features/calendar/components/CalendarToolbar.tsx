import { Button } from '@/components/ui/Button'
import { formatMonthTitle, formatWeekTitle } from '../utils/calendarDates'
import styles from './CalendarToolbar.module.css'

export type CalendarViewMode = 'month' | 'week'

interface CalendarToolbarProps {
  view: CalendarViewMode
  anchor: Date
  onViewChange: (view: CalendarViewMode) => void
  onToday: () => void
  onPrev: () => void
  onNext: () => void
}

export function CalendarToolbar({
  view,
  anchor,
  onViewChange,
  onToday,
  onPrev,
  onNext,
}: CalendarToolbarProps) {
  const title = view === 'month' ? formatMonthTitle(anchor) : formatWeekTitle(anchor)

  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        <Button type="button" variant="secondary" size="sm" onClick={onToday}>
          Dziś
        </Button>
        <div className={styles.nav}>
          <Button type="button" variant="ghost" size="sm" onClick={onPrev} aria-label="Poprzedni">
            ‹
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onNext} aria-label="Następny">
            ›
          </Button>
        </div>
        <h2 className={styles.title}>{title}</h2>
      </div>

      <div className={styles.views} role="group" aria-label="Widok kalendarza">
        <button
          type="button"
          className={`${styles.viewBtn} ${view === 'month' ? styles.active : ''}`}
          onClick={() => onViewChange('month')}
        >
          Miesiąc
        </button>
        <button
          type="button"
          className={`${styles.viewBtn} ${view === 'week' ? styles.active : ''}`}
          onClick={() => onViewChange('week')}
        >
          Tydzień
        </button>
      </div>
    </div>
  )
}
