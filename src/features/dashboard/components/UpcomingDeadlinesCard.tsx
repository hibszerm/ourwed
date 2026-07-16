import { Link } from 'react-router-dom'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatShortDate, getDaysUntil } from '@/lib/utils/dates'
import type { Deadline } from '@/types/wedding'
import styles from './UpcomingDeadlinesCard.module.css'

const typeLabels = {
  payment: 'Płatność',
  meeting: 'Spotkanie',
  delivery: 'Dostawa',
  other: 'Inne',
}

const typeVariant = {
  payment: 'warning' as const,
  meeting: 'info' as const,
  delivery: 'neutral' as const,
  other: 'neutral' as const,
}

interface UpcomingDeadlinesCardProps {
  deadlines: Deadline[]
}

export function UpcomingDeadlinesCard({ deadlines }: UpcomingDeadlinesCardProps) {
  return (
    <Card>
      <CardHeader title="Nadchodzące terminy" />
      {deadlines.length === 0 ? (
        <p className={styles.empty}>Brak nadchodzących terminów</p>
      ) : (
        <ul className={styles.list}>
          {deadlines.map((deadline) => {
            const days = getDaysUntil(deadline.date)
            return (
              <li key={deadline.id} className={styles.item}>
                <Link to={`/sluby/${deadline.weddingId}`} className={styles.link}>
                  <div className={styles.info}>
                    <p className={styles.title}>{deadline.title}</p>
                    <div className={styles.meta}>
                      <Badge variant={typeVariant[deadline.type]}>
                        {typeLabels[deadline.type]}
                      </Badge>
                      <time className={styles.date}>{formatShortDate(deadline.date)}</time>
                    </div>
                  </div>
                  <span className={`${styles.days} ${days <= 7 ? styles.urgent : ''}`}>
                    {days === 0 ? 'Dziś' : days === 1 ? 'Jutro' : `${days} dni`}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
