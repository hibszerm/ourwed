import { Card, CardHeader } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { IconCheck } from '@/components/icons'
import type { WeddingDeliverable } from '@/types/wedding'
import styles from './DeliverablesSection.module.css'

interface DeliverablesSectionProps {
  deliverables: WeddingDeliverable[]
}

export function DeliverablesSection({ deliverables }: DeliverablesSectionProps) {
  const completed = deliverables.filter((d) => d.completed).length
  const subtitle =
    deliverables.length > 0
      ? `${completed} z ${deliverables.length} oddanych`
      : 'Brak materiałów'

  return (
    <Card>
      <CardHeader title="Materiały do oddania" subtitle={subtitle} />
      {deliverables.length > 0 && (
        <ProgressBar value={completed} max={deliverables.length} />
      )}
      {deliverables.length === 0 ? (
        <p className={styles.empty}>Brak materiałów przypisanych do tego ślubu.</p>
      ) : (
        <ul className={styles.list}>
          {deliverables.map((item) => (
            <li key={item.id} className={styles.item}>
              <span className={`${styles.checkbox} ${item.completed ? styles.checked : ''}`}>
                {item.completed && <IconCheck width={12} height={12} />}
              </span>
              <span className={item.completed ? styles.done : styles.label}>{item.name}</span>
              {item.source === 'additional' && (
                <span className={styles.badge}>Dodatkowa usługa</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
