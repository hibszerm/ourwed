import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { formatCurrency } from '@/lib/utils/currency'
import {
  getRemainingAmount,
  getTotalPaid,
} from '@/lib/utils/finance'
import { weddingActionsService } from '@/lib/api/weddingActionsService'
import type { Payment, Wedding } from '@/types/wedding'
import styles from './WeddingDetailFinances.module.css'

interface WeddingDetailFinancesProps {
  wedding: Wedding
  contractPrice: number
  payments: Payment[]
  onAddPayment?: () => void
  onAddDeposit?: () => void
}

export function WeddingDetailFinances({
  wedding,
  contractPrice,
  payments,
  onAddPayment,
  onAddDeposit,
}: WeddingDetailFinancesProps) {
  const totalPaid = getTotalPaid(payments)
  const remaining = getRemainingAmount(contractPrice, payments)
  const showDeposit =
    onAddDeposit && !weddingActionsService.hasDepositPayment(wedding)

  return (
    <Card padding="md" className={styles.card}>
      <CardHeader
        title="Finanse"
        action={
          onAddPayment || showDeposit ? (
            <div className={styles.actions}>
              {showDeposit && (
                <Button type="button" variant="secondary" size="sm" onClick={onAddDeposit}>
                  Dodaj zadatek
                </Button>
              )}
              {onAddPayment && (
                <Button type="button" variant="ghost" size="sm" onClick={onAddPayment}>
                  Dodaj wpłatę
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
      <div className={styles.hero}>
        <span className={styles.heroLabel}>Wartość umowy</span>
        <span className={styles.heroValue}>{formatCurrency(contractPrice)}</span>
      </div>
      <div className={styles.split}>
        <div className={styles.stat}>
          <span className={styles.label}>Wpłacono</span>
          <span className={`${styles.value} ${styles.valuePaid}`}>
            {formatCurrency(totalPaid)}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Pozostało</span>
          <span className={`${styles.value} ${styles.valueRemaining}`}>
            {formatCurrency(remaining)}
          </span>
        </div>
      </div>
      {payments.length === 0 ? (
        <p className={styles.emptyHint}>Brak zarejestrowanych wpłat.</p>
      ) : null}
    </Card>
  )
}
