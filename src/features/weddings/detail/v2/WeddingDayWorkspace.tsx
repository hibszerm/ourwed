import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { TravelMap } from '@/features/travel/TravelMap'
import {
  buildTravelFlow,
  getTravelBaseAddress,
  getTravelBaseDisplayName,
  getTravelBaseStatus,
  navigateToStopUrl,
  summarizeTravelRoute,
  TRAVEL_SETTINGS_PATH,
  type TravelFlow,
  type TravelFlowLeg,
} from '@/features/travel/travelUi'
import {
  getWeddingLocationItems,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { travelService } from '@/lib/api/travelService'
import { buildGoogleMapsNavigationUrl } from '@/services/googleMapsLinks'
import type { TravelPlan, WeddingPlace, WeddingPlaceRole } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface WeddingDayWorkspaceProps {
  wedding: Wedding
  places: WeddingPlace[]
  onRequestVerifyLocations?: () => void
  /** Per-role location editor (V2 drawer). */
  onEditLocationRole?: (role: WeddingPlaceRole) => void
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

function LegBlock({ leg }: { leg: TravelFlowLeg }) {
  const metrics = formatLegMetrics(leg)
  if (metrics) {
    return (
      <div className={styles.itineraryLegBlock} data-testid="travel-leg">
        <p className={styles.itineraryLegRoute}>{leg.label}</p>
        <p className={styles.itineraryLeg}>{metrics}</p>
      </div>
    )
  }
  return (
    <div className={styles.itineraryLegBlock} data-testid="travel-leg-empty">
      <p className={styles.itineraryLegRoute}>{leg.label}</p>
      <p className={styles.itineraryLegMuted}>—</p>
    </div>
  )
}

function findOutgoingLeg(
  flow: TravelFlow,
  originRole: string,
): TravelFlowLeg | null {
  return (
    flow.routeLegs.find((leg) => leg.origin.role === originRole) ?? null
  )
}

export function WeddingDayWorkspace({
  wedding,
  places,
  onRequestVerifyLocations,
  onEditLocationRole,
}: WeddingDayWorkspaceProps) {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const locations = getWeddingLocationItems(wedding, places)

  const { data: plan, isLoading } = useQuery({
    queryKey: ['travel-plan', userId, wedding.id],
    queryFn: async (): Promise<TravelPlan> => {
      try {
        return await travelService.getPlan(wedding.id)
      } catch (err) {
        // Keep verified wedding places so the map can still render.
        // Persistence soft-fails inside getPlan (persistenceError); this catch
        // is for hard failures (auth, places load, etc.).
        return {
          weddingId: wedding.id,
          studio: null,
          places,
          segments: [],
          hasError: true,
          errorMessage:
            err instanceof Error && err.message.trim()
              ? err.message
              : 'Nie udało się wyliczyć trasy.',
          persistenceError: null,
        }
      }
    },
    enabled: Boolean(userId && wedding.id),
    retry: false,
  })

  const recalculate = useMutation({
    mutationFn: () =>
      travelService.recalculate(wedding.id, { forceRefresh: true }),
    onSuccess: async (next) => {
      queryClient.setQueryData(['travel-plan', userId, wedding.id], next)
      await queryClient.invalidateQueries({ queryKey: ['travel-plan'] })
    },
  })

  const flow = plan ? buildTravelFlow(plan) : null
  const summary = flow ? summarizeTravelRoute(flow) : null
  const baseStatus = plan
    ? getTravelBaseStatus(plan.studio)
    : getTravelBaseStatus(null)
  const baseTitle = getTravelBaseDisplayName(plan?.studio)
  const baseAddress = getTravelBaseAddress(plan?.studio)
  const baseStop = flow?.stops.find((s) => s.kind === 'studio') ?? null
  const baseOutgoingLeg = flow ? findOutgoingLeg(flow, 'studio') : null
  const routeRoles = new Set(
    flow?.stops.filter((s) => s.kind === 'wedding_place').map((s) => s.role) ??
      [],
  )

  return (
    <div
      className={styles.dayWorkspace}
      data-testid="wedding-day-workspace"
    >
      <div className={styles.dayLayout}>
        <div className={styles.itineraryCol}>
          <h2 className={styles.sectionHeading}>Plan dnia</h2>
          {isLoading ? (
            <p className={styles.contextMuted}>Ładowanie trasy…</p>
          ) : (
            <>
              {baseStatus === 'missing' ? (
                <div
                  className={styles.travelBaseNotice}
                  role="status"
                  data-testid="travel-base-missing"
                >
                  <p className={styles.travelBaseNoticeText}>
                    Ustaw bazę podróży, aby obliczyć dojazd do pierwszej
                    lokalizacji.
                  </p>
                  <Link
                    className={styles.textAction}
                    to={TRAVEL_SETTINGS_PATH}
                  >
                    Ustawienia podróży
                  </Link>
                </div>
              ) : null}

              {baseStatus === 'incomplete' ? (
                <div
                  className={styles.travelBaseNotice}
                  role="status"
                  data-testid="travel-base-invalid"
                >
                  <p className={styles.travelBaseNoticeText}>
                    Nie można użyć adresu bazy do obliczenia trasy. Sprawdź
                    adres w ustawieniach podróży.
                  </p>
                  <Link
                    className={styles.textAction}
                    to={TRAVEL_SETTINGS_PATH}
                  >
                    Ustawienia podróży
                  </Link>
                </div>
              ) : null}

              <ol className={styles.itinerary} data-testid="wedding-itinerary">
                {baseStatus === 'ready' || baseStatus === 'incomplete' ? (
                  <li
                    className={`${styles.itineraryStop} ${styles.itineraryStopStart}`}
                    data-testid="travel-base-stop"
                  >
                    <div className={styles.itineraryMarker} aria-hidden>
                      <span
                        className={`${styles.itineraryDot} ${styles.itineraryDotStart}`}
                      />
                      <span className={styles.itineraryLine} />
                    </div>
                    <div className={styles.itineraryBody}>
                      <div className={styles.itineraryHeader}>
                        <div>
                          <p className={styles.itineraryStartLabel}>Start</p>
                          <p className={styles.itineraryRole}>{baseTitle}</p>
                          <p className={styles.itineraryAddress}>
                            {baseAddress ||
                              (baseStatus === 'incomplete'
                                ? 'Adres niekompletny'
                                : '—')}
                          </p>
                        </div>
                        <div className={styles.itineraryActions}>
                          <Link
                            className={styles.textAction}
                            to={TRAVEL_SETTINGS_PATH}
                          >
                            Ustawienia podróży
                          </Link>
                        </div>
                      </div>
                      {baseOutgoingLeg ? (
                        <LegBlock leg={baseOutgoingLeg} />
                      ) : baseStatus === 'ready' &&
                        (flow?.stops.length ?? 0) <= 1 ? (
                        <p className={styles.itineraryLegMuted}>
                          Brak lokalizacji dnia ślubu do wyliczenia dojazdu.
                        </p>
                      ) : null}
                    </div>
                  </li>
                ) : null}

                {locations.map((loc, index) => {
                  const outgoing = flow
                    ? findOutgoingLeg(flow, loc.role)
                    : null
                  const omittedFromRoute =
                    !loc.empty &&
                    flow != null &&
                    flow.hasAnyLocation &&
                    !routeRoles.has(loc.role)
                  const navUrl = !loc.empty
                    ? buildGoogleMapsNavigationUrl({
                        formattedAddress: loc.address,
                        label: loc.placeName,
                        placeId: loc.placeId,
                        latitude: loc.latitude,
                        longitude: loc.longitude,
                      })
                    : null
                  const flowStop = flow?.stops.find((s) => s.role === loc.role)
                  const flowNav = flowStop ? navigateToStopUrl(flowStop) : null
                  const href = flowNav || navUrl
                  const isLast = index === locations.length - 1

                  return (
                    <li key={loc.role} className={styles.itineraryStop}>
                      <div className={styles.itineraryMarker} aria-hidden>
                        <span className={styles.itineraryDot} />
                        {!isLast ? (
                          <span className={styles.itineraryLine} />
                        ) : null}
                      </div>
                      <div className={styles.itineraryBody}>
                        <div className={styles.itineraryHeader}>
                          <div>
                            <p className={styles.itineraryRole}>{loc.label}</p>
                            <p className={styles.itineraryAddress}>
                              {loc.empty
                                ? 'Nieuzupełnione'
                                : loc.placeName || loc.address}
                            </p>
                            {!loc.empty && loc.placeName ? (
                              <p className={styles.contextMuted}>{loc.address}</p>
                            ) : null}
                            {!loc.empty ? (
                              <p
                                className={
                                  loc.verified
                                    ? styles.verifiedHint
                                    : styles.verifyHint
                                }
                              >
                                {loc.verified
                                  ? 'Zweryfikowano'
                                  : 'Wymaga weryfikacji'}
                              </p>
                            ) : null}
                            {omittedFromRoute ? (
                              <p
                                className={styles.verifyHint}
                                data-testid={`travel-skipped-${loc.role}`}
                              >
                                Pominięto w trasie — brak ważnych współrzędnych
                              </p>
                            ) : null}
                          </div>
                          <div className={styles.itineraryActions}>
                            {href ? (
                              <a
                                className={styles.textAction}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Nawiguj do: ${loc.label}`}
                                data-testid={`travel-nav-${loc.role}`}
                              >
                                Nawiguj
                              </a>
                            ) : null}
                            {onEditLocationRole || onRequestVerifyLocations ? (
                              <button
                                type="button"
                                className={styles.textAction}
                                onClick={() => {
                                  if (onEditLocationRole) {
                                    onEditLocationRole(
                                      loc.role as WeddingPlaceRole,
                                    )
                                    return
                                  }
                                  onRequestVerifyLocations?.()
                                }}
                              >
                                Edytuj
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {outgoing ? <LegBlock leg={outgoing} /> : null}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </>
          )}

          <div className={styles.routeSummary}>
            <div>
              <span className={styles.bandLabel}>
                {summary?.distanceLabel ?? 'Łączny dystans'}
              </span>
              <p className={styles.bandValue}>
                {summary && summary.okSegments.length > 0
                  ? summary.distanceText
                  : '—'}
              </p>
              {summary &&
              summary.okSegments.length > 0 &&
              !summary.isCompleteDayRoute ? (
                <p className={styles.routeSummaryHint}>
                  Bez dojazdu z bazy firmy
                </p>
              ) : null}
            </div>
            <div>
              <span className={styles.bandLabel}>
                {summary?.durationLabel ?? 'Szacowany czas jazdy'}
              </span>
              <p className={styles.bandValue}>
                {summary && summary.okSegments.length > 0
                  ? summary.durationText
                  : '—'}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={recalculate.isPending}
              onClick={() => void recalculate.mutateAsync()}
            >
              {recalculate.isPending ? 'Przeliczanie…' : 'Przelicz trasę'}
            </Button>
          </div>
        </div>

        <div className={styles.mapCol}>
          {plan?.persistenceError ? (
            <p className={styles.persistWarn} role="status">
              Trasa jest widoczna, ale nie udało się zapisać odcinków. Spróbuj
              ponownie później.
            </p>
          ) : null}
          {flow && flow.hasAnyLocation ? (
            <div className={styles.mapSticky}>
              {/* Coordinates drive the map; segment persistence is independent. */}
              <TravelMap stops={flow.stops} />
            </div>
          ) : (
            <div className={styles.mapEmpty}>
              <p className={styles.contextMuted}>
                {baseStop
                  ? 'Dodaj zweryfikowane lokalizacje dnia ślubu, aby zobaczyć trasę na mapie.'
                  : 'Mapa pojawi się po weryfikacji lokalizacji z współrzędnymi.'}
              </p>
              {onRequestVerifyLocations ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onRequestVerifyLocations}
                >
                  Zweryfikuj lokalizacje
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
