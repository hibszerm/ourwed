import { useQueryClient } from '@tanstack/react-query'
import { invalidateFinanceQueries } from '@/features/finance/invalidateFinanceQueries'

/** Invalidate wedding detail, list, dashboard, Calendar, and Finance after a studio action. */
export function useInvalidateWedding() {
  const queryClient = useQueryClient()

  return async function invalidateWedding(_weddingId: string) {
    void _weddingId
    await Promise.all([
      // Prefix match covers ['weddings', userId] and ['weddings', userId, id]
      queryClient.invalidateQueries({ queryKey: ['weddings'] }),
      // Prefix covers ['calendar', 'weddings'|sessions|events, userId]
      queryClient.invalidateQueries({ queryKey: ['calendar'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      invalidateFinanceQueries(queryClient),
    ])
  }
}
