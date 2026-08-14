import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invalidateSessionFinanceQueries } from '@/features/sessions/invalidateSessionFinanceQueries'
import { sessionService } from '@/lib/api/sessionService'
import type { CreateSessionInput } from '@/types/session'

export function useCreateSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateSessionInput) => sessionService.create(input),
    onSuccess: async (session) => {
      await invalidateSessionFinanceQueries(queryClient, session.id)
    },
  })
}
