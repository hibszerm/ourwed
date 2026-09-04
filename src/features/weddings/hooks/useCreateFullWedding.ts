import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invalidateFinanceQueries } from '@/features/finance/invalidateFinanceQueries'
import {
  createFullWedding,
  type CreateFullWeddingInput,
} from '@/features/weddings/createFullWedding'

/**
 * Full Create mutation for the 4-step New Wedding path.
 * Quick Create must keep using useCreateWedding.
 */
export function useCreateFullWedding() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateFullWeddingInput) => createFullWedding(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weddings'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['wedding-places'] })
      queryClient.invalidateQueries({ queryKey: ['wedding-extras'] })
      void invalidateFinanceQueries(queryClient)
    },
  })
}
