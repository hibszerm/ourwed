import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionService } from '@/lib/api/sessionService'
import type { CreateSessionInput } from '@/types/session'

export function useCreateSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateSessionInput) => sessionService.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}
