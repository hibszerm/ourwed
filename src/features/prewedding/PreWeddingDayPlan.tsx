/**
 * Plan dnia — studio operational timeline (Wedding Detail).
 *
 * ONE display/route array:
 *   getOperationalOrderedPlaces(wedding_places)
 *   + optional draft id permutation while dragging
 *
 * travel-plan supplies studio + segments only — never place order.
 */

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Car,
  Church,
  GripVertical,
  Home,
  MapPin,
  PartyPopper,
  Sparkles,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import {
  PLAN_DNIA_STAGE_LABELS,
  buildDayTimelineSummary,
  timelineTimesByRole,
} from '@/features/prewedding/answerSummary'
import { OperationalTimeControl } from '@/features/prewedding/OperationalTimeControl'
import { TravelRouteTotals } from '@/features/travel/TravelRouteTotals'
import type { TravelRouteUiStatus } from '@/features/travel/TravelRouteTotals'
import {
  buildOrderedWeddingDayRouteStops,
  computeRouteInputFingerprint,
  getOperationalOrderedPlaces,
} from '@/features/travel/weddingDayRouteStops'
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
} from '@/features/travel/travelUi'
import { googleMapsPlaceUrl } from '@/services/googleMapsLinks'
import { travelService } from '@/lib/api/travelService'
import { weddingOperationalTimesService } from '@/lib/api/weddingOperationalTimesService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import {
  buildOperationalDayStops,
  reorderPlaceIds,
  type OperationalDayStop,
  type OperationalTimeMap,
} from '@/features/wedding-day/operationalDayPlan'
import {
  isOperationalOrderDebugEnabled,
  logOperationalOrder,
  summarizeIdRoles,
  summarizePlaceOrder,
} from '@/features/wedding-day/operationalOrderDebug'
import {
  setExpectedRouteFingerprint,
  shouldAcceptTravelPlanResult,
} from '@/features/wedding-day/routeResultGuard'
import {
  operationalTimesQueryKey,
  travelPlanQueryKey,
  weddingPlacesQueryKey,
} from '@/features/wedding-day/queryKeys'
import type { PreWeddingTemplateSchema } from '@/types/preweddingQuestionnaire'
import type { GeoPlace, TravelPlan, WeddingPlace } from '@/types/travel'
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

function findLegBetweenKeys(
  flow: TravelFlow | null,
  fromKey: string | undefined,
  toKey: string | undefined,
): TravelFlowLeg | null {
  if (!flow || !fromKey || !toKey) return null
  return (
    flow.routeLegs.find(
      (leg) => leg.origin.key === fromKey && leg.destination.key === toKey,
    ) ?? null
  )
}

function samePlace(a: GeoPlace, b: GeoPlace): boolean {
  const idA = a.placeId?.trim()
  const idB = b.placeId?.trim()
  if (idA && idB && idA === idB) return true
  const fa = (a.formattedAddress || '').trim().toLowerCase()
  const fb = (b.formattedAddress || '').trim().toLowerCase()
  return Boolean(fa && fb && fa === fb)
}

function stopToDisplayPlace(stop: OperationalDayStop): GeoPlace {
  return {
    placeId: stop.placeId ?? null,
    formattedAddress: stop.address || '',
    latitude: stop.latitude ?? null,
    longitude: stop.longitude ?? null,
    label: stop.placeName || null,
    provider: stop.placeId ? 'google' : null,
  }
}

function emptyStalePlan(
  weddingId: string,
  studio: TravelPlan['studio'],
): TravelPlan {
  return {
    weddingId,
    studio,
    places: [],
    segments: [],
    hasError: false,
    errorMessage: null,
    persistenceError: null,
    routeFingerprint: null,
    routeStale: true,
  }
}

interface Props {
  weddingId: string
  /** Current wedding.ceremonyTime — operational precedence over questionnaire seed. */
  weddingCeremonyTime?: string | null
  schema: PreWeddingTemplateSchema
  answers: Record<string, unknown>
}

