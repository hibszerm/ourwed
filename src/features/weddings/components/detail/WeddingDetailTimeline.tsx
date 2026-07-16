import { Card, CardHeader } from '@/components/ui/Card'
import {
  IconCheck,
  IconClock,
  IconFinances,
  IconMail,
  IconTasks,
  IconWeddings,
} from '@/components/icons'
import { formatShortDate } from '@/lib/utils/dates'
import type { WeddingTimelineEntry, WeddingTimelineEntryType } from '@/types/wedding'
import styles from './WeddingDetailTimeline.module.css'

interface WeddingDetailTimelineProps {
  entries: WeddingTimelineEntry[]
}

function TimelineIcon({ type }: { type: WeddingTimelineEntryType }) {
  const props = { width: 12, height: 12 }

  switch (type) {
    case 'created':
      return <IconWeddings {...props} />
    case 'questionnaire_sent':
      return <IconMail {...props} />
    case 'questionnaire_completed':
      return <IconCheck {...props} />
    case 'contract_generated':
    case 'contract_signed':
      return <IconTasks {...props} />
    case 'payment_received':
      return <IconFinances {...props} />
    case 'note_added':
      return <IconTasks {...props} />
    case 'wedding_day':
      return <IconWeddings {...props} />
    case 'deliverable':
      return <IconCheck {...props} />
    default:
      return <IconClock {...props} />
  }
}

export function WeddingDetailTimeline({ entries }: WeddingDetailTimelineProps) {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )

  return (
    <Card padding="md" className={styles.card}>
      <CardHeader title="Historia zlecenia" subtitle={`${sorted.length} wpisów`} />
      {sorted.length === 0 ? (
        <p className={styles.empty}>Brak wpisów w historii zlecenia.</p>
      ) : (
        <ol className={styles.timeline}>
          {sorted.map((entry, index) => (
            <li key={entry.id} className={styles.item}>
              <div className={styles.marker}>
                <span className={styles.icon}>
                  <TimelineIcon type={entry.type} />
                </span>
                {index < sorted.length - 1 && <span className={styles.line} />}
              </div>
              <div className={styles.content}>
                <div className={styles.header}>
                  <p className={styles.title}>{entry.title}</p>
                  <time className={styles.date}>{formatShortDate(entry.date)}</time>
                </div>
                {entry.description && (
                  <p className={styles.description}>{entry.description}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
