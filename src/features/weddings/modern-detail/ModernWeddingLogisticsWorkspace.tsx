import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { TravelMap } from '@/features/travel/TravelMap'
import { isPlaceVerified } from '@/features/travel/locationVerification'
import {
  buildTravelFlow,
  getTravelBaseAddress,
  getTravelBaseDisplayName,
  getTravelBaseStatus,
  navigateToStopUrl,
  summarizeTravelRoute,
  travelLegFailureMessage,
  TRAVEL_SETTINGS_PATH,
  type TravelFlow,
  type TravelFlowLeg,
  type TravelFlowStop,
} from '@/features/travel/travelUi'
import { getOperationalOrderedPlaces } from '@/features/travel/weddingDayRouteStops'
import { getWeddingLocationItems } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import {
  travelPlanQueryKey,
  weddingPlacesQueryKey,
  withAuthoritativePlaces,
} from '@/features/wedding-day/travelPlanPlaces'
import { travelService } from '@/lib/api/travelService'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import { buildGoogleMapsNavigationUrl } from '@/services/googleMapsLinks'
import type { TravelPlan, WeddingPlace, WeddingPlaceRole } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import styles from './ModernWeddingLogisticsWorkspace.module.css'

interface Props {
  wedding: Wedding
  places: WeddingPlace[]
  onRequestVerifyLocations?: () => void
  onEditLocationRole?: (role: WeddingPlaceRole) => void
}

type ItineraryLocationRow = {
  key: string
  role: WeddingPlaceRole | string
  label: string
  address: string
  placeName: string | null
  verified: boolean
  empty: boolean
  placeId: string | null
  latitude: number | null
  longitude: number | null
  onRoute: boolean
}

function formatLegMetrics(leg: TravelFlowLeg): string | null {
  const segment = leg.segment
  if (
    !segment ||
    segment.status !== 'ok' ||
    !(segment.durationText || segment.distanceText)
  ) {
    return null
  }
  return [segment.durationText, segment.distanceText].filter(Boolean).join(' · ')
}

function stopPlaceLines(input: {
  empty?: boolean
  placeName: string | null
  address: string
}): { primary: string; secondary: string | null; muted: boolean } {
  if (input.empty) {
    return { primary: 'Nieuzupełnione', secondary: null, muted: true }
  }
  const name = input.placeName?.trim() || ''
  const address = input.address.trim()
  if (name && address && name !== address) {
    return { primary: name, secondary: address, muted: false }
  }
  return { primary: name || address, secondary: null, muted: false }
}

function LogisticsStopHead({
  role,
  primary,
  secondary,
  muted,
  hints,
  action,
}: {
  role: string
  primary: string
  secondary: string | null
  muted?: boolean
  hints?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={styles.stopHead}>
      <p className={styles.role}>{role}</p>
      <p className={muted ? styles.placeMuted : styles.place}>{primary}</p>
      {secondary ? <p className={styles.address}>{secondary}</p> : null}
      {hints}
      {action ?? <span className={styles.navSlot} aria-hidden />}
    </div>
  )
}

function findOutgoingLegByStopKey(
  flow: TravelFlow,
  originKey: string,
): TravelFlowLeg | null {
  return flow.routeLegs.find((leg) => leg.origin.key === originKey) ?? null
}

/**
 * Route order first; empty / off-route catalog locations appended.
 * Same composition rule as Classic WeddingDayWorkspace — not a second model.
 */
function buildItineraryLocationRows(
  locations: ReturnType<typeof getWeddingLocationItems>,
  flow: TravelFlow | null,
  places: WeddingPlace[],
): ItineraryLocationRow[] {
  const byRole = new Map(locations.map((loc) => [loc.role, loc]))
  const rows: ItineraryLocationRow[] = []
  const seen = new Set<string>()

  const routeWeddingStops =
    flow?.stops.filter((s) => s.kind === 'wedding_place') ?? []

  if (routeWeddingStops.length > 0) {
    for (const stop of routeWeddingStops) {
      const role = (stop.role ?? 'other') as WeddingPlaceRole
      const loc = byRole.get(role)
      seen.add(role)
      rows.push({
        key: stop.key,
        role,
        label: loc?.label ?? stop.title,
        address: loc?.address || stop.address,
        placeName: loc?.placeName ?? stop.label ?? null,
        verified: loc?.verified ?? true,
        empty: false,
        placeId: stop.placeId,
        latitude: stop.latitude,
        longitude: stop.longitude,
        onRoute: true,
      })
    }
  } else {
    for (const place of getOperationalOrderedPlaces(places)) {
      const role =
        place.role === 'preparation' ? 'bride_preparation' : place.role
      const loc = byRole.get(role)
      if (!loc || seen.has(role)) continue
      seen.add(role)
      rows.push({
        key: place.id,
        role,
        label: loc.label,
        address: loc.address,
        placeName: loc.placeName,
        verified: loc.verified,
        empty: loc.empty,
        placeId: loc.placeId,
        latitude: loc.latitude,
        longitude: loc.longitude,
        onRoute: loc.verified && !loc.empty,
      })
    }
  }

  for (const loc of locations) {
    if (seen.has(loc.role)) continue
    rows.push({
      key: `off-route-${loc.role}`,
      role: loc.role,
      label: loc.label,
      address: loc.address,
      placeName: loc.placeName,
      verified: loc.verified,
      empty: loc.empty,
      placeId: loc.placeId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      onRoute: false,
    })
  }

  return rows
}

