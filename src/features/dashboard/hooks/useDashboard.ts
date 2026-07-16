import { useQuery } from '@tanstack/react-query'
import { dashboardService } from '@/lib/api/dashboardService'

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardService.getDashboardData(),
  })
}
