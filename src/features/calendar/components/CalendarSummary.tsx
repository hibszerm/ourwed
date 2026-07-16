import { coupleName, formatDate, getDaysUntil } from '@/lib/utils/dates'
import { formatCurrency } from '@/lib/utils/currency'
import {
  getMonthlyContractValue,
  getMonthlyWeddingCount,
  getNearestUpcomingWedding,
} from '@/lib/utils/weddingMetrics'
import { formatMonthTitle } from '../utils/calendarDates'
import type { Wedding } from '@/types/wedding'
import styles from './CalendarSummary.module.css'

interface CalendarSummaryProps {
  weddings: Wedding[]
  anchor: Date
}

function countdownLabel(date: string): string {
  const days = getDaysUntil(date)
  if (days === 0) return 'Dziś'
  if (days === 1) return 'Jutro'
  return `Za ${days} dni`
}

export function CalendarSummary({ weddings, anchor }: CalendarSummaryProps) {
  const nearest = getNearestUpcomingWedding(weddings)
  const monthCount = getMonthlyWeddingCount(weddings, anchor)
  const contractValue = getMonthlyContractValue(weddings, anchor)
  const monthLabel = formatMonthTitle(anchor)

  return (
    <div className={styles.summary}>
      <div className={styles.item}>
        <span className={styles.label}>Najbliższy ślub</span>
        {nearest ? (
          <>
            <p className={styles.value}>{formatDate(nearest.date)}</p>
            <p className={styles.couple}>
              {coupleName(nearest.couple.partner1, nearest.couple.partner2)}
            </p>
            <span className={styles.meta}>{countdownLabel(nearest.date)}</span>
          </>
        ) : (
          <p className={styles.value}>Brak nadchodzących ślubów</p>
        )}
      </div>

      <div className={styles.item}>
        <span className={styles.label}>Śluby</span>
        <p className={styles.month}>{monthLabel}</p>
        <p className={styles.valueLarge}>{monthCount}</p>
      </div>

      <div className={styles.item}>
        <span className={styles.label}>Wartość zleceń</span>
        <p className={styles.month}>{monthLabel}</p>
        <p className={styles.valueLarge}>{formatCurrency(contractValue)}</p>
      </div>
    </div>
  )
}
