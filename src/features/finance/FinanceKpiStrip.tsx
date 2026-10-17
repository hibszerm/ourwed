import { formatCurrency } from '@/lib/utils/currency'
import type { FinanceKindFilter } from '@/lib/finance/financeSeasonTypes'
import type { FinanceSeasonKpis } from '@/lib/finance/financeSeasonTypes'
import { AnimatedCurrencyValue } from '@/features/finance/AnimatedCurrencyValue'
import {
  FINANCE_KPI_DEPOSITS_LABEL,
  getFinanceSecondarySummaryParts,
} from '@/features/finance/financeLabels'
import { FINANCE_KPI_COUNT_DELAYS_MS } from '@/features/finance/financeMotion'
import type { FinanceRevealPhase } from '@/features/finance/useFinanceEntranceReveal'
import styles from '@/features/finance/FinanceCenter.module.css'

interface FinanceKpiStripProps {
  kpis: FinanceSeasonKpis
  empty: boolean
  kindFilter?: FinanceKindFilter
  reveal?: FinanceRevealPhase
}

export function FinanceKpiStrip({
  kpis,
  empty,
  kindFilter = 'all',
  reveal = 'done',
}: FinanceKpiStripProps) {
  if (empty) return null

  const items = [
    {
      key: 'personal',
      label: 'Wartość zleceń dla mnie',
      amount: kpis.personalValue ?? kpis.contractValue,
    },
    { key: 'paid', label: 'Wpłacono · otrzymano dla mnie', amount: kpis.personalReceived ?? kpis.totalPaid },
    {
      key: 'remain',
      label: 'Pozostało · saldo dla mnie',
      amount: kpis.personalBalance ?? kpis.remaining,
    },
    { key: 'deposits', label: FINANCE_KPI_DEPOSITS_LABEL, amount: kpis.depositsReceived },
  ]

  const secondary = getFinanceSecondarySummaryParts({
    kindFilter,
    assignmentCount: kpis.assignmentCount,
    weddingCount: kpis.weddingCount,
    sessionCount: kpis.sessionCount,
    averageContractValue: kpis.averagePersonalValue !== undefined
      ? kpis.averagePersonalValue
      : kpis.averageContractValue,
    formatMoney: formatCurrency,
  })

  return (
    <section className={styles.kpiSection} aria-label="Podsumowanie sezonu">
      <div className={styles.kpiStrip}>
        {items.map((item, index) => (
          <div key={item.key} className={styles.kpiCard}>
            <p className={styles.kpiLabel}>{item.label}</p>
            <p className={styles.kpiValue}>
              {item.key === 'personal' && (kpis.personalValueKnownCount ?? 0) === 0
                ? 'Nieustalona'
                : <AnimatedCurrencyValue
                    value={item.amount}
                    reveal={reveal}
                    delayMs={FINANCE_KPI_COUNT_DELAYS_MS[index] ?? 0}
                  />}
            </p>
          </div>
        ))}
      </div>
      <p className={styles.kpiSecondary}>
        <span className={styles.kpiSecondaryCluster}>
          {secondary.metrics.map((metric, index) => (
            <span key={metric} className={styles.kpiSecondaryMetric}>
              {index > 0 ? (
                <span className={styles.kpiSecondaryDot} aria-hidden="true">
                  ·
                </span>
              ) : null}
              {metric}
            </span>
          ))}
        </span>
        {secondary.average != null ? (
          <span className={styles.kpiSecondaryAverage}>{secondary.average}</span>
        ) : null}
        {(kpis.personalValueKnownCount ?? 0) < kpis.assignmentCount ? (
          <span>{kpis.assignmentCount - (kpis.personalValueKnownCount ?? 0)} zleceń z nieustaloną wartością osobistą</span>
        ) : null}
      </p>
    </section>
  )
}
