import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { invalidateFinanceQueries } from '@/features/finance/invalidateFinanceQueries'
import {
  travelPlanQueryKey,
  weddingPlacesQueryKey,
} from '@/features/wedding-day/queryKeys'
import {
  buildTravelFeeRoundTripRecommendation,
  fetchTravelFeeReturnLegMeters,
  summarizeOutboundTravelFeeDistance,
} from '@/features/travel/travelFeeRouteRecommendation'
import { getOperationalOrderedPlaces } from '@/features/travel/weddingDayRouteStops'
import { studioTravelSettingsService } from '@/lib/api/studioTravelSettingsService'
import { travelService } from '@/lib/api/travelService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingTravelFeeService } from '@/lib/api/weddingTravelFeeService'
import type { TravelPlan } from '@/types/travel'
import { formatCurrency } from '@/lib/utils/currency'
import {
  getTravelFeeContractGuardLevel,
  metersToDisplayKm,
  travelFeeContractGuardMessage,
  type TravelFeeStatus,
} from '@/lib/utils/travelFeeCommercial'
import type { Wedding } from '@/types/wedding'
import type { WeddingExtraService as ExtraRow } from '@/types/package'
import editStyles from '@/features/weddings/edit/WeddingEdit.module.css'
import styles from '@/features/weddings/detail/editing/WeddingEditorFields.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

type Mode = 'charge' | 'included'

