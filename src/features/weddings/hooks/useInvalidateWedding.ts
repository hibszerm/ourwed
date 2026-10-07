import { useQueryClient } from '@tanstack/react-query'
import { invalidateFinanceQueries } from '@/features/finance/invalidateFinanceQueries'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'

/** Invalidate wedding detail, list, dashboard, Calendar, and Finance after a studio action. */
export function useInvalidateWedding() {
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()

  return async function invalidateWedding(weddingId: string) {
    await Promise.all([
      // Prefix match covers ['weddings', userId] and ['weddings', userId, id]
      queryClient.invalidateQueries({ queryKey: ['weddings'] }),
      // Prefix covers ['calendar', 'weddings'|sessions|events, userId]
      queryClient.invalidateQueries({ queryKey: ['calendar'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['wedding-places', userId, weddingId] }),
      queryClient.invalidateQueries({ queryKey: ['wedding-extras', userId, weddingId] }),
      queryClient.invalidateQueries({ queryKey: ['wedding-contract-package-snapshots', weddingId] }),
      queryClient.invalidateQueries({ queryKey: ['wedding-source-contracts', weddingId] }),
      queryClient.invalidateQueries({ queryKey: ['package-contract-for-wedding', weddingId] }),
      invalidateFinanceQueries(queryClient),
    ])
  }
}
