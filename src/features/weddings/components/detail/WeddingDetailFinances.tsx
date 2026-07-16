import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { formatCurrency } from '@/lib/utils/currency'
import {
  getRemainingAmount,
  getTotalPaid,
} from '@/lib/utils/finance'
import type { Payment, PaymentType, Wedding } from '@/types/wedding'
import editStyles from '@/features/weddings/edit/WeddingEdit.module.css'
import styles from './WeddingDetailFinances.module.css'

interface WeddingDetailFinancesProps {
  wedding: Wedding
  contractPrice: number
  payments: Payment[]
  editing?: boolean
  onChangeWedding?: (patch: Partial<Wedding>) => void
  onChangePayments?: (payments: Payment[]) => void
}

const PAYMENT_TYPES: PaymentType[] = ['deposit', 'installment', 'final', 'other']

const TYPE_LABELS: Record<PaymentType, string> = {
  deposit: 'Zadatek',
  installment: 'Wpłata',
  final: 'Płatność końcowa',
  other: 'Inne',
}

export function WeddingDetailFinances({
  wedding,
  contractPrice,
  payments,
  editing = false,
  onChangeWedding,
  onChangePayments,
}: WeddingDetailFinancesProps) {
  const totalPaid = getTotalPaid(payments)
  const remaining = getRemainingAmount(contractPrice, payments)

  function updatePayment(id: string, patch: Partial<Payment>) {
    onChangePayments?.(
      payments.map((p) => {
        if (p.id !== id) return p
        const next = { ...p, ...patch }
        if (patch.paid === true && !next.paidAt) {
          next.paidAt = new Date().toISOString().slice(0, 10)
        }
        if (patch.paid === false) {
          next.paidAt = undefined
        }
        if (patch.type) next.label = TYPE_LABELS[patch.type]
        return next
      }),
    )
  }

  function removePayment(id: string) {
    onChangePayments?.(payments.filter((p) => p.id !== id))
  }

  function addPayment() {
    onChangePayments?.([
      ...payments,
      {
        id: `temp-${crypto.randomUUID()}`,
        label: TYPE_LABELS.installment,
        amount: 0,
        type: 'installment',
        paid: false,
        dueDate: '',
      },
    ])
  }

  return (
    <Card padding="md" className={styles.card}>
      <CardHeader
        title="Finanse"
        action={
          editing ? (
            <Button type="button" variant="secondary" size="sm" onClick={addPayment}>
              Dodaj wpłatę
            </Button>
          ) : undefined
        }
      />

      {editing ? (
        <div className={editStyles.fieldGrid} style={{ marginBottom: '1rem' }}>
          <Input
            label="Wartość umowy"
            type="number"
            min={0}
            step="0.01"
            value={contractPrice}
            onChange={(e) =>
              onChangeWedding?.({ price: Number(e.target.value) || 0 })
            }
          />
          <Input
            label="Zaliczka (oczekiwana)"
            type="number"
            min={0}
            step="0.01"
            value={wedding.depositAmount ?? 0}
            onChange={(e) =>
              onChangeWedding?.({
                depositAmount: Number(e.target.value) || 0,
              })
            }
          />
        </div>
      ) : null}

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
      ) : editing ? (
        <ul className={editStyles.inlineList} style={{ marginTop: '1rem' }}>
          {payments.map((payment) => (
            <li key={payment.id} className={editStyles.inlineItem}>
              <div className={editStyles.fieldRow}>
                <Select
                  label="Typ"
                  value={payment.type}
                  onChange={(e) =>
                    updatePayment(payment.id, {
                      type: e.target.value as PaymentType,
                    })
                  }
                >
                  {PAYMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Kwota"
                  type="number"
                  min={0}
                  step="0.01"
                  value={payment.amount}
                  onChange={(e) =>
                    updatePayment(payment.id, {
                      amount: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className={editStyles.fieldRow}>
                <Input
                  label="Data wpłaty"
                  type="date"
                  value={payment.paidAt ?? ''}
                  onChange={(e) =>
                    updatePayment(payment.id, {
                      paidAt: e.target.value || undefined,
                      paid: Boolean(e.target.value),
                    })
                  }
                />
                <label className={editStyles.muted} style={{ alignSelf: 'end' }}>
                  <input
                    type="checkbox"
                    checked={payment.paid}
                    onChange={(e) =>
                      updatePayment(payment.id, { paid: e.target.checked })
                    }
                  />{' '}
                  Opłacona
                </label>
              </div>
              <div className={editStyles.inlineActions}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removePayment(payment.id)}
                >
                  Usuń
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={editStyles.inlineList} style={{ marginTop: '1rem' }}>
          {payments.map((payment) => (
            <li key={payment.id} className={editStyles.muted}>
              {payment.label}: {formatCurrency(payment.amount)}
              {payment.paid
                ? ` · wpłacono ${payment.paidAt ?? ''}`
                : ' · nieopłacona'}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
