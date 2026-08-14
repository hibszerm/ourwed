import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invalidateSessionFinanceQueries } from '@/features/sessions/invalidateSessionFinanceQueries'
import { sessionService } from '@/lib/api/sessionService'
import type { UpdateSessionInput } from '@/types/session'

export function useUpdateSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      input: UpdateSessionInput
    }) => sessionService.update(id, input),
    onSuccess: async (session) => {
      await invalidateSessionFinanceQueries(queryClient, session.id)
    },
  })
}
