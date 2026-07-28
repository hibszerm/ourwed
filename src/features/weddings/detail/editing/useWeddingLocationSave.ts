import { useMutation, useQueryClient } from '@tanstack/react-query'
import { travelService } from '@/lib/api/travelService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { didWeddingLocationRouteChange } from '@/features/travel/weddingLocationModel'
import type { GeoPlace, WeddingPlaceRole } from '@/types/travel'

/** Shared location upsert + travel refresh (no presentation). */
export function useWeddingLocationSave(weddingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      role: WeddingPlaceRole
      place: GeoPlace | null
    }) => {
      const existing = await weddingPlaceService.getByRole(
        weddingId,
        input.role,
      )
      if (!input.place) {
        await weddingPlaceService.removeByRole(weddingId, input.role)
        return { routeChanged: Boolean(existing) }
      }
      await weddingPlaceService.upsert({
        weddingId,
        role: input.role,
        place: input.place,
        addressText: input.place.formattedAddress,
        resolve: false,
      })
      return {
        routeChanged: didWeddingLocationRouteChange(existing, input.place),
      }
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wedding-places'] }),
        queryClient.invalidateQueries({ queryKey: ['weddings'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      if (!result?.routeChanged) return
      try {
        await travelService.recalculate(weddingId)
        await queryClient.invalidateQueries({ queryKey: ['travel-plan'] })
      } catch {
        // Place save already succeeded; travel cache is best-effort.
      }
    },
  })
}
