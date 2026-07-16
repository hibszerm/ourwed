import { useQueryClient } from '@tanstack/react-query'

/** Invalidate wedding detail, list, and dashboard after a studio action. */
export function useInvalidateWedding() {
  const queryClient = useQueryClient()

  return async function invalidateWedding(weddingId: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['weddings', weddingId] }),
      queryClient.invalidateQueries({ queryKey: ['weddings'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
  }
}
