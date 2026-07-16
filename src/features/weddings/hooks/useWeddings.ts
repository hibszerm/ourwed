import { useQuery } from '@tanstack/react-query'
import { weddingService } from '@/lib/api/weddingService'

export function useWeddings() {
  return useQuery({
    queryKey: ['weddings'],
    queryFn: () => weddingService.getAll(),
  })
}
