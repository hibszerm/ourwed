import { useMutation, useQueryClient } from '@tanstack/react-query'
import { weddingService } from '@/lib/api/weddingService'
import type { CreateWeddingInput } from '@/types/wedding'

export function useCreateWedding() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateWeddingInput) => weddingService.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weddings'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
