import { useQuery } from '@tanstack/react-query'
import { weddingService } from '@/lib/api/weddingService'

export function useWedding(id: string) {
  return useQuery({
    queryKey: ['weddings', id],
    queryFn: () => weddingService.getById(id),
    enabled: Boolean(id),
  })
}