function previewMapStops(places: WeddingPlace[]): TravelFlowStop[] {
  const ordered = getOperationalOrderedPlaces(places)
  const stops: TravelFlowStop[] = []
  let markerIndex = 1
  for (const place of ordered) {
    if (!isPlaceVerified(place)) continue
    const title = place.label?.trim() || place.formattedAddress
    stops.push({
      key: place.id,
      title,
      address: place.formattedAddress,
      label: place.label,
      placeId: place.placeId,
      latitude: place.latitude,
      longitude: place.longitude,
      kind: 'wedding_place',
      role: place.role,
      navigateLabel: title,
      isSet: true,
      markerIndex: markerIndex++,
    })
  }
  return stops
}

function TravelLeg({
  leg,
  loading,
}: {
  leg: TravelFlowLeg | null
  loading: boolean
}) {
  if (loading && !leg) {
    return (
      <p className={styles.leg} data-testid="travel-leg-loading">
        Ładowanie odcinka…
      </p>
    )
  }
  if (!leg) return null
  const metrics = formatLegMetrics(leg)
  if (metrics) {
    return (
      <p className={styles.leg} data-testid="travel-leg">
        {metrics}
      </p>
    )
  }
  return (
    <p className={styles.legMuted} data-testid="travel-leg-empty">
      {travelLegFailureMessage(leg.failureReason)}
    </p>
  )
}

/**
 * Modern Logistics — presentation of canonical wedding-day movement.
 * Places: wedding_places. Order: getOperationalOrderedPlaces. Route: travel-plan.
 */
