import { useMutation, useQueryClient } from '@tanstack/react-query'
import { travelService } from '@/lib/api/travelService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import type { GeoPlace, WeddingPlaceRole } from '@/types/travel'

/** Shared location upsert + travel refresh (no presentation). */
export function useWeddingLocationSave(weddingId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      role: WeddingPlaceRole
      place: GeoPlace | null
    }) => {
      if (!input.place) {
        await weddingPlaceService.removeByRole(weddingId, input.role)
      } else {
        await weddingPlaceService.upsert({
          weddingId,
          role: input.role,
          place: input.place,
          addressText: input.place.formattedAddress,
          resolve: false,
        })
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wedding-places'] }),
        queryClient.invalidateQueries({ queryKey: ['weddings'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      try {
        await travelService.recalculate(weddingId)
        await queryClient.invalidateQueries({ queryKey: ['travel-plan'] })
      } catch {
        // Place save already succeeded; travel cache is best-effort.
      }
    },
  })
}
