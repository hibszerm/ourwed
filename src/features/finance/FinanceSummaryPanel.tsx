import type {
  FinanceKindFilter,
  FinanceMonthBucket,
  FinanceSeasonKpis,
} from '@/lib/finance/financeSeasonTypes'
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
  const contractValue = month ? month.contractValue : kpis.contractValue
  const totalPaid = month ? month.totalPaid : kpis.totalPaid
  const remaining = month ? month.remaining : kpis.remaining

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

      <dl className={styles.summaryMetrics}>
        <div className={styles.summaryMetricPrimary}>
          <dt>Wartość zleceń</dt>
          <dd>
            <AnimatedCurrencyValue
              value={contractValue}
              reveal={metricReveal}
              delayMs={FINANCE_SUMMARY_COUNT_DELAYS_MS.primary}
              durationMs={FINANCE_COUNT_MS}
            />
          </dd>
        </div>
        <div className={styles.summaryMetricSecondary}>
          <dt>Wpłacono</dt>
          <dd>
            <AnimatedCurrencyValue
              value={totalPaid}
              reveal={metricReveal}
              delayMs={FINANCE_SUMMARY_COUNT_DELAYS_MS.paid}
              durationMs={820}
            />
          </dd>
        </div>
        <div className={styles.summaryMetricSecondary}>
          <dt>Pozostało</dt>
          <dd>
            <AnimatedCurrencyValue
              value={remaining}
              reveal={metricReveal}
              delayMs={FINANCE_SUMMARY_COUNT_DELAYS_MS.remaining}
              durationMs={800}
            />
          </dd>
        </div>
      </dl>
    </aside>
  )
}
