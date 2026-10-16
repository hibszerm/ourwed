import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { travelPlanQueryKey, weddingPlacesQueryKey, withAuthoritativePlaces } from '@/features/wedding-day/travelPlanPlaces'
import { travelService } from '@/lib/api/travelService'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import type { TravelPlan, WeddingPlace, WeddingPlaceRole } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import { CanonicalWeddingLogisticsPresentation } from './CanonicalWeddingLogisticsPresentation'

interface Props {
  wedding: Wedding
  places: WeddingPlace[]
  onRequestVerifyLocations?: () => void
  onEditLocationRole?: (role: WeddingPlaceRole) => void
}

/** Owner-only Logistics data and mutation adapter. */
export function ModernWeddingLogisticsWorkspace({
  wedding,
  places,
  onRequestVerifyLocations,
  onEditLocationRole,
}: Props) {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const planQuery = useQuery({
    queryKey: travelPlanQueryKey(userId, wedding.id),
    queryFn: async (): Promise<TravelPlan> => {
      try {
        const next = await travelService.getPlan(wedding.id)
        const authoritative = queryClient.getQueryData<WeddingPlace[]>(weddingPlacesQueryKey(userId, wedding.id)) ?? places
        return withAuthoritativePlaces(next, authoritative)
      } catch (err) {
        return { weddingId: wedding.id, studio: null, places, segments: [], hasError: true,
          errorMessage: getUserFacingErrorMessage(err, 'Nie udało się wyliczyć trasy.'), persistenceError: null }
      }
    },
    enabled: Boolean(userId && wedding.id),
    retry: false,
  })
  const recalculate = useMutation({
    mutationFn: async () => {
      const authoritative = queryClient.getQueryData<WeddingPlace[]>(weddingPlacesQueryKey(userId, wedding.id)) ?? places
      await queryClient.cancelQueries({ queryKey: travelPlanQueryKey(userId, wedding.id) })
      return travelService.recalculate(wedding.id, { forceRefresh: true, places: authoritative,
        orderedPlaceIds: authoritative.map((place) => place.id) })
    },
    onSuccess: (next) => queryClient.setQueryData(travelPlanQueryKey(userId, wedding.id), { ...next, places: [] }),
  })
  return <CanonicalWeddingLogisticsPresentation
    wedding={wedding} places={places} plan={planQuery.data ?? null}
    loading={planQuery.isPending} fetching={planQuery.isFetching} canEdit
    onEdit={onRequestVerifyLocations} onEditLocationRole={onEditLocationRole} shared={false}
    recalculating={recalculate.isPending} onRecalculate={() => recalculate.mutateAsync()}
  />
}
