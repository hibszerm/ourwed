import { formatCurrency } from '@/lib/utils/currency'
import type { FinanceMonthBucket } from '@/lib/finance/financeSeasonTypes'
import {
  FINANCE_MONTH_LABELS_FULL,
  FINANCE_MONTH_LABELS_SHORT,
  formatFinanceAssignmentCount,
} from '@/features/finance/financeLabels'
import {
  financeActiveBarDelayMs,
  financeIsMobileViewport,
} from '@/features/finance/financeMotion'
import styles from '@/features/finance/FinanceCenter.module.css'

interface FinanceMonthChartProps {
  months: FinanceMonthBucket[]
  selectedMonth: number | null
  onSelectMonth: (month: number | null) => void
}

/**
 * Season month chart — primary month selector (shared Finance `month` state).
 * Exact money lives in FinanceSummaryPanel / mobile month detail.
 */
export function FinanceMonthChart({
  months,
  selectedMonth,
  onSelectMonth,
}: FinanceMonthChartProps) {
  const max = Math.max(1, ...months.map((m) => m.contractValue))
  const selected =
    selectedMonth != null
      ? (months.find((m) => m.month === selectedMonth) ?? null)
      : null
  const seasonActive = selectedMonth == null
  const hasSelection = selectedMonth != null
  const isMobile = financeIsMobileViewport()

  let activeBarIndex = 0
  const barDelays = months.map((m) =>
    m.assignmentCount === 0
      ? 0
      : financeActiveBarDelayMs(activeBarIndex++, isMobile),
  )

  return (
    <section
      className={styles.chartSection}
      aria-label="Wartość miesięczna sezonu"
      data-finance-chart
    >
      <div className={styles.chartHeader}>
        <div className={styles.chartHeaderText}>
          <h2 className={styles.chartTitle}>Miesiące sezonu</h2>
          <p className={styles.chartSubtitle}>
            Wartość zleceń według miesiąca realizacji
          </p>
        </div>
        <div className={styles.chartToolbar}>
          <div className={styles.chartLegend}>
            <span>
              <i className={styles.legendPaid} aria-hidden /> Wpłacono
            </span>
            <span>
              <i className={styles.legendRemain} aria-hidden /> Pozostało
            </span>
          </div>
          <button
            type="button"
            className={`${styles.chartReset} ${seasonActive ? styles.chartResetActive : ''}`}
            aria-pressed={seasonActive}
            onClick={() => onSelectMonth(null)}
            data-finance-chart-reset
          >
            Cały sezon
          </button>
        </div>
      </div>

      <div className={styles.chartPlot} data-finance-chart-plot>
        <div
          className={`${styles.chartBars} ${hasSelection ? styles.chartBarsFocused : ''}`}
          role="list"
          data-finance-chart-bars
        >
          {months.map((m, index) => {
            /* Tallest bar ~84% of plot — denser vertical use, breathing room above. */
            const heightPct = (m.contractValue / max) * 84
            const paidPct =
              m.contractValue > 0
                ? Math.min(100, (m.totalPaid / m.contractValue) * 100)
                : 0
            const isSelected = selectedMonth === m.month
            const empty = m.assignmentCount === 0
            const label = FINANCE_MONTH_LABELS_SHORT[m.month - 1]
            const full = FINANCE_MONTH_LABELS_FULL[m.month - 1]
            const countLabel = formatFinanceAssignmentCount(m.assignmentCount)
            const barDelayMs = barDelays[index] ?? 0

            return (
              <button
                key={m.month}
                type="button"
                role="listitem"
                className={`${styles.chartCol} ${isSelected ? styles.chartColSelected : ''} ${empty ? styles.chartColEmpty : ''}`}
                aria-pressed={isSelected}
                disabled={empty}
                title={
                  empty
                    ? `${full}: brak zleceń`
                    : `${full}: ${countLabel}, wartość ${formatCurrency(m.contractValue)}, wpłacono ${formatCurrency(m.totalPaid)}, pozostało ${formatCurrency(m.remaining)}`
                }
                aria-label={
                  empty
                    ? `${full}, brak zleceń`
                    : `${full}, ${countLabel}, wartość ${Math.round(m.contractValue)} zł, wpłacono ${Math.round(m.totalPaid)} zł, pozostało ${Math.round(m.remaining)} zł`
                }
                onClick={() => {
                  if (empty) return
                  onSelectMonth(isSelected ? null : m.month)
                }}
              >
                <div className={styles.chartBarTrack}>
                  {empty ? null : (
                    <div
                      className={styles.chartBarStack}
                      style={{
                        height: `${Math.max(6, heightPct)}%`,
                        ['--finance-bar-delay' as string]: `${barDelayMs}ms`,
                      }}
                      aria-hidden
                    >
                      <div
                        className={styles.chartBarPaid}
                        style={{
                          height: `${paidPct}%`,
                          /* Crisp floor when share is tiny — does not inflate paid % */
                          minHeight: paidPct > 0 ? 1 : 0,
                        }}
                      />
                      <div className={styles.chartBarRemain} />
                    </div>
                  )}
                </div>
                <span className={styles.chartLabel}>{label}</span>
                <span className={styles.chartCount}>
                  {empty ? '—' : m.assignmentCount}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Mobile-only selected month detail; desktop uses FinanceSummaryPanel. */}
      {selected ? (
        <div
          className={`${styles.monthDetail} ${styles.mobileOnly}`}
          data-finance-month-detail
          aria-live="polite"
        >
          <p className={styles.monthDetailTitle}>
            {FINANCE_MONTH_LABELS_FULL[selected.month - 1]}
            <span className={styles.monthDetailSep}>·</span>
            {formatFinanceAssignmentCount(selected.assignmentCount)}
          </p>
          <div className={styles.monthDetailHero}>
            <p className={styles.monthDetailHeroValue}>
              {formatCurrency(selected.contractValue)}
            </p>
            <p className={styles.monthDetailHeroLabel}>Wartość zleceń</p>
          </div>
          <dl className={styles.monthDetailMetrics}>
            <div>
              <dt>Wpłacono</dt>
              <dd>{formatCurrency(selected.totalPaid)}</dd>
            </div>
            <div>
              <dt>Pozostało</dt>
              <dd>{formatCurrency(selected.remaining)}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  )
}
