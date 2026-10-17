import type {
  FinanceKindFilter,
  FinanceMonthBucket,
  FinanceSeasonKpis,
} from '@/lib/finance/financeSeasonTypes'
import { formatCurrency } from '@/lib/utils/currency'
import { AnimatedCurrencyValue } from '@/features/finance/AnimatedCurrencyValue'
import {
  FINANCE_MONTH_LABELS_FULL,
  formatFinanceAssignmentCount,
  formatFinanceSessionCount,
  formatFinanceWeddingCount,
} from '@/features/finance/financeLabels'
import {
  FINANCE_COUNT_MS,
  FINANCE_SUMMARY_COUNT_DELAYS_MS,
} from '@/features/finance/financeMotion'
import type { FinanceRevealPhase } from '@/features/finance/useFinanceEntranceReveal'
import styles from '@/features/finance/FinanceCenter.module.css'

interface FinanceSummaryPanelProps {
  seasonYear: number
  kpis: FinanceSeasonKpis
  months: FinanceMonthBucket[]
  selectedMonth: number | null
  kindFilter?: FinanceKindFilter
  reveal?: FinanceRevealPhase
}

/** Desktop analytics rail — season or selected-month summary from existing model. */
export function FinanceSummaryPanel({
  seasonYear,
  kpis,
  months,
  selectedMonth,
  kindFilter = 'all',
  reveal = 'done',
}: FinanceSummaryPanelProps) {
  const month =
    selectedMonth != null
      ? (months.find((m) => m.month === selectedMonth) ?? null)
      : null

  const title = month
    ? `${FINANCE_MONTH_LABELS_FULL[month.month - 1]} ${seasonYear}`
    : `Sezon ${seasonYear}`

  const count = month ? month.assignmentCount : kpis.assignmentCount
  const countLabel =
    kindFilter === 'wedding'
      ? formatFinanceWeddingCount(
          month ? month.assignmentCount : kpis.weddingCount,
        )
      : kindFilter === 'session'
        ? formatFinanceSessionCount(
            month ? month.assignmentCount : kpis.sessionCount,
          )
        : formatFinanceAssignmentCount(count)
  const personalValue = month ? month.personalValue ?? 0 : kpis.personalValue ?? kpis.contractValue
  const personalValueKnownCount = month
    ? month.personalValueKnownCount ?? 0
    : kpis.personalValueKnownCount ?? 0
  const personalReceived = month ? month.personalReceived ?? 0 : kpis.personalReceived ?? kpis.totalPaid
  const personalBalance = month ? month.personalBalance : kpis.personalBalance

  /* Count-up only on page entrance while season summary is showing. */
  const animateEntrance = reveal === 'prep' || reveal === 'play'
  const metricReveal: FinanceRevealPhase =
    selectedMonth != null ? 'done' : animateEntrance ? reveal : 'done'

  return (
    <aside
      className={styles.summaryPanel}
      data-finance-summary-panel
      aria-label={month ? 'Podsumowanie miesiąca' : 'Podsumowanie sezonu'}
    >
      <div className={styles.summaryHead}>
        <h2 className={styles.summaryTitle}>{title}</h2>
      </div>
      <p className={styles.summaryCount}>{countLabel}</p>
      {personalValueKnownCount < count ? (
        <p className={styles.summaryCount}>
          {count - personalValueKnownCount} zleceń bez ustalonej wartości osobistej
        </p>
      ) : null}

      <dl className={styles.summaryMetrics}>
        <div className={styles.summaryMetricPrimary}>
          <dt>Wartość dla mnie</dt>
          <dd>{personalValueKnownCount === 0 ? 'Nieustalona' : (
            <AnimatedCurrencyValue
              value={personalValue}
              reveal={metricReveal}
              delayMs={FINANCE_SUMMARY_COUNT_DELAYS_MS.primary}
              durationMs={FINANCE_COUNT_MS}
            />
          )}</dd>
        </div>
        <div className={styles.summaryMetricSecondary}>
          <dt>Wartość umów</dt>
          <dd>{formatCurrency(month ? month.contractValue : kpis.contractValue)}</dd>
        </div>
        <div className={styles.summaryMetricSecondary}>
          <dt>Otrzymano dla mnie</dt>
          <dd>
            <AnimatedCurrencyValue
              value={personalReceived}
              reveal={metricReveal}
              delayMs={FINANCE_SUMMARY_COUNT_DELAYS_MS.paid}
              durationMs={820}
            />
          </dd>
        </div>
        <div className={styles.summaryMetricSecondary}>
          <dt>Saldo dla mnie</dt>
          <dd>{personalBalance == null ? '—' : (
            <AnimatedCurrencyValue
              value={personalBalance}
              reveal={metricReveal}
              delayMs={FINANCE_SUMMARY_COUNT_DELAYS_MS.remaining}
              durationMs={800}
            />
          )}</dd>
        </div>
      </dl>
    </aside>
  )
}
