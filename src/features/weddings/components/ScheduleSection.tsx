import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconClock, IconMapPin } from '@/components/icons'
import type { ScheduleEvent } from '@/types/wedding'
import styles from './ScheduleSection.module.css'

interface ScheduleSectionProps {
  events: ScheduleEvent[]
}

export function ScheduleSection({ events }: ScheduleSectionProps) {
  return (
    <Card>
      <CardHeader
        title="Harmonogram dnia"
        subtitle={
          events.length > 0 ? `${events.length} wydarzeń` : 'Brak wydarzeń'
        }
      />
      {events.length === 0 ? (
        <EmptyState
          title="Brak harmonogramu"
          description="Harmonogram pojawi się po uzupełnieniu ankiety przedślubnej."
        />
      ) : (
        <ol className={styles.timeline}>
          {events.map((event, index) => (
            <li key={event.id} className={styles.event}>
              <div className={styles.marker}>
                <span className={styles.dot} />
                {index < events.length - 1 && <span className={styles.line} />}
              </div>
              <div className={styles.content}>
                <time className={styles.time}>
                  <IconClock width={14} height={14} />
                  {event.time}
                </time>
                <p className={styles.title}>{event.title}</p>
                {event.location && (
                  <p className={styles.location}>
                    <IconMapPin width={14} height={14} />
                    {event.location}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
