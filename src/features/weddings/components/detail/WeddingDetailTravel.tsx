import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader } from '@/components/ui/Card'
import { TravelMap } from '@/features/travel/TravelMap'
import {
  buildTravelFlow,
  openFullRouteUrl,
  sumTravelTotals,
  type TravelFlowStop,
} from '@/features/travel/travelUi'
import { travelService } from '@/lib/api/travelService'
import type { TravelSegment } from '@/types/travel'
import styles from './WeddingDetailTravel.module.css'

interface WeddingDetailTravelProps {
  weddingId: string
}

function TravelSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden>
      <div className={`${styles.skelBlock} ${styles.skelMap}`} />
      <div className={styles.skelFlow}>
        <div className={`${styles.skelBlock} ${styles.skelCard}`} />
        <div className={`${styles.skelBlock} ${styles.skelLeg}`} />
        <div className={`${styles.skelBlock} ${styles.skelCard}`} />
        <div className={`${styles.skelBlock} ${styles.skelLeg}`} />
        <div className={`${styles.skelBlock} ${styles.skelCard}`} />
        <div className={`${styles.skelBlock} ${styles.skelLeg}`} />
        <div className={`${styles.skelBlock} ${styles.skelCard}`} />
      </div>
      <div className={styles.skelSummary}>
        <div className={`${styles.skelBlock} ${styles.skelStat}`} />
        <div className={`${styles.skelBlock} ${styles.skelStat}`} />
      </div>
    </div>
  )
}

function StopCard({ stop }: { stop: TravelFlowStop }) {
  return (
    <div className={styles.stopCard}>
      <span className={styles.stopIndex} aria-hidden>
        {stop.markerIndex}
      </span>
      <div className={styles.stopBody}>
        <p className={styles.stopTitle}>{stop.title}</p>
        <p className={styles.stopAddress}>{stop.address}</p>
      </div>
    </div>
  )
}

function LegConnector({ segment }: { segment: TravelSegment | null }) {
  const failed = segment?.status === 'error'
  const ok =
    segment?.status === 'ok' &&
    segment.distanceMeters != null &&
    segment.durationSeconds != null

  return (
    <div className={styles.leg}>
      <div className={styles.legArrow} aria-hidden>
        ↓
      </div>
      <div className={failed ? styles.legMetaError : styles.legMeta}>
        {ok ? (
          <>
            <span>{segment.durationText}</span>
            <span className={styles.legDot}>•</span>
            <span>{segment.distanceText}</span>
          </>
        ) : failed ? (
          <span>Unable to calculate this route.</span>
        ) : (
          <>
            <span>—</span>
            <span className={styles.legDot}>•</span>
            <span>—</span>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Wedding Detail Travel planner card.
 * Studio → Preparations → Ceremony → Reception (skips missing stops).
 */
export function WeddingDetailTravel({ weddingId }: WeddingDetailTravelProps) {
  const queryClient = useQueryClient()

  const { data: plan, isLoading, isFetching } = useQuery({
    queryKey: ['travel-plan', weddingId],
    queryFn: async () => {
      try {
        return await travelService.getPlan(weddingId)
      } catch {
        return {
          weddingId,
          studio: null,
          places: [],
          segments: [],
          hasError: true,
          errorMessage: 'Unable to calculate this route.',
        }
      }
    },
    retry: false,
  })

  const recalculateMutation = useMutation({
    mutationFn: () =>
      travelService.recalculate(weddingId, { forceRefresh: true }),
    onSuccess: async (next) => {
      queryClient.setQueryData(['travel-plan', weddingId], next)
      await queryClient.invalidateQueries({ queryKey: ['travel-plan', weddingId] })
    },
  })

  const flow = plan ? buildTravelFlow(plan) : null
  const okSegments =
    plan?.segments.filter(
      (s) => s.status === 'ok' && s.distanceMeters != null,
    ) ?? []
  const totals = sumTravelTotals(okSegments)
  const directionsUrl = flow ? openFullRouteUrl(flow.stops) : null
  const busy = isFetching || recalculateMutation.isPending

  return (
    <Card padding="md" className={styles.card}>
      <CardHeader title="Travel" subtitle="Studio → Preparations → Ceremony → Reception" />

      {isLoading ? (
        <TravelSkeleton />
      ) : !flow || !flow.hasAnyLocation ? (
        <div className={styles.empty}>
          <p className={styles.muted}>
            No locations yet. Set studio origin and wedding places to build the
            travel timeline.
          </p>
          <p className={styles.meta}>
            Studio → Travel settings · set locations in the hero above
          </p>
        </div>
      ) : (
        <div className={styles.content}>
          <TravelMap stops={flow.stops} />

          <div className={styles.flow}>
            {flow.stops.map((stop, index) => (
              <div key={stop.key} className={styles.flowItem}>
                <StopCard stop={stop} />
                {index < flow.stops.length - 1 ? (
                  <LegConnector segment={flow.legs[index] ?? null} />
                ) : null}
              </div>
            ))}
          </div>

          <div className={styles.summary}>
            <div className={styles.summaryStat}>
              <span className={styles.summaryLabel}>Total distance</span>
              <span className={styles.summaryValue}>
                {okSegments.length > 0 ? totals.distanceText : '—'}
              </span>
            </div>
            <div className={styles.summaryStat}>
              <span className={styles.summaryLabel}>Estimated driving</span>
              <span className={styles.summaryValue}>
                {okSegments.length > 0 ? totals.durationText : '—'}
              </span>
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.actionPrimary}
              disabled={busy}
              onClick={() => void recalculateMutation.mutateAsync()}
            >
              {recalculateMutation.isPending
                ? 'Recalculating…'
                : 'Recalculate route'}
            </button>
            {directionsUrl ? (
              <a
                className={styles.actionSecondary}
                href={directionsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open full route
              </a>
            ) : (
              <span className={styles.actionDisabled}>Open full route</span>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
