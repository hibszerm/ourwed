/**
 * Plan dnia — operational timeline for photographers (Wedding Detail V2 aesthetic).
 * Travel metrics come only from travelService / buildTravelFlow.
 * Display order: Start → Groom prep → Bride prep → Ceremony → Reception.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Car,
  Church,
  Home,
  MapPin,
  PartyPopper,
  Sparkles,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import {
  PLAN_DNIA_ROLE_ORDER,
  PLAN_DNIA_STAGE_LABELS,
  buildDayTimelineSummary,
  timelineTimesByRole,
} from '@/features/prewedding/answerSummary'
import { answerToGeoPlace } from '@/features/prewedding/preweddingLocation'
import { TravelRouteTotals } from '@/features/travel/TravelRouteTotals'
import { getWeddingLocationDisplay } from '@/features/travel/weddingLocationModel'
import {
  buildTravelFlow,
  getTravelBaseAddress,
  getTravelBaseDisplayName,
  getTravelBaseStatus,
  summarizeTravelRoute,
  travelLegFailureMessage,
  type TravelFlow,
  type TravelFlowLeg,
  type TravelFlowStop,
} from '@/features/travel/travelUi'
import { googleMapsPlaceUrl } from '@/services/googleMapsLinks'
import { travelService } from '@/lib/api/travelService'
import type { PreWeddingTemplateSchema } from '@/types/preweddingQuestionnaire'
import type { GeoPlace, TravelPlan } from '@/types/travel'
import styles from './PreWeddingDayPlan.module.css'

const STAGE_ICONS: Record<string, LucideIcon> = {
  studio: Home,
  bride_preparation: Sparkles,
  groom_preparation: UserRound,
  ceremony: Church,
  reception: PartyPopper,
}

function formatLegMetrics(leg: TravelFlowLeg | null): string {
  if (!leg) return '—'
  const segment = leg.segment
  if (
    segment &&
    segment.status === 'ok' &&
    (segment.durationText || segment.distanceText)
  ) {
    const parts = [segment.durationText, segment.distanceText].filter(Boolean)
    return parts.length ? parts.join(' · ') : '—'
  }
  return travelLegFailureMessage(leg.failureReason)
}

function stopToGeoPlace(stop: TravelFlowStop): GeoPlace {
  return {
    placeId: stop.placeId,
    formattedAddress: stop.address || '',
    latitude: stop.latitude,
    longitude: stop.longitude,
    label: stop.label || null,
    provider: stop.placeId ? 'google' : null,
  }
}

function findLegBetween(
  flow: TravelFlow,
  fromRole: string | undefined,
  toRole: string | undefined,
): TravelFlowLeg | null {
  if (!fromRole || !toRole) return null
  const forward =
    flow.routeLegs.find((leg) => {
      const originRole =
        leg.origin.kind === 'studio' ? 'studio' : leg.origin.role
      const destRole = leg.destination.role
      return originRole === fromRole && destRole === toRole
    }) ?? null
  if (forward) return forward
  return null
}

function samePlace(a: GeoPlace, b: GeoPlace): boolean {
  const idA = a.placeId?.trim()
  const idB = b.placeId?.trim()
  if (idA && idB && idA === idB) return true
  const fa = (a.formattedAddress || '').trim().toLowerCase()
  const fb = (b.formattedAddress || '').trim().toLowerCase()
  return Boolean(fa && fb && fa === fb)
}

function timeForRole(
  role: string,
  times: Partial<Record<string, string>>,
  answerTime: string | null,
): string | null {
  if (role === 'ceremony') return times.ceremony ?? answerTime
  if (role === 'reception') return times.reception ?? answerTime
  // Do not attach departure-to-ceremony onto prep stages.
  return answerTime
}

interface Props {
  weddingId: string
  schema: PreWeddingTemplateSchema
  answers: Record<string, unknown>
}

export function PreWeddingDayPlan({ weddingId, schema, answers }: Props) {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const times = timelineTimesByRole(schema, answers)
  const answerStops = buildDayTimelineSummary(schema, answers)

  const { data: plan, isLoading } = useQuery({
    queryKey: ['travel-plan', userId, weddingId],
    queryFn: async (): Promise<TravelPlan> => {
      try {
        return await travelService.getPlan(weddingId)
      } catch {
        return {
          weddingId,
          studio: null,
          places: [],
          segments: [],
          hasError: true,
          errorMessage: null,
          persistenceError: null,
        }
      }
    },
    enabled: Boolean(userId && weddingId),
    retry: false,
  })

  const recalculate = useMutation({
    mutationFn: () =>
      travelService.recalculate(weddingId, { forceRefresh: true }),
    onSuccess: async (next) => {
      queryClient.setQueryData(['travel-plan', userId, weddingId], next)
      await queryClient.invalidateQueries({ queryKey: ['travel-plan'] })
    },
  })

  const flow = plan ? buildTravelFlow(plan) : null
  const summary = flow ? summarizeTravelRoute(flow) : null
  const baseStatus = getTravelBaseStatus(plan?.studio ?? null)
  const baseReady = baseStatus === 'ready' || baseStatus === 'incomplete'
  const travelStops = flow?.stops ?? []
  const useTravel = travelStops.some((s) => s.kind === 'wedding_place')

  type RenderStop = {
    key: string
    role: string
    time: string | null
    place: GeoPlace
    sameAsPrevious: boolean
  }

  const collected: RenderStop[] = []

  if (useTravel && flow) {
    for (const stop of travelStops) {
      const role = stop.kind === 'studio' ? 'studio' : stop.role || 'other'
      const place = stopToGeoPlace(stop)
      const answerStop = answerStops.find((s) => s.role === role)
      collected.push({
        key: stop.key,
        role,
        time: timeForRole(role, times, answerStop?.time ?? null),
        place,
        sameAsPrevious: false,
      })
    }
  } else {
    if (baseReady && plan?.studio) {
      collected.push({
        key: 'studio',
        role: 'studio',
        time: null,
        place: {
          placeId: plan.studio.placeId,
          formattedAddress:
            getTravelBaseAddress(plan.studio) ||
            getTravelBaseDisplayName(plan.studio),
          latitude: plan.studio.latitude,
          longitude: plan.studio.longitude,
          label: getTravelBaseDisplayName(plan.studio),
          provider: plan.studio.placeId ? 'google' : null,
        },
        sameAsPrevious: false,
      })
    }
    for (const stop of answerStops) {
      if (!stop.place) continue
      collected.push({
        key: stop.id,
        role: stop.role,
        time: stop.time,
        place: stop.place,
        sameAsPrevious: Boolean(stop.sameAsPrevious),
      })
    }
  }

  const byRole = new Map(collected.map((s) => [s.role, s]))
  const renderStops: RenderStop[] = []
  for (const role of PLAN_DNIA_ROLE_ORDER) {
    const stop = byRole.get(role)
    if (!stop) continue
    const prev = renderStops[renderStops.length - 1]
    renderStops.push({
      ...stop,
      sameAsPrevious: prev ? samePlace(prev.place, stop.place) : false,
    })
  }

  if (renderStops.length === 0) return null

  return (
    <section className={styles.plan} data-testid="prewedding-day-timeline">
      <h3 className={styles.title}>Plan dnia</h3>
      {isLoading ? <p className={styles.muted}>Ładowanie trasy…</p> : null}

      <ol className={styles.list}>
        {renderStops.map((stop, index) => {
          const prev = renderStops[index - 1]
          const leg =
            flow && prev ? findLegBetween(flow, prev.role, stop.role) : null
          const metrics = formatLegMetrics(leg)
          const stage =
            PLAN_DNIA_STAGE_LABELS[stop.role] || stop.role
          const Icon = STAGE_ICONS[stop.role] || MapPin
          const display = getWeddingLocationDisplay(stop.place)
          const mapsUrl = googleMapsPlaceUrl(stop.place)

          return (
            <li key={stop.key} className={styles.item}>
              {index > 0 ? (
                <div
                  className={styles.leg}
                  data-testid="prewedding-travel-leg"
                  aria-label={leg?.label || 'Odcinek trasy'}
                >
                  <span className={styles.timelineConnector} aria-hidden="true" />
                  <span className={styles.legMetrics}>
                    <Car className={styles.legIcon} aria-hidden="true" size={14} strokeWidth={2} />
                    {metrics}
                  </span>
                  {stop.sameAsPrevious ? (
                    <span className={styles.samePlace}>To samo miejsce</span>
                  ) : null}
                </div>
              ) : null}

              <div className={styles.row} data-role={stop.role}>
                <div className={styles.timelineCol} aria-hidden="true">
                  <span className={styles.timelineDot} />
                  {index < renderStops.length - 1 ? (
                    <span className={styles.timelineRail} />
                  ) : null}
                </div>
                <div className={styles.rowIcon} aria-hidden="true">
                  <Icon size={16} strokeWidth={1.75} />
                </div>
                <div className={styles.rowBody}>
                  <div className={styles.rowTop}>
                    <p className={styles.stage}>{stage}</p>
                    <p className={styles.time}>{stop.time || '—'}</p>
                  </div>
                  <p className={styles.venue}>{display.primary}</p>
                  {display.secondary ? (
                    <p className={styles.address}>{display.secondary}</p>
                  ) : null}
                  {mapsUrl ? (
                    <a
                      className={styles.mapsLink}
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="location-card-maps-link"
                    >
                      Otwórz w Google Maps
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {useTravel ? (
        <TravelRouteTotals
          summary={summary}
          onRecalculate={() => void recalculate.mutateAsync()}
          recalculatePending={recalculate.isPending}
        />
      ) : null}
    </section>
  )
}

export function geoFromAnswerValue(value: unknown): GeoPlace | null {
  return answerToGeoPlace(value)
}
