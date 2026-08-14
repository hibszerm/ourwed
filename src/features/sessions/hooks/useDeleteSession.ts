import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invalidateSessionFinanceQueries } from '@/features/sessions/invalidateSessionFinanceQueries'
import { sessionService } from '@/lib/api/sessionService'

export function useDeleteSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => sessionService.delete(id),
    onSuccess: async (_, id) => {
      await invalidateSessionFinanceQueries(queryClient, id)
    },
  })
}
