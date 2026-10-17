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
  const max = Math.max(1, ...months.map((m) => Math.abs(m.personalValue ?? 0)))
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
      aria-label="Osobista wartość miesięczna sezonu"
      data-finance-chart
    >
      <div className={styles.chartHeader}>
        <div className={styles.chartHeaderText}>
          <h2 className={styles.chartTitle}>Miesiące sezonu</h2>
          <p className={styles.chartSubtitle}>Wartość zleceń według miesiąca realizacji · dla mnie</p>
        </div>
        <div className={styles.chartToolbar}>
          <div className={styles.chartLegend}>
            <span>
                <i className={styles.legendPaid} aria-hidden /> Otrzymano dla mnie
            </span>
            <span>
                <i className={styles.legendRemain} aria-hidden /> Saldo dla mnie
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
            const personalValue = m.personalValue ?? 0
            const personalReceived = m.personalReceived ?? 0
            const heightPct = (Math.abs(personalValue) / max) * 84
            const paidPct =
              personalValue > 0
                ? Math.min(100, (personalReceived / personalValue) * 100)
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
                    : `${full}: ${countLabel}, wartość dla mnie ${m.personalValueKnownCount ? formatCurrency(personalValue) : 'nieustalona'}, otrzymano ${formatCurrency(personalReceived)}, saldo ${m.personalBalance == null ? 'nieustalone' : formatCurrency(m.personalBalance)}`
                }
                aria-label={
                  empty
                    ? `${full}, brak zleceń`
                    : `${full}, ${countLabel}, wartość dla mnie ${m.personalValueKnownCount ? `${Math.round(personalValue)} zł` : 'nieustalona'}, otrzymano ${Math.round(personalReceived)} zł`
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
                        height: `${heightPct > 0 ? Math.max(6, heightPct) : 0}%`,
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
              {selected.personalValueKnownCount ? formatCurrency(selected.personalValue ?? 0) : 'Nieustalona'}
            </p>
            <p className={styles.monthDetailHeroLabel}>Wartość dla mnie</p>
          </div>
          {(selected.personalValueKnownCount ?? 0) < selected.assignmentCount ? (
            <p>{selected.assignmentCount - (selected.personalValueKnownCount ?? 0)} zleceń bez ustalonej wartości osobistej</p>
          ) : null}
          <dl className={styles.monthDetailMetrics}>
            <div>
              <dt>Otrzymano dla mnie</dt>
              <dd>{formatCurrency(selected.personalReceived ?? 0)}</dd>
            </div>
            <div>
              <dt>Saldo dla mnie</dt>
              <dd>{selected.personalBalance == null ? '—' : formatCurrency(selected.personalBalance)}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  )
}
