/**
 * Shared Wedding Day route totals — same summary for Dzień ślubu and Ankieta.
 * Values come only from summarizeTravelRoute(buildTravelFlow(plan)).
 */

import { Button } from '@/components/ui/Button'
import type { summarizeTravelRoute } from '@/features/travel/travelUi'
import styles from './TravelRouteTotals.module.css'

export type TravelRouteSummary = ReturnType<typeof summarizeTravelRoute>

/** Canonical UI status for auto + manual route recalculation. */
export type TravelRouteUiStatus = 'idle' | 'loading' | 'error'

interface TravelRouteTotalsProps {
  summary: TravelRouteSummary | null
  /** Optional recalculate control (same mutation / query key as Wedding Day). */
  onRecalculate?: () => void
  recalculatePending?: boolean
  /** Shared auto/manual recalculation feedback. */
  routeStatus?: TravelRouteUiStatus
}

export function TravelRouteTotals({
  summary,
  onRecalculate,
  recalculatePending = false,
  routeStatus = 'idle',
}: TravelRouteTotalsProps) {
  const loading = routeStatus === 'loading' || recalculatePending
  const error = routeStatus === 'error' && !loading
  const showValues =
    !loading && !error && summary != null && summary.totalsComplete

  return (
    <div className={styles.routeSummary} data-testid="travel-route-totals">
      {loading ? (
        <div
          className={styles.routeStatus}
          data-testid="travel-route-loading"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className={styles.routeSpinner} aria-hidden="true" />
          <div className={styles.routeStatusCopy}>
            <p className={styles.routeStatusTitle}>Przeliczamy trasę…</p>
            <p className={styles.routeStatusDetail}>
              Aktualizujemy czasy i odległości dla nowej kolejności.
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          className={styles.routeStatus}
          data-testid="travel-route-error"
          role="alert"
        >
          <div className={styles.routeStatusCopy}>
            <p className={styles.routeStatusTitle}>
              Nie udało się przeliczyć trasy.
            </p>
            <p className={styles.routeStatusDetail}>Spróbuj ponownie.</p>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <>
          <div>
            <span className={styles.bandLabel}>
              {summary?.distanceLabel ?? 'Łączny dystans'}
            </span>
            <p className={styles.bandValue} data-testid="travel-total-distance">
              {showValues ? summary.distanceText : '—'}
            </p>
            {!error &&
            summary &&
            summary.okSegments.length > 0 &&
            !summary.totalsComplete ? (
              <p className={styles.routeSummaryHint}>
                Trasa niekompletna — przelicz ponownie
              </p>
            ) : null}
            {!error &&
            summary &&
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
              {showValues ? summary.durationText : '—'}
            </p>
          </div>
        </>
      ) : (
        <>
          <div>
            <span className={styles.bandLabel}>
              {summary?.distanceLabel ?? 'Łączny dystans'}
            </span>
            <p className={styles.bandValue} data-testid="travel-total-distance">
              <span className={styles.bandSkeleton} aria-hidden="true" />
            </p>
          </div>
          <div>
            <span className={styles.bandLabel}>
              {summary?.durationLabel ?? 'Szacowany czas jazdy'}
            </span>
            <p className={styles.bandValue} data-testid="travel-total-duration">
              <span className={styles.bandSkeleton} aria-hidden="true" />
            </p>
          </div>
        </>
      )}

      {onRecalculate ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => void onRecalculate()}
        >
          {loading ? 'Przeliczanie…' : 'Przelicz trasę'}
        </Button>
      ) : null}
    </div>
  )
}
