import { useNavigate } from 'react-router-dom'
import {
  formatWeekdayShort,
  getMonthGrid,
  isSameDay,
  isSameMonth,
  toDateKey,
} from '../utils/calendarDates'
import { eventsForDate, type CalendarWeddingEvent } from '../utils/calendarEvents'
import { CalendarEventChip } from './CalendarEventChip'
import styles from './CalendarMonthView.module.css'

const WEEKDAY_HEADERS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Niedz']
const MAX_VISIBLE = 3

interface CalendarMonthViewProps {
  anchor: Date
  events: CalendarWeddingEvent[]
  onSelectEvent: (event: CalendarWeddingEvent) => void
}

export function CalendarMonthView({ anchor, events, onSelectEvent }: CalendarMonthViewProps) {
  const navigate = useNavigate()
  const days = getMonthGrid(anchor)
  const today = new Date()

  function openNewWedding(dateKey: string) {
    navigate(`/sluby/nowy?date=${dateKey}`)
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

          return (
            <div
              key={key}
              className={`${styles.cell} ${outside ? styles.outside : ''} ${isToday ? styles.today : ''} ${isEmpty ? styles.emptyCell : ''}`}
              onClick={() => {
                if (isEmpty) openNewWedding(key)
              }}
              onKeyDown={(e) => {
                if (isEmpty && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  openNewWedding(key)
                }
              }}
              role={isEmpty ? 'button' : undefined}
              tabIndex={isEmpty ? 0 : undefined}
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
                {isEmpty && (
                  <span className={styles.addHint}>+ Dodaj zlecenie</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
