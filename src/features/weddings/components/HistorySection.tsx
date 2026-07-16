import { Card, CardHeader } from '@/components/ui/Card'
import { formatShortDate } from '@/lib/utils/dates'
import { WORKFLOW_STAGE_LABELS } from '@/lib/utils/workflow'
import type { WorkflowStage } from '@/types/wedding'
import styles from './HistorySection.module.css'

interface HistoryEvent {
  id: string
  label: string
  date: string
  stage?: WorkflowStage
}

interface HistorySectionProps {
  events: HistoryEvent[]
}

export function HistorySection({ events }: HistorySectionProps) {
  return (
    <Card>
      <CardHeader title="Historia" subtitle="Oś czasu projektu" />
      {events.length === 0 ? (
        <p className={styles.empty}>Brak zapisanej historii.</p>
      ) : (
        <ul className={styles.list}>
          {events.map((event) => (
            <li key={event.id} className={styles.item}>
              <span className={styles.dot} />
              <div className={styles.content}>
                <p className={styles.label}>{event.label}</p>
                {event.stage && (
                  <span className={styles.stage}>{WORKFLOW_STAGE_LABELS[event.stage]}</span>
                )}
              </div>
              <time className={styles.date}>{formatShortDate(event.date)}</time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
