import {
  formatWeekdayShort,
  getMonthGrid,
  isSameDay,
  isSameMonth,
  toDateKey,
} from '@/features/calendar/utils/calendarDates'
import { eventsForDate, type CalendarUiEvent } from '@/features/calendar/utils/calendarEvents'
import { ModernCalendarEventChip } from '@/features/calendar/modern/ModernCalendarEventChip'
import styles from './ModernCalendarMonthView.module.css'

const WEEKDAY_HEADERS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Niedz']
const MAX_VISIBLE = 3
const PL_LOCALE = 'pl-PL'

interface ModernCalendarMonthViewProps {
  anchor: Date
  events: CalendarUiEvent[]
  onSelectEvent: (event: CalendarUiEvent) => void
  onAddAssignment?: (dateKey: string) => void
  allowCreateOnEmpty?: boolean
}

function accessibleDayLabel(day: Date): string {
  const dateLabel = day.toLocaleDateString(PL_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return `Dodaj zlecenie — ${dateLabel}`
}

export function ModernCalendarMonthView({
  anchor,
  events,
  onSelectEvent,
  onAddAssignment,
  allowCreateOnEmpty = true,
}: ModernCalendarMonthViewProps) {
  const days = getMonthGrid(anchor)
  const today = new Date()

  function openCreate(dateKey: string) {
    if (!allowCreateOnEmpty) return
    onAddAssignment?.(dateKey)
  }

  return (
    <div className={styles.month} data-testid="modern-calendar-month">
      <div className={styles.weekdays}>
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} className={styles.weekday}>
            {label}
          </div>
        ))}
      </div>

      <div className={styles.grid}>
        {days.map((day) => {
          const key = toDateKey(day)
          const dayEvents = eventsForDate(events, key)
          const outside = !isSameMonth(day, anchor)
          const isToday = isSameDay(day, today)
          const overflow = dayEvents.length - MAX_VISIBLE
          const isEmpty = dayEvents.length === 0
          const canCreate =
            isEmpty && allowCreateOnEmpty && Boolean(onAddAssignment)

          return (
            <div
              key={key}
              className={`${styles.cell} ${outside ? styles.outside : ''} ${isToday ? styles.today : ''} ${canCreate ? styles.emptyCell : ''}`}
              onClick={() => {
                if (canCreate) openCreate(key)
              }}
              onKeyDown={(e) => {
                if (canCreate && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  openCreate(key)
                }
              }}
              role={canCreate ? 'button' : undefined}
              tabIndex={canCreate ? 0 : undefined}
              aria-label={canCreate ? accessibleDayLabel(day) : undefined}
            >
              <div className={styles.dayHeader}>
                <span className={styles.dayNumber}>{day.getDate()}</span>
                <span className={styles.dayHint}>{formatWeekdayShort(day)}</span>
              </div>
              <div className={styles.events}>
                {dayEvents.slice(0, MAX_VISIBLE).map((event) => (
                  <ModernCalendarEventChip
                    key={event.id}
                    event={event}
                    compact={dayEvents.length > 2}
                    onClick={onSelectEvent}
                  />
                ))}
                {overflow > 0 && (
                  <span className={styles.more}>+{overflow} więcej</span>
                )}
                {canCreate ? (
                  <span className={styles.addHint} aria-hidden="true">
                    + Dodaj zlecenie
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
