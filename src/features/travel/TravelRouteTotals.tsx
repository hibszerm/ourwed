/**
 * Shared Wedding Day route totals — same summary for Dzień ślubu and Ankieta.
 * Values come only from summarizeTravelRoute(buildTravelFlow(plan)).
 */

import { Button } from '@/components/ui/Button'
import type { summarizeTravelRoute } from '@/features/travel/travelUi'
import styles from './TravelRouteTotals.module.css'

export type TravelRouteSummary = ReturnType<typeof summarizeTravelRoute>

interface TravelRouteTotalsProps {
  summary: TravelRouteSummary | null
  /** Optional recalculate control (same mutation / query key as Wedding Day). */
  onRecalculate?: () => void
  recalculatePending?: boolean
}

export function TravelRouteTotals({
  summary,
  onRecalculate,
  recalculatePending = false,
}: TravelRouteTotalsProps) {
  return (
    <div className={styles.routeSummary} data-testid="travel-route-totals">
      <div>
        <span className={styles.bandLabel}>
          {summary?.distanceLabel ?? 'Łączny dystans'}
        </span>
        <p className={styles.bandValue} data-testid="travel-total-distance">
          {summary && summary.totalsComplete ? summary.distanceText : '—'}
        </p>
        {summary &&
        summary.okSegments.length > 0 &&
        !summary.totalsComplete ? (
          <p className={styles.routeSummaryHint}>
            Trasa niekompletna — przelicz ponownie
          </p>
        ) : null}
        {summary &&
        summary.okSegments.length > 0 &&
        summary.totalsComplete &&
        !summary.isCompleteDayRoute ? (
          <p className={styles.routeSummaryHint}>Bez dojazdu z bazy firmy</p>
        ) : null}
      </div>
      <div>
        <span className={styles.bandLabel}>
          {summary?.durationLabel ?? 'Szacowany czas jazdy'}
        </span>
        <p className={styles.bandValue} data-testid="travel-total-duration">
          {summary && summary.totalsComplete ? summary.durationText : '—'}
        </p>
      </div>
      {onRecalculate ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={recalculatePending}
          onClick={() => void onRecalculate()}
        >
          {recalculatePending ? 'Przeliczanie…' : 'Przelicz trasę'}
        </Button>
      ) : null}
    </div>
  )
}
