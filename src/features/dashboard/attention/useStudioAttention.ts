import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { studioAttentionService } from '@/features/dashboard/attention/studioAttentionService'
import type { StudioAttentionItem } from '@/features/dashboard/attention/studioAttentionTypes'

/** Stable React Query key — covered by `['dashboard']` invalidation. */
export function studioAttentionQueryKey(userId: string | undefined) {
  return ['dashboard', 'attention', userId] as const
}

/**
 * Independent Attention query — must never gate greeting / assignments / Today.
 */
export function useStudioAttention() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: studioAttentionQueryKey(userId),
    queryFn: async (): Promise<StudioAttentionItem[]> => {
      const result = await studioAttentionService.listStudioAttention()
      return result.items
    },
    enabled: Boolean(userId),
  })
}
