import type { FinanceKindFilter } from '@/lib/finance/financeSeasonTypes'
import styles from '@/features/finance/FinanceCenter.module.css'

interface FinanceKindFilterProps {
  active: FinanceKindFilter
  onChange: (filter: FinanceKindFilter) => void
  counts: { all: number; wedding: number; session: number }
}

export function FinanceKindChips({
  active,
  onChange,
  counts,
}: FinanceKindFilterProps) {
  const items: { id: FinanceKindFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Wszystkie', count: counts.all },
    { id: 'wedding', label: 'Śluby', count: counts.wedding },
    { id: 'session', label: 'Sesje', count: counts.session },
  ]

  return (
    <div
      className={styles.kindChips}
      role="group"
      aria-label="Typ zlecenia"
      data-finance-kind-filter
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`${styles.kindChip} ${active === item.id ? styles.kindChipActive : ''}`}
          aria-pressed={active === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          <span className={styles.kindChipCount}>{item.count}</span>
        </button>
      ))}
    </div>
  )
}