export function ModernWeddingLogisticsWorkspace({
  wedding,
  places,
  onRequestVerifyLocations,
  onEditLocationRole,
}: Props) {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const locations = getWeddingLocationItems(wedding, places)
  const orderedPlaceIds = places.map((p) => p.id)

  const {
    data: plan,
    isPending,
    isFetching,
  } = useQuery({
    queryKey: travelPlanQueryKey(userId, wedding.id),
    queryFn: async (): Promise<TravelPlan> => {
      try {
        const next = await travelService.getPlan(wedding.id)
        const authoritative =
          queryClient.getQueryData<WeddingPlace[]>(
            weddingPlacesQueryKey(userId, wedding.id),
          ) ?? places
        return withAuthoritativePlaces(next, authoritative)
      } catch (err) {
        return {
          weddingId: wedding.id,
          studio: null,
          places,
          segments: [],
          hasError: true,
          errorMessage: getUserFacingErrorMessage(
            err,
            'Nie udało się wyliczyć trasy.',
          ),
          persistenceError: null,
        }
      }
    },
    enabled: Boolean(userId && wedding.id),
    retry: false,
  })

  const recalculate = useMutation({
    mutationFn: async () => {
      const authoritative =
        queryClient.getQueryData<WeddingPlace[]>(
          weddingPlacesQueryKey(userId, wedding.id),
        ) ?? places
      await queryClient.cancelQueries({
        queryKey: travelPlanQueryKey(userId, wedding.id),
      })
      return travelService.recalculate(wedding.id, {
        forceRefresh: true,
        places: authoritative,
        orderedPlaceIds: authoritative.map((p) => p.id),
      })
    },
    onSuccess: (next) => {
      queryClient.setQueryData(travelPlanQueryKey(userId, wedding.id), {
        ...next,
        places: [],
      })
    },
  })

  const routeSettled = !isPending
  const planForFlow = plan
    ? {
        ...plan,
        places: [] as WeddingPlace[],
        routeStale: plan.routeStale || plan.segments.length === 0,
      }
    : null
  const flow = planForFlow
    ? buildTravelFlow(planForFlow, {
        places,
        orderedPlaceIds,
      })
    : null
  const summary =
    !flow || flow.routeStale
      ? flow
        ? {
            ...summarizeTravelRoute({
              ...flow,
              routeStale: true,
              routeComplete: false,
            }),
            distanceText: '—',
            durationText: '—',
            totalsComplete: false,
          }
        : null
      : summarizeTravelRoute(flow)

  const baseStatus = plan
    ? getTravelBaseStatus(plan.studio)
    : getTravelBaseStatus(null)
  const baseTitle = getTravelBaseDisplayName(plan?.studio)
  const baseAddress = getTravelBaseAddress(plan?.studio)
  const baseOutgoingLeg = flow
    ? findOutgoingLegByStopKey(flow, 'studio')
    : null
  const itineraryRows = buildItineraryLocationRows(locations, flow, places)
  const filledPlaces = locations.filter((loc) => !loc.empty)
  const unverifiedPlaces = filledPlaces.filter((loc) => !loc.verified)
  const showStart =
    routeSettled &&
    (baseStatus === 'ready' || baseStatus === 'incomplete')
  const mapStops = flow?.hasAnyLocation
    ? flow.stops
    : !routeSettled
      ? previewMapStops(places)
      : []
  const showMap = mapStops.length > 0
  const mapLoading = !routeSettled && mapStops.length === 0
  const legsLoading = (isPending || isFetching) && !flow
  const totalsReady = Boolean(summary?.totalsComplete)
  const startLines = stopPlaceLines({
    placeName: baseTitle,
    address:
      baseAddress ||
      (baseStatus === 'incomplete' ? 'Adres niekompletny' : '—'),
  })

  return (
    <section
      className={styles.sheet}
      data-testid="modern-wedding-logistics"
      aria-labelledby="modern-logistics-heading"
    >
      <header className={styles.head}>
        <h2 id="modern-logistics-heading" className={styles.eyebrow}>
          Trasa dnia
        </h2>
        <div className={styles.headActions}>
          {onRequestVerifyLocations || onEditLocationRole ? (
            <button
              type="button"
              className={styles.quietAction}
              onClick={() => onRequestVerifyLocations?.()}
            >
              Edytuj miejsca
            </button>
          ) : null}
          <button
            type="button"
            className={styles.quietAction}
            disabled={recalculate.isPending}
            onClick={() => void recalculate.mutateAsync()}
          >
            {recalculate.isPending ? 'Przeliczanie…' : 'Przelicz trasę'}
          </button>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.plan}>
          {routeSettled && baseStatus === 'missing' ? (
            <p className={styles.notice} role="status" data-testid="travel-base-missing">
              Ustaw punkt startowy, aby doliczyć dojazd do pierwszej lokalizacji.{' '}
              <Link className={styles.inlineLink} to={TRAVEL_SETTINGS_PATH}>
                Ustawienia podróży
              </Link>
            </p>
          ) : null}

          {routeSettled && baseStatus === 'incomplete' ? (
            <p className={styles.notice} role="status" data-testid="travel-base-invalid">
              Adres punktu startowego jest niekompletny.{' '}
              <Link className={styles.inlineLink} to={TRAVEL_SETTINGS_PATH}>
                Ustawienia podróży
              </Link>
            </p>
          ) : null}

          {routeSettled && filledPlaces.length === 0 ? (
            <p className={styles.notice} role="status" data-testid="logistics-empty">
              Brakuje lokalizacji. Uzupełnij miejsca, aby wyznaczyć pełną trasę.
            </p>
          ) : null}

          {routeSettled && unverifiedPlaces.length > 0 ? (
            <p className={styles.notice} role="status" data-testid="logistics-unverified">
              Nie można jeszcze wyznaczyć pełnej trasy. Jedno z miejsc wymaga
              potwierdzenia adresu.
            </p>
          ) : null}

          {routeSettled && plan?.hasError && plan.errorMessage ? (
            <p className={styles.notice} role="status" data-testid="logistics-route-error">
              {plan.errorMessage}
            </p>
          ) : null}

          {routeSettled && plan?.persistenceError ? (
            <p className={styles.notice} role="status">
              Trasa jest widoczna, ale nie udało się zapisać odcinków. Spróbuj
              ponownie później.
            </p>
          ) : null}

          <ol className={styles.route} data-testid="wedding-itinerary">
            {showStart ? (
              <li
                className={styles.startStop}
                data-testid="travel-base-stop"
              >
                <LogisticsStopHead
                  role="Start"
                  primary={startLines.primary}
                  secondary={startLines.secondary}
                />
                <TravelLeg
                  leg={baseOutgoingLeg}
                  loading={legsLoading}
                />
                {baseStatus === 'ready' &&
                !baseOutgoingLeg &&
                itineraryRows.filter((r) => r.onRoute).length === 0 ? (
                  <p className={styles.legMuted}>
                    Brak lokalizacji dnia ślubu do wyliczenia dojazdu.
                  </p>
                ) : null}
              </li>
            ) : null}

            {itineraryRows.map((loc, index) => {
              const hasFollowingRouteStop = itineraryRows
                .slice(index + 1)
                .some((row) => row.onRoute)
              const outgoing =
                flow && loc.onRoute
                  ? findOutgoingLegByStopKey(flow, loc.key)
                  : null
              const omittedFromRoute =
                !loc.empty &&
                !loc.onRoute &&
                flow != null &&
                flow.hasAnyLocation
              const navUrl =
                !loc.empty && loc.verified
                  ? buildGoogleMapsNavigationUrl({
                      formattedAddress: loc.address,
                      label: loc.placeName,
                      placeId: loc.placeId,
                      latitude: loc.latitude,
                      longitude: loc.longitude,
                    })
                  : null
              const flowStop = flow?.stops.find((s) => s.key === loc.key)
              const flowNav =
                flowStop && loc.verified ? navigateToStopUrl(flowStop) : null
              const href = flowNav || navUrl
              const lines = stopPlaceLines({
                empty: loc.empty,
                placeName: loc.placeName,
                address: loc.address,
              })
              const hints =
                !loc.empty && (!loc.verified || omittedFromRoute) ? (
                  <div className={styles.hints}>
                    {!loc.verified ? (
                      <p className={styles.hint}>Wymaga potwierdzenia adresu</p>
                    ) : null}
                    {omittedFromRoute ? (
                      <p
                        className={styles.hint}
                        data-testid={`travel-skipped-${loc.role}`}
                      >
                        Pominięto w trasie — brak ważnych współrzędnych
                      </p>
                    ) : null}
                  </div>
                ) : null

              return (
                <li key={loc.key} className={styles.stop}>
                  <LogisticsStopHead
                    role={loc.label}
                    primary={lines.primary}
                    secondary={lines.secondary}
                    muted={lines.muted}
                    hints={hints}
                    action={
                      href ? (
                        <a
                          className={styles.navLink}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Nawiguj do: ${loc.label}`}
                          data-testid={`travel-nav-${loc.role}`}
                        >
                          Nawiguj
                        </a>
                      ) : undefined
                    }
                  />
                  <TravelLeg
                    leg={outgoing}
                    loading={Boolean(
                      loc.onRoute &&
                        hasFollowingRouteStop &&
                        (legsLoading || (isPending && !outgoing)),
                    )}
                  />
                </li>
              )
            })}
          </ol>

          <p
            className={styles.totals}
            data-testid="modern-logistics-totals"
          >
            {recalculate.isPending ? (
              <span>Przeliczamy trasę…</span>
            ) : !routeSettled ? (
              <span>Ładowanie trasy…</span>
            ) : totalsReady && summary ? (
              <span>
                <span data-testid="travel-total-distance">
                  {summary.distanceText}
                </span>
                {' · '}
                <span data-testid="travel-total-duration">
                  {summary.durationText}
                </span>
                {' w trasie'}
              </span>
            ) : (
              <span>
                <span data-testid="travel-total-distance">—</span>
                {' · '}
                <span data-testid="travel-total-duration">—</span>
              </span>
            )}
          </p>
        </div>

        <div className={styles.mapCol}>
          {showMap ? (
            <div className={styles.mapWell}>
              <TravelMap stops={mapStops} size="logistics" />
            </div>
          ) : mapLoading ? (
            <div
              className={styles.mapPending}
              role="status"
              aria-live="polite"
              data-testid="logistics-map-loading"
            >
              Ładowanie mapy…
            </div>
          ) : (
            <div className={styles.mapEmpty} data-testid="logistics-map-empty">
              <p>
                {filledPlaces.length === 0
                  ? 'Uzupełnij miejsca, aby zobaczyć trasę na mapie.'
                  : 'Mapa pojawi się po potwierdzeniu lokalizacji z współrzędnymi.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
