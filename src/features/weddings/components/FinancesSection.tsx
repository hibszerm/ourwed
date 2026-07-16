import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency } from '@/lib/utils/currency'
import { formatShortDate } from '@/lib/utils/dates'
import {
  getDepositPaid,
  getRemainingAmount,
} from '@/lib/utils/finance'
import type { FinanceItem, Payment } from '@/types/wedding'
import styles from './FinancesSection.module.css'

interface FinancesSectionProps {
  contractPrice: number
  payments: Payment[]
  expenses?: FinanceItem[]
}

export function FinancesSection({
  contractPrice,
  payments,
  expenses = [],
}: FinancesSectionProps) {
  const depositPaid = getDepositPaid(payments)
  const remaining = getRemainingAmount(contractPrice, payments)

  return (
    <Card>
      <CardHeader title="Płatności" />
      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Wartość umowy</span>
          <span className={styles.income}>{formatCurrency(contractPrice)}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Zaliczka wpłacona</span>
          <span className={styles.income}>{formatCurrency(depositPaid)}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Pozostało</span>
          <span className={remaining > 0 ? styles.expense : styles.income}>
            {formatCurrency(remaining)}
          </span>
        </div>
      </div>

      {payments.length > 0 && (
        <ul className={styles.list}>
          {payments.map((payment) => (
            <li key={payment.id} className={styles.item}>
              <div className={styles.info}>
                <p className={styles.label}>{payment.label}</p>
                {payment.dueDate && !payment.paid && (
                  <time className={styles.due}>Termin: {formatShortDate(payment.dueDate)}</time>
                )}
                {payment.paidAt && payment.paid && (
                  <time className={styles.due}>Wpłacono: {formatShortDate(payment.paidAt)}</time>
                )}
              </div>
              <div className={styles.right}>
                <span className={styles.income}>{formatCurrency(payment.amount)}</span>
                <Badge variant={payment.paid ? 'success' : 'warning'}>
                  {payment.paid ? 'Opłacone' : 'Oczekuje'}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}

      {expenses.length > 0 && (
        <ul className={styles.list}>
          {expenses.map((item) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.info}>
                <p className={styles.label}>{item.label}</p>
                {item.dueDate && !item.paid && (
                  <time className={styles.due}>Termin: {formatShortDate(item.dueDate)}</time>
                )}
              </div>
              <div className={styles.right}>
                <span className={styles.expense}>-{formatCurrency(item.amount)}</span>
                <Badge variant={item.paid ? 'success' : 'warning'}>
                  {item.paid ? 'Opłacone' : 'Oczekuje'}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
