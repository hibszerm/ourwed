import type { FinancePaymentFilter } from '@/lib/finance/financeSeasonTypes'
import type { FinanceSeasonKpis } from '@/lib/finance/financeSeasonTypes'
import styles from '@/features/finance/FinanceCenter.module.css'

interface FinanceHealthChipsProps {
  kpis: FinanceSeasonKpis
  active: FinancePaymentFilter
  onChange: (filter: FinancePaymentFilter) => void
}

export function FinanceHealthChips({
  kpis,
  active,
  onChange,
}: FinanceHealthChipsProps) {
  const items: {
    id: FinancePaymentFilter
    label: string
    shortLabel: string
    count: number
  }[] = [
    {
      id: 'all',
      label: 'Wszystkie',
      shortLabel: 'Wszystkie',
      count: kpis.assignmentCount,
    },
    {
      id: 'paid',
      label: 'Opłacone',
      shortLabel: 'Opłacone',
      count: kpis.paidCount,
    },
    {
      id: 'partial',
      label: 'Częściowo opłacone',
      shortLabel: 'Częściowo',
      count: kpis.partialCount,
    },
    {
      id: 'unpaid',
      label: 'Bez wpłat',
      shortLabel: 'Bez wpłat',
      count: kpis.unpaidCount,
    },
    {
      id: 'missing_deposit',
      label: 'Brak zaliczki',
      shortLabel: 'Brak zaliczki',
      count: kpis.missingDepositCount,
    },
  ]

  return (
    <section
      className={styles.healthSection}
      aria-label="Filtry stanu wpłat"
      data-finance-health
    >
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Stan wpłat</h2>
        <p className={styles.sectionHint}>Filtr listy zleceń</p>
      </div>
      <div className={styles.healthChips} role="group">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.healthChip} ${active === item.id ? styles.healthChipActive : ''}`}
            aria-pressed={active === item.id}
            aria-label={`${item.label}: ${item.count}`}
            onClick={() => onChange(item.id)}
          >
            <span className={styles.healthCount}>{item.count}</span>
            <span className={styles.healthLabel}>
              <span className={styles.healthLabelFull}>{item.label}</span>
              <span className={styles.healthLabelShort}>{item.shortLabel}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
