import {
  formatWeekdayShort,
  getMonthGrid,
  isSameDay,
  isSameMonth,
  toDateKey,
} from '../utils/calendarDates'
import { eventsForDate, type CalendarUiEvent } from '../utils/calendarEvents'
import { CalendarEventChip } from './CalendarEventChip'
import styles from './CalendarMonthView.module.css'

const WEEKDAY_HEADERS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Niedz']
const MAX_VISIBLE = 3

interface CalendarMonthViewProps {
  anchor: Date
  events: CalendarUiEvent[]
  onSelectEvent: (event: CalendarUiEvent) => void
  /** Opens assignment chooser for empty day (generic “Dodaj zlecenie”). */
  onAddAssignment?: (dateKey: string) => void
  /** When false, empty days do not open create (landing demo). */
  allowCreateOnEmpty?: boolean
}

export function CalendarMonthView({
  anchor,
  events,
  onSelectEvent,
  onAddAssignment,
  allowCreateOnEmpty = true,
}: CalendarMonthViewProps) {
  const days = getMonthGrid(anchor)
  const today = new Date()

  function openCreate(dateKey: string) {
    if (!allowCreateOnEmpty) return
    onAddAssignment?.(dateKey)
  }

  return (
    <div className={styles.month}>
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
          const canCreate = isEmpty && allowCreateOnEmpty && Boolean(onAddAssignment)

          return (
            <div
              key={key}
              className={`${styles.cell} ${outside ? styles.outside : ''} ${isToday ? styles.today : ''} ${isEmpty ? styles.emptyCell : ''}`}
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
            >
              <div className={styles.dayHeader}>
                <span className={styles.dayNumber}>{day.getDate()}</span>
                <span className={styles.dayHint}>{formatWeekdayShort(day)}</span>
              </div>
              <div className={styles.events}>
                {dayEvents.slice(0, MAX_VISIBLE).map((event) => (
                  <CalendarEventChip
                    key={event.id}
                    event={event}
                    compact={dayEvents.length > 2}
                    onClick={onSelectEvent}
                  />
                ))}
                {overflow > 0 && (
                  <span className={styles.more}>+{overflow} więcej</span>
                )}
                {isEmpty && allowCreateOnEmpty ? (
                  <span className={styles.addHint}>+ Dodaj zlecenie</span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
