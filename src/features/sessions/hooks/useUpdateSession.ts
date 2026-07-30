import { useMutation, useQueryClient } from '@tanstack/react-query'
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
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      queryClient.invalidateQueries({ queryKey: ['sessions', undefined, session.id] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}