function TravelFeeResolveForm({
  wedding,
  extras,
  onClose,
  onSaved,
}: {
  wedding: Wedding
  extras: ExtraRow[]
  onClose: () => void
  onSaved: (wedding: Wedding) => void
}) {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const [mode, setMode] = useState<Mode>(
    wedding.travelFeeStatus === 'included' ? 'included' : 'charge',
  )
  const [amount, setAmount] = useState(
    wedding.travelFeeStatus === 'charged'
      ? String(wedding.travelFeeAmount ?? '')
      : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmedGuard, setConfirmedGuard] = useState(false)

  const { data: studioSettings } = useQuery({
    queryKey: ['studio-travel-settings', userId],
    queryFn: () => studioTravelSettingsService.get(),
    enabled: Boolean(userId),
  })

  const placesKey = weddingPlacesQueryKey(userId, wedding.id)
  const travelKey = travelPlanQueryKey(userId, wedding.id)

  const { data: places = [], isLoading: placesLoading } = useQuery({
    queryKey: placesKey,
    queryFn: () => weddingPlaceService.listByWeddingId(wedding.id),
    enabled: Boolean(userId),
    retry: false,
  })

  // Shared travel-plan cache intentionally strips plan.places (Cockpit / Plan dnia).
  // Travel Fee must use wedding-places as the place SoT — never plan.places alone.
  const { data: travelPlan, isLoading: planLoading } = useQuery({
    queryKey: travelKey,
    queryFn: async (): Promise<TravelPlan> => {
      const next = await travelService.getPlan(wedding.id, {
        forceRefresh: false,
      })
      return { ...next, places: [] }
    },
    enabled: Boolean(userId),
    retry: false,
  })

  const orderedPlaces = getOperationalOrderedPlaces(places)
  const routeAuthorityReady = Boolean(travelPlan) && !placesLoading
  const outbound =
    travelPlan && routeAuthorityReady
      ? summarizeOutboundTravelFeeDistance(travelPlan, {
          places: orderedPlaces,
          orderedPlaceIds: orderedPlaces.map((p) => p.id),
        })
      : null

  const canFetchReturn =
    Boolean(outbound?.outboundComplete) &&
    outbound?.lastLat != null &&
    outbound?.lastLng != null &&
    outbound?.studioLat != null &&
    outbound?.studioLng != null

  const returnQuery = useQuery({
    queryKey: [
      'travel-fee-return-leg',
      wedding.id,
      outbound?.routeFingerprint,
      outbound?.lastPlaceId,
    ],
    queryFn: async () => {
      if (
        outbound?.lastLat == null ||
        outbound.lastLng == null ||
        outbound.studioLat == null ||
        outbound.studioLng == null
      ) {
        return null
      }
      const lastPlace = orderedPlaces.find((p) => p.id === outbound.lastPlaceId)
      return fetchTravelFeeReturnLegMeters({
        lastLat: outbound.lastLat,
        lastLng: outbound.lastLng,
        lastPlaceId: lastPlace?.placeId,
        lastAddress: lastPlace?.formattedAddress,
        studioLat: outbound.studioLat,
        studioLng: outbound.studioLng,
        studioPlaceId: travelPlan?.studio?.placeId,
        studioAddress: travelPlan?.studio?.formattedAddress,
      })
    },
    enabled: canFetchReturn,
    staleTime: 5 * 60_000,
  })

  const recommendation = buildTravelFeeRoundTripRecommendation({
    outboundComplete: Boolean(outbound?.outboundComplete),
    outboundMeters: outbound?.outboundMeters ?? 0,
    returnMeters: returnQuery.data ?? null,
    freeDistanceKm: studioSettings?.freeDistanceKm,
    status: 'unresolved',
    routeFingerprint: outbound?.routeFingerprint ?? null,
    lastPlaceId: outbound?.lastPlaceId ?? null,
    canFetchReturn,
  })
  const routeHintLoading = placesLoading || planLoading

  const guardLevel = getTravelFeeContractGuardLevel(wedding.contract.status)
  const guardMessage = travelFeeContractGuardMessage(guardLevel)

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (guardLevel !== 'none' && !confirmedGuard) {
        throw new Error('CONFIRMATION_REQUIRED')
      }
      const status: TravelFeeStatus =
        mode === 'included' ? 'included' : 'charged'
      const parsed =
        mode === 'included'
          ? 0
          : Math.max(0, Number(amount.replace(',', '.')) || 0)
      return weddingTravelFeeService.resolve({
        weddingId: wedding.id,
        status,
        amount: parsed,
        freeKmSnapshot: studioSettings?.freeDistanceKm ?? null,
        routeDistanceMSnapshot: recommendation.roundTripMeters,
        note: null,
      })
    },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['weddings'] })
      await invalidateFinanceQueries(queryClient)
      queryClient.setQueryData(
        ['weddings', userId, wedding.id],
        (prev: unknown) => {
          if (!prev || typeof prev !== 'object') return updated
          return {
            ...(prev as Wedding),
            ...updated,
            payments: (prev as Wedding).payments,
            contract: (prev as Wedding).contract,
          }
        },
      )
      onSaved(updated)
      onClose()
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'CONFIRMATION_REQUIRED') {
        setError('Potwierdź świadomą zmianę wartości zlecenia.')
        return
      }
      if (
        err instanceof Error &&
        err.message === 'CHARGED_REQUIRES_POSITIVE_AMOUNT'
      ) {
        setError('Podaj kwotę większą od zera albo wybierz dojazd w cenie.')
        return
      }
      setError(
        getUserFacingErrorMessage(err, 'Nie udało się zapisać kosztu dojazdu.'),
      )
    },
  })

  const extrasTotal = extras.reduce(
    (sum, e) => sum + e.priceSnapshot * e.quantity,
    0,
  )
  const nextStatus: TravelFeeStatus =
    mode === 'included' ? 'included' : 'charged'
  const nextAmount =
    mode === 'included'
      ? 0
      : Math.max(0, Number(amount.replace(',', '.')) || 0)
  const draftValid = weddingTravelFeeService.isDraftValid({
    nextStatus,
    nextAmount,
  })
  const preview = weddingTravelFeeService.previewContractValue({
    wedding,
    extrasTotal,
    nextStatus,
    nextAmount,
  })
  const amountHint =
    mode === 'charge' && !draftValid
      ? 'Podaj kwotę większą od zera albo wybierz dojazd w cenie.'
      : null
  const canSave =
    draftValid &&
    (guardLevel === 'none' || confirmedGuard) &&
    !saveMutation.isPending

  return (
    <Modal
      open
      title="Koszt dojazdu"
      description="Ustal opłatę za dojazd dla tego zlecenia. Trasa operacyjna nie jest źródłem ceny."
      onClose={onClose}
      busy={saveMutation.isPending}
      primaryAction={
        <Button
          type="button"
          variant="primary"
          disabled={!canSave}
          onClick={() => {
            if (!draftValid) {
              setError(
                'Podaj kwotę większą od zera albo wybierz dojazd w cenie.',
              )
              return
            }
            void saveMutation.mutateAsync()
          }}
          data-testid="travel-fee-save"
        >
          {saveMutation.isPending ? 'Zapisywanie…' : 'Zapisz'}
        </Button>
      }
    >
      <div className={styles.fieldGrid} data-testid="travel-fee-resolve-modal">
        {routeHintLoading ? (
          <p className={styles.muted} data-testid="travel-fee-route-loading">
            Sprawdzam trasę…
          </p>
        ) : recommendation.roundTripKm != null &&
          recommendation.freeDistanceKm != null ? (
          <p className={styles.muted} data-testid="travel-fee-suggestion">
            {recommendation.suggestion === 'included'
              ? 'Trasa mieści się w Twoim bezpłatnym limicie. '
              : null}
            Łącznie: {recommendation.roundTripKm} km · bezpłatnie do{' '}
            {recommendation.freeDistanceKm} km
            {recommendation.suggestion === 'included' ? (
              <>
                {' '}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMode('included')}
                >
                  Ustaw „Dojazd w cenie”
                </Button>
              </>
            ) : null}
          </p>
        ) : recommendation.outboundComplete ? (
          <p className={styles.muted}>
            Dystans w jedną stronę:{' '}
            {metersToDisplayKm(recommendation.outboundMeters)} km
            {returnQuery.isFetching
              ? ' · doliczam powrót…'
              : ' · brak pełnego dystansu powrotnego'}
          </p>
        ) : (
          <p className={styles.muted} data-testid="travel-fee-route-incomplete">
            Brak kompletnej trasy — ustal koszt ręcznie.
          </p>
        )}

        <label className={styles.muted}>
          <input
            type="checkbox"
            checked={mode === 'included'}
            onChange={(e) => {
              setMode(e.target.checked ? 'included' : 'charge')
              if (e.target.checked) setAmount('')
              setError(null)
            }}
            data-testid="travel-fee-included"
          />{' '}
          Dojazd w cenie — nie pobieram dodatkowej opłaty
        </label>

        {mode === 'charge' ? (
          <Input
            label="Koszt dojazdu (zł)"
            type="number"
            min={0}
            step="1"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setError(null)
            }}
            data-testid="travel-fee-amount"
          />
        ) : null}

        {amountHint ? (
          <p className={styles.muted} data-testid="travel-fee-amount-hint">
            {amountHint}
          </p>
        ) : null}

        <p className={styles.muted} data-testid="travel-fee-preview">
          Nowa wartość zlecenia:{' '}
          {preview == null ? '—' : formatCurrency(preview)}
        </p>

        {guardMessage ? (
          <div
            className={styles.listItem}
            data-testid="travel-fee-contract-guard"
          >
            <p className={styles.muted}>{guardMessage}</p>
            <label className={styles.muted}>
              <input
                type="checkbox"
                checked={confirmedGuard}
                onChange={(e) => setConfirmedGuard(e.target.checked)}
                data-testid="travel-fee-contract-confirm"
              />{' '}
              Rozumiem i potwierdzam zmianę wartości w OurWed
            </label>
          </div>
        ) : null}

        {error ? <p className={editStyles.dangerText}>{error}</p> : null}
      </div>
    </Modal>
  )
}

export function TravelFeeResolveModal({
  open,
  wedding,
  extras,
  onClose,
  onSaved,
}: {
  open: boolean
  wedding: Wedding
  extras: ExtraRow[]
  onClose: () => void
  onSaved: (wedding: Wedding) => void
}) {
  if (!open) return null
  return (
    <TravelFeeResolveForm
      key={`${wedding.id}:${wedding.travelFeeStatus}:${wedding.travelFeeAmount ?? 0}`}
      wedding={wedding}
      extras={extras}
      onClose={onClose}
      onSaved={onSaved}
    />
  )
}
