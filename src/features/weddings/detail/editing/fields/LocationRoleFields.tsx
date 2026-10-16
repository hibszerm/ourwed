import { useQuery } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { useWeddingLocationSave } from '@/features/weddings/detail/editing/useWeddingLocationSave'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import type { WeddingPlaceRole } from '@/types/travel'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import { LocationRoleFieldsPresentation } from './LocationRoleFieldsPresentation'

export function LocationRoleFields({
  weddingId,
  roles,
}: {
  weddingId: string
  roles?: WeddingPlaceRole[]
}) {
  const userId = useStudioAuthId()
  const { data: places = [], isLoading } = useQuery({
    queryKey: ['wedding-places', userId, weddingId],
    queryFn: () => weddingPlaceService.listByWeddingId(weddingId),
    enabled: Boolean(userId && weddingId),
  })
  const saveMutation = useWeddingLocationSave(weddingId)
  return <LocationRoleFieldsPresentation
    places={places}
    roles={roles}
    loading={isLoading}
    disabled={saveMutation.isPending}
    onSave={async (role, place) => { await saveMutation.mutateAsync({ role, place }) }}
    error={saveMutation.isError ? saveMutation.error instanceof Error
      ? getUserFacingErrorMessage(saveMutation.error, 'Nie udało się zapisać lokalizacji.')
      : 'Nie udało się zapisać lokalizacji.' : null}
  />
}
