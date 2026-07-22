import { useQueryClient } from '@tanstack/react-query'

/** Invalidate wedding detail, list, and dashboard after a studio action. */
export function useInvalidateWedding() {
  const queryClient = useQueryClient()

  return async function invalidateWedding(_weddingId: string) {
    await Promise.all([
      // Prefix match covers ['weddings', userId] and ['weddings', userId, id]
      queryClient.invalidateQueries({ queryKey: ['weddings'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
  }
}
