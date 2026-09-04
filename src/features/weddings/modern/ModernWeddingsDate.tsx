import type { EditorialDateParts } from '@/features/weddings/modern/modernWeddingsModel'
import styles from './ModernWeddingsDate.module.css'

interface ModernWeddingsDateProps {
  parts: EditorialDateParts
  weekday?: boolean
  size?: 'card' | 'ledger'
}

export function ModernWeddingsDate({
  parts,
  weekday = false,
  size = 'card',
}: ModernWeddingsDateProps) {
  return (
    <time
      className={`${styles.date} ${size === 'ledger' ? styles.ledger : styles.card}`}
      dateTime={parts.dateTime}
    >
      <span className={styles.day}>{parts.day}</span>
      <span className={styles.month}>{parts.month}</span>
      {weekday ? <span className={styles.weekday}>{parts.weekday}</span> : null}
    </time>
  )
}
