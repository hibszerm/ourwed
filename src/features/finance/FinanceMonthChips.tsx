import { formatCurrency } from '@/lib/utils/currency'
import type { FinanceMonthBucket } from '@/lib/finance/financeSeasonTypes'
import {
  FINANCE_MONTH_LABELS_FULL,
  FINANCE_MONTH_LABELS_SHORT,
} from '@/features/finance/financeLabels'
import styles from '@/features/finance/FinanceCenter.module.css'

interface FinanceMonthChipsProps {
  months: FinanceMonthBucket[]
  selectedMonth: number | null
  onSelectMonth: (month: number | null) => void
}

/** Desktop month filter strip — not used on mobile (chart is the control). */
export function FinanceMonthChips({
  months,
  selectedMonth,
  onSelectMonth,
}: FinanceMonthChipsProps) {
  return (
    <div
      className={styles.monthChips}
      role="group"
      aria-label="Filtr miesiąca"
      data-finance-month-chips-desktop
    >
      <button
        type="button"
        className={`${styles.monthChip} ${selectedMonth == null ? styles.monthChipActive : ''}`}
        aria-pressed={selectedMonth == null}
        onClick={() => onSelectMonth(null)}
      >
        Cały sezon
      </button>
      {months.map((m) => (
        <button
          key={m.month}
          type="button"
          className={`${styles.monthChip} ${selectedMonth === m.month ? styles.monthChipActive : ''} ${m.assignmentCount === 0 ? styles.monthChipQuiet : ''}`}
          aria-pressed={selectedMonth === m.month}
          aria-label={`${FINANCE_MONTH_LABELS_FULL[m.month - 1]}${m.assignmentCount ? `, ${m.assignmentCount}` : ''}`}
          onClick={() => onSelectMonth(m.month)}
        >
          <span>{FINANCE_MONTH_LABELS_SHORT[m.month - 1]}</span>
          {m.assignmentCount > 0 ? (
            <span className={styles.monthChipMeta}>
              {formatCurrency(m.contractValue)}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

interface FinanceMonthSelectProps {
  months: FinanceMonthBucket[]
  selectedMonth: number | null
  onSelectMonth: (month: number | null) => void
}

/** Compact mobile month control for Zlecenia (no horizontal carousel). */
export function FinanceMonthSelect({
  months,
  selectedMonth,
  onSelectMonth,
}: FinanceMonthSelectProps) {
  return (
    <label className={styles.monthSelectLabel} data-finance-month-select>
      <span className={styles.srOnly}>Miesiąc</span>
      <select
        className={styles.monthSelect}
        value={selectedMonth ?? ''}
        onChange={(e) => {
          const v = e.target.value
          onSelectMonth(v === '' ? null : Number(v))
        }}
      >
        <option value="">Cały sezon</option>
        {months.map((m) => (
          <option key={m.month} value={m.month}>
            {FINANCE_MONTH_LABELS_FULL[m.month - 1]}
            {m.assignmentCount > 0 ? ` (${m.assignmentCount})` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
