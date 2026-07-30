import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionService } from '@/lib/api/sessionService'

export function useDeleteSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => sessionService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}
