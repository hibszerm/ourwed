import { Card, CardHeader } from '@/components/ui/Card'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { formatCurrency } from '@/lib/utils/currency'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingCommercialSummary.module.css'

interface WeddingCommercialSummaryProps {
  wedding: Wedding
}

/** Compact commercial truth strip — contractValue / paid / remaining. */
export function WeddingCommercialSummaryCard({
  wedding,
}: WeddingCommercialSummaryProps) {
  const c = getWeddingCommercialSummary(wedding)

  return (
    <Card padding="md" className={styles.card}>
      <CardHeader title="Podsumowanie handlowe" />
      <div className={styles.grid}>
        <div className={styles.stat}>
          <span className={styles.label}>Pakiet</span>
          <span className={styles.value}>{c.packageName || '—'}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Wartość umowy</span>
          <span className={styles.value}>{formatCurrency(c.contractValue)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Zaliczka uzgodniona</span>
          <span className={styles.value}>{formatCurrency(c.agreedDeposit)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Wpłacono</span>
          <span className={`${styles.value} ${styles.paid}`}>
            {formatCurrency(c.totalPaid)}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Pozostało do zapłaty</span>
          <span className={`${styles.value} ${styles.remaining}`}>
            {formatCurrency(c.remainingToPay)}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Po zaliczce (umowa)</span>
          <span className={styles.value}>
            {formatCurrency(c.remainingAfterDeposit)}
          </span>
        </div>
      </div>
    </Card>
  )
}
