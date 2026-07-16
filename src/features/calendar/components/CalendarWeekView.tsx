import {
  formatHourLabel,
  getWeekDays,
  isSameDay,
  toDateKey,
} from '../utils/calendarDates'
import {
  eventsForDate,
  getEventPositionPercent,
  getWeekHourSlots,
  type CalendarWeddingEvent,
} from '../utils/calendarEvents'
import styles from './CalendarWeekView.module.css'

interface CalendarWeekViewProps {
  anchor: Date
  events: CalendarWeddingEvent[]
  onSelectEvent: (event: CalendarWeddingEvent) => void
}

export function CalendarWeekView({ anchor, events, onSelectEvent }: CalendarWeekViewProps) {
  const days = getWeekDays(anchor)
  const hours = getWeekHourSlots()
  const today = new Date()

  return (
    <div className={styles.week}>
      <div className={styles.header}>
        <div className={styles.gutter} />
        {days.map((day) => {
          const isToday = isSameDay(day, today)
          return (
            <div key={toDateKey(day)} className={`${styles.dayHead} ${isToday ? styles.todayHead : ''}`}>
              <span className={styles.weekday}>
                {day.toLocaleDateString('pl-PL', { weekday: 'short' })}
              </span>
              <span className={styles.dayNum}>{day.getDate()}</span>
            </div>
          )
        })}
      </div>

      <div className={styles.allDayRow}>
        <div className={styles.gutterLabel}>Cały dzień</div>
        {days.map((day) => {
          const key = toDateKey(day)
          const unknown = eventsForDate(events, key).filter((e) => !e.ceremonyTime)
          return (
            <div key={key} className={styles.allDayCell}>
              {unknown.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className={styles.allDayEvent}
                  style={{
                    background: event.colors.background,
                    color: event.colors.text,
                    borderColor: event.colors.border,
                  }}
                  onClick={() => onSelectEvent(event)}
                >
                  {event.coupleLabel}
                </button>
              ))}
            </div>
          )
        })}
      </div>

      <div className={styles.timeline}>
        <div className={styles.hours}>
          {hours.map((hour) => (
            <div key={hour} className={styles.hourLabel}>
              {formatHourLabel(hour)}
            </div>
          ))}
        </div>

        <div className={styles.columns}>
          {days.map((day) => {
            const key = toDateKey(day)
            const timed = eventsForDate(events, key).filter((e) => e.ceremonyTime)
            return (
              <div key={key} className={styles.column}>
                {hours.map((hour) => (
                  <div key={hour} className={styles.slot} />
                ))}
                {timed.map((event) => {
                  const pos = getEventPositionPercent(event.ceremonyTime!)
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className={styles.block}
                      style={{
                        top: `${pos.top}%`,
                        height: `${pos.height}%`,
                        background: event.colors.background,
                        color: event.colors.text,
                        borderColor: event.colors.border,
                        borderLeftColor: event.packageColor,
                      }}
                      onClick={() => onSelectEvent(event)}
                    >
                      <span className={styles.blockTime}>{event.ceremonyTime}</span>
                      <span className={styles.blockName}>{event.coupleLabel}</span>
                      <span className={styles.blockLoc}>{event.ceremonyLocation}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
