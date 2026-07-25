import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { TravelMap } from '@/features/travel/TravelMap'
import {
  buildTravelFlow,
  navigateToStopUrl,
  sumTravelTotals,
} from '@/features/travel/travelUi'
import {
  getWeddingLocationItems,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { travelService } from '@/lib/api/travelService'
import { buildGoogleMapsNavigationUrl } from '@/services/googleMapsLinks'
import type { TravelPlan, WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface WeddingDayWorkspaceProps {
  wedding: Wedding
  places: WeddingPlace[]
  onRequestVerifyLocations?: () => void
}

export function WeddingDayWorkspace({
  wedding,
  places,
  onRequestVerifyLocations,
}: WeddingDayWorkspaceProps) {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const locations = getWeddingLocationItems(wedding, places)

  const { data: plan, isLoading } = useQuery({
    queryKey: ['travel-plan', userId, wedding.id],
    queryFn: async (): Promise<TravelPlan> => {
      try {
        return await travelService.getPlan(wedding.id)
      } catch {
        return {
          weddingId: wedding.id,
          studio: null,
          places: [],
          segments: [],
          hasError: true,
          errorMessage: 'Nie udało się wyliczyć trasy.',
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
  const okSegments =
    plan?.segments.filter(
      (s) => s.status === 'ok' && s.distanceMeters != null,
    ) ?? []
  const totals = sumTravelTotals(okSegments)

  function legBetween(fromRole: string, toRole: string) {
    if (!flow) return null
    const fromIdx = flow.stops.findIndex((s) => s.role === fromRole)
    const toIdx = flow.stops.findIndex((s) => s.role === toRole)
    if (fromIdx < 0 || toIdx !== fromIdx + 1) return null
    return flow.legs[fromIdx] ?? null
  }

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
            <ol className={styles.itinerary} data-testid="wedding-itinerary">
              {locations.map((loc, index) => {
                const next = locations[index + 1]
                const leg = next ? legBetween(loc.role, next.role) : null
                const navUrl = !loc.empty
                  ? buildGoogleMapsNavigationUrl({
                      placeId: loc.placeId,
                      latitude: loc.latitude,
                      longitude: loc.longitude,
                      formattedAddress: loc.address,
                    })
                  : null
                const flowStop = flow?.stops.find((s) => s.role === loc.role)
                const flowNav = flowStop ? navigateToStopUrl(flowStop) : null
                const href = flowNav || navUrl

                return (
                  <li key={loc.role} className={styles.itineraryStop}>
                    <div className={styles.itineraryMarker} aria-hidden>
                      <span className={styles.itineraryDot} />
                      {index < locations.length - 1 ? (
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
                          {onRequestVerifyLocations ? (
                            <button
                              type="button"
                              className={styles.textAction}
                              onClick={onRequestVerifyLocations}
                            >
                              Edytuj
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {leg &&
                      leg.status === 'ok' &&
                      (leg.durationText || leg.distanceText) ? (
                        <p className={styles.itineraryLeg}>
                          {[leg.durationText, leg.distanceText]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      ) : next ? (
                        <p className={styles.itineraryLegMuted}>—</p>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          <div className={styles.routeSummary}>
            <div>
              <span className={styles.bandLabel}>Łączny dystans</span>
              <p className={styles.bandValue}>
                {okSegments.length > 0 ? totals.distanceText : '—'}
              </p>
            </div>
            <div>
              <span className={styles.bandLabel}>Szacowany czas jazdy</span>
              <p className={styles.bandValue}>
                {okSegments.length > 0 ? totals.durationText : '—'}
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
          {flow && flow.hasAnyLocation ? (
            <div className={styles.mapSticky}>
              <TravelMap stops={flow.stops} />
            </div>
          ) : (
            <div className={styles.mapEmpty}>
              <p className={styles.contextMuted}>
                Mapa pojawi się po weryfikacji lokalizacji z współrzędnymi.
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