export function PreWeddingDayPlan({
  weddingId,
  weddingCeremonyTime,
  schema,
  answers,
}: Props) {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const qTimes = timelineTimesByRole(schema, answers)
  const answerStops = buildDayTimelineSummary(schema, answers)
  const placesKey = weddingPlacesQueryKey(userId, weddingId)
  const travelKey = travelPlanQueryKey(userId, weddingId)
  const timesKey = operationalTimesQueryKey(userId, weddingId)

  const { data: places = [], isLoading: placesLoading } = useQuery({
    queryKey: placesKey,
    queryFn: () => weddingPlaceService.listByWeddingId(weddingId),
    enabled: Boolean(userId && weddingId),
    retry: false,
  })

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: travelKey,
    queryFn: async (): Promise<TravelPlan> => {
      try {
        const next = await travelService.getPlan(weddingId)
        if (
          !shouldAcceptTravelPlanResult({
            weddingId,
            routeFingerprint: next.routeFingerprint,
            routeStale: next.routeStale,
          })
        ) {
          logOperationalOrder({
            source: 'stale-plan-discard',
            weddingId,
            note: 'queryFn discarded mismatched fingerprint',
            extra: { got: next.routeFingerprint },
          })
          const prev = queryClient.getQueryData<TravelPlan>(travelKey)
          return (
            prev ??
            emptyStalePlan(weddingId, next.studio)
          )
        }
        // Strip places — UI never reads plan.places for order.
        return { ...next, places: [] }
      } catch {
        return emptyStalePlan(weddingId, null)
      }
    },
    enabled: Boolean(userId && weddingId),
    retry: false,
  })

  const { data: operationalTimes = {} } = useQuery({
    queryKey: timesKey,
    queryFn: () => weddingOperationalTimesService.listByWeddingId(weddingId),
    enabled: Boolean(userId && weddingId),
    retry: false,
  })

  const [routeStatus, setRouteStatus] = useState<TravelRouteUiStatus>('idle')

  const recalculate = useMutation({
    mutationFn: async () => {
      setRouteStatus('loading')
      const authoritative =
        queryClient.getQueryData<WeddingPlace[]>(placesKey) ?? places
      const orderedIds = getOperationalOrderedPlaces(authoritative).map(
        (p) => p.id,
      )
      await queryClient.cancelQueries({ queryKey: travelKey })
      const routeStops = buildOrderedWeddingDayRouteStops({
        studio: plan?.studio ?? null,
        places: authoritative,
        orderedPlaceIds: orderedIds,
      })
      const fingerprint = computeRouteInputFingerprint(routeStops)
      setExpectedRouteFingerprint(weddingId, fingerprint)
      logOperationalOrder({
        source: 'PreWeddingDayPlan',
        weddingId,
        places: getOperationalOrderedPlaces(authoritative),
        note: 'manual-przelicz-trasy',
        extra: { orderedIds, fingerprint },
      })
      queryClient.setQueryData(
        travelKey,
        emptyStalePlan(weddingId, plan?.studio ?? null),
      )
      return travelService.recalculate(weddingId, {
        forceRefresh: true,
        places: authoritative,
        orderedPlaceIds: orderedIds,
      })
    },
    onSuccess: (next) => {
      if (
        !shouldAcceptTravelPlanResult({
          weddingId,
          routeFingerprint: next.routeFingerprint,
          routeStale: next.routeStale,
        })
      ) {
        logOperationalOrder({
          source: 'stale-plan-discard',
          weddingId,
          note: 'manual recalc discarded',
          extra: { got: next.routeFingerprint },
        })
        setRouteStatus('error')
        return
      }
      queryClient.setQueryData(travelKey, { ...next, places: [] })
      setRouteStatus('idle')
    },
    onError: () => {
      setRouteStatus('error')
    },
  })

  const saveTime = useMutation({
    mutationFn: async ({
      stopKey,
      time,
    }: {
      stopKey: string
      time: string | null
    }) => {
      if (time) {
        const saved = await weddingOperationalTimesService.setTime(
          weddingId,
          stopKey,
          time,
        )
        return { stopKey, time: saved }
      }
      await weddingOperationalTimesService.clearTime(weddingId, stopKey)
      return { stopKey, time: null }
    },
    onSuccess: ({ stopKey, time }) => {
      // Same key Cockpit reads — immediate live consistency without hard refresh.
      queryClient.setQueryData(
        timesKey,
        (prev: OperationalTimeMap | undefined) => {
          const next = { ...(prev ?? {}) }
          if (time) next[stopKey] = time
          else delete next[stopKey]
          return next
        },
      )
    },
  })

  // ——— ONE canonical place sequence ———
  const canonicalPlaces = getOperationalOrderedPlaces(places)
  const canonicalIds = canonicalPlaces.map((p) => p.id)
  const hasOperationalPlaces = canonicalPlaces.length > 0

  const [draftPlaceIds, setDraftPlaceIds] = useState<string[] | null>(null)
  const draftIdsRef = useRef<string[] | null>(null)
  const dragRef = useRef<{ id: string } | null>(null)
  const committingRef = useRef(false)
  const lastRenderedLogRef = useRef<string>('')
  const displayIds = draftPlaceIds ?? canonicalIds
  const dragging = Boolean(draftPlaceIds)

  function setDraft(next: string[] | null) {
    draftIdsRef.current = next
    setDraftPlaceIds(next)
  }

  const baseStops = hasOperationalPlaces
    ? buildOperationalDayStops({
        studio: plan?.studio ?? null,
        places: canonicalPlaces,
        operationalTimes,
        questionnaireTimes: qTimes,
        weddingCeremonyTime: weddingCeremonyTime,
      })
    : []

  // Remap place cards by displayIds — do NOT re-sort by sort_order here.
  const studioStop = baseStops.filter((s) => s.kind === 'studio')
  const byId = new Map(
    baseStops.filter((s) => s.reorderable).map((s) => [s.key, s]),
  )
  const renderStops: OperationalDayStop[] = hasOperationalPlaces
    ? [
        ...studioStop,
        ...displayIds
          .map((id) => byId.get(id))
          .filter((s): s is OperationalDayStop => Boolean(s)),
      ]
    : (() => {
        const collected: OperationalDayStop[] = []
        const baseStatus = getTravelBaseStatus(plan?.studio ?? null)
        const baseReady = baseStatus === 'ready' || baseStatus === 'incomplete'
        if (baseReady && plan?.studio) {
          collected.push({
            key: 'studio',
            kind: 'studio',
            role: 'studio',
            title: PLAN_DNIA_STAGE_LABELS.studio || 'Start dnia',
            placeName: getTravelBaseDisplayName(plan.studio),
            address: getTravelBaseAddress(plan.studio) || undefined,
            time: operationalTimes.studio ? operationalTimes.studio : null,
            timeSource: operationalTimes.studio ? 'studio' : null,
            latitude: plan.studio.latitude,
            longitude: plan.studio.longitude,
            placeId: plan.studio.placeId,
            reorderable: false,
          })
        }
        for (const stop of answerStops) {
          if (!stop.place) continue
          collected.push({
            key: stop.id,
            kind: 'wedding_place',
            role: stop.role,
            title: stop.label,
            placeName: stop.place.label || undefined,
            address: stop.place.formattedAddress || stop.location || undefined,
            time: stop.time,
            timeSource: stop.time ? 'questionnaire' : null,
            latitude: stop.place.latitude,
            longitude: stop.place.longitude,
            placeId: stop.place.placeId,
            reorderable: false,
          })
        }
        return collected
      })()

  const renderedPlaceDebug = renderStops
    .filter((s) => s.reorderable)
    .map((s) => {
      const place = places.find((p) => p.id === s.key)
      return {
        id: s.key,
        role: s.role,
        sortOrder: place?.sortOrder,
      }
    })
  const renderedSummary = summarizeIdRoles(renderedPlaceDebug)

  useEffect(() => {
    if (!isOperationalOrderDebugEnabled() || !hasOperationalPlaces) return
    if (renderedSummary === lastRenderedLogRef.current) return
    lastRenderedLogRef.current = renderedSummary
    logOperationalOrder({
      source: 'PreWeddingDayPlan',
      weddingId,
      note: 'RENDERED ARRAY (exact JSX map source)',
      extra: {
        rendered: renderedSummary,
        displayIds,
        draftActive: dragging,
        canonical: summarizePlaceOrder(canonicalPlaces),
      },
    })
  }, [
    renderedSummary,
    hasOperationalPlaces,
    weddingId,
    displayIds,
    dragging,
    canonicalPlaces,
  ])

  const routeInputIds = dragging ? null : canonicalIds
  const flow =
    plan && hasOperationalPlaces && routeInputIds
      ? buildTravelFlow(
          {
            ...plan,
            places: [],
            routeStale: plan.routeStale || plan.segments.length === 0,
          },
          {
            places: canonicalPlaces,
            orderedPlaceIds: routeInputIds,
          },
        )
      : null
  const summary =
    dragging || !flow || flow.routeStale
      ? flow
        ? {
            ...summarizeTravelRoute({ ...flow, routeStale: true, routeComplete: false }),
            distanceText: '—',
            durationText: '—',
            totalsComplete: false,
          }
        : null
      : summarizeTravelRoute(flow)
  const isLoading = placesLoading || planLoading
  const useTravel = Boolean(flow?.stops.some((s) => s.kind === 'wedding_place'))

  async function commitReorder(nextIds: string[]) {
    const beforeIds = canonicalIds
    const unchanged =
      nextIds.length === beforeIds.length &&
      nextIds.every((id, i) => id === beforeIds[i])
    if (unchanged) {
      setDraft(null)
      return
    }

    logOperationalOrder({
      source: 'drag-commit',
      weddingId,
      note: 'commitReorder inputs',
      extra: {
        beforeIds,
        afterIds: nextIds,
        beforeRoles: beforeIds.map(
          (id) => places.find((p) => p.id === id)?.role,
        ),
        afterRoles: nextIds.map(
          (id) => places.find((p) => p.id === id)?.role,
        ),
      },
    })

    try {
      await queryClient.cancelQueries({ queryKey: travelKey })
      await queryClient.cancelQueries({ queryKey: placesKey })

      const updatedPlaces = await weddingPlaceService.reorder(
        weddingId,
        nextIds,
      )
      // Verified DB readback (service already listByWeddingId after writes).
      const verifiedIds = updatedPlaces.map((p) => p.id)
      if (
        verifiedIds.length !== nextIds.length ||
        !nextIds.every((id, i) => verifiedIds[i] === id)
      ) {
        throw new Error('DB readback order does not match committed drag order')
      }

      logOperationalOrder({
        source: 'db-readback',
        weddingId,
        places: updatedPlaces,
        note: 'verified after reorder',
      })

      queryClient.setQueryData(placesKey, updatedPlaces)

      const routeStops = buildOrderedWeddingDayRouteStops({
        studio: plan?.studio ?? null,
        places: updatedPlaces,
        orderedPlaceIds: verifiedIds,
      })
      const fingerprint = computeRouteInputFingerprint(routeStops)
      setExpectedRouteFingerprint(weddingId, fingerprint)

      queryClient.setQueryData(
        travelKey,
        emptyStalePlan(weddingId, plan?.studio ?? null),
      )
      setDraft(null)
      setRouteStatus('loading')

      try {
        const nextPlan = await travelService.recalculate(weddingId, {
          forceRefresh: true,
          places: updatedPlaces,
          orderedPlaceIds: verifiedIds,
        })
        if (
          !shouldAcceptTravelPlanResult({
            weddingId,
            routeFingerprint: nextPlan.routeFingerprint,
            routeStale: nextPlan.routeStale,
          })
        ) {
          logOperationalOrder({
            source: 'stale-plan-discard',
            weddingId,
            note: 'post-reorder recalc discarded',
            extra: {
              expected: fingerprint,
              got: nextPlan.routeFingerprint,
            },
          })
          setRouteStatus('error')
          return
        }
        queryClient.setQueryData(travelKey, { ...nextPlan, places: [] })
        setRouteStatus('idle')
      } catch {
        // Order kept; route stays stale/empty.
        setRouteStatus('error')
      }
    } catch (err) {
      logOperationalOrder({
        source: 'drag-commit',
        weddingId,
        note: 'commitReorder failed — clearing draft to cache order',
        extra: {
          error: err instanceof Error ? err.message : String(err),
        },
      })
      setDraft(null)
      await queryClient.invalidateQueries({ queryKey: placesKey })
    }
  }

  function onHandlePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    stopKey: string,
  ) {
    if (!hasOperationalPlaces) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { id: stopKey }
    setDraft(displayIds)
  }

  function onHandlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return
    const el = document.elementFromPoint(event.clientX, event.clientY)
    // Only place rows — travel legs have no data-stop-key / data-place-id.
    const overKey =
      el
        ?.closest('[data-place-id]')
        ?.getAttribute('data-place-id') ??
      el?.closest('[data-stop-key]')?.getAttribute('data-stop-key')
    if (
      !overKey ||
      overKey === 'studio' ||
      overKey === dragRef.current.id
    ) {
      return
    }
    // Ignore if target is not a reorderable place id.
    if (!canonicalIds.includes(overKey)) return
    const ids = draftIdsRef.current ?? displayIds
    const from = ids.indexOf(dragRef.current.id)
    const to = ids.indexOf(overKey)
    if (from < 0 || to < 0 || from === to) return
    setDraft(reorderPlaceIds(ids, from, to))
  }

  function endDrag() {
    if (!dragRef.current) return
    dragRef.current = null
    const next = draftIdsRef.current
    if (!next || committingRef.current) return
    committingRef.current = true
    void commitReorder(next).finally(() => {
      committingRef.current = false
    })
  }

  // Window-level end so pointerup outside the handle still commits.
  useEffect(() => {
    if (!dragging) return
    const onUp = () => endDrag()
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // endDrag closes over latest draft via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drag session
  }, [dragging])

  function onHandleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    stopKey: string,
  ) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const from = displayIds.indexOf(stopKey)
    const to = event.key === 'ArrowUp' ? from - 1 : from + 1
    const next = reorderPlaceIds(displayIds, from, to)
    void commitReorder(next)
  }

  if (renderStops.length === 0) return null

  const routeBusy = routeStatus === 'loading' || recalculate.isPending

  return (
    <section className={styles.plan} data-testid="prewedding-day-timeline">
      <h3 className={styles.title}>Plan dnia</h3>
      {isLoading ? <p className={styles.muted}>Ładowanie trasy…</p> : null}

      <ol className={styles.list}>
        {renderStops.map((stop, index) => {
          const prev = renderStops[index - 1]
          const leg =
            !dragging && !routeBusy && flow
              ? findLegBetweenKeys(flow, prev?.key, stop.key)
              : null
          const metrics = dragging
            ? '—'
            : routeBusy
              ? '…'
              : routeStatus === 'error' || plan?.routeStale
                ? '—'
                : formatLegMetrics(leg)
          const Icon = STAGE_ICONS[stop.role] || MapPin
          const place = stopToDisplayPlace(stop)
          const display = getWeddingLocationDisplay(place)
          const mapsUrl = googleMapsPlaceUrl(place)
          const prevPlace = prev ? stopToDisplayPlace(prev) : null
          const sameAsPrevious = prevPlace ? samePlace(prevPlace, place) : false

          return (
            <li
              key={stop.key}
              className={styles.item}
              data-stop-key={stop.key}
              data-place-id={stop.reorderable ? stop.key : undefined}
              data-role={stop.role}
            >
              {index > 0 ? (
                <div
                  className={styles.leg}
                  data-testid="prewedding-travel-leg"
                  data-route-busy={routeBusy ? 'true' : undefined}
                  aria-label={
                    routeBusy
                      ? 'Przeliczamy odcinek trasy'
                      : leg?.label || 'Odcinek trasy'
                  }
                >
                  <span className={styles.timelineConnector} aria-hidden="true" />
                  <span
                    className={
                      routeBusy
                        ? `${styles.legMetrics} ${styles.legMetricsBusy}`
                        : styles.legMetrics
                    }
                  >
                    <Car
                      className={styles.legIcon}
                      aria-hidden="true"
                      size={14}
                      strokeWidth={2}
                    />
                    {metrics}
                  </span>
                  {sameAsPrevious ? (
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
                    <div className={styles.stageRow}>
                      {stop.reorderable ? (
                        <button
                          type="button"
                          className={styles.dragHandle}
                          aria-label={`Zmień kolejność: ${stop.title}`}
                          data-testid="day-plan-drag-handle"
                          onPointerDown={(e) => onHandlePointerDown(e, stop.key)}
                          onPointerMove={onHandlePointerMove}
                          onPointerUp={endDrag}
                          onPointerCancel={endDrag}
                          onKeyDown={(e) => onHandleKeyDown(e, stop.key)}
                        >
                          <GripVertical
                            size={14}
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                        </button>
                      ) : null}
                      <p className={styles.stage}>{stop.title}</p>
                    </div>
                    <OperationalTimeControl
                      time={stop.time}
                      disabled={!hasOperationalPlaces && stop.kind !== 'studio'}
                      onCommit={async (next) => {
                        await saveTime.mutateAsync({
                          stopKey: stop.key,
                          time: next,
                        })
                      }}
                    />
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

      {useTravel || hasOperationalPlaces ? (
        <TravelRouteTotals
          summary={routeBusy || routeStatus === 'error' ? null : summary}
          onRecalculate={() => void recalculate.mutateAsync()}
          recalculatePending={routeBusy}
          routeStatus={routeBusy ? 'loading' : routeStatus}
        />
      ) : null}
    </section>
  )
}
