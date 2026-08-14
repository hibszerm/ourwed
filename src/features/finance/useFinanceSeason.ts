import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  financeSeasonQueryKey,
  financeSeasonYearsQueryKey,
} from '@/features/finance/financeQueryKeys'
import { financeSeasonService } from '@/lib/api/financeSeasonService'
import { resolveDefaultSeasonYear } from '@/lib/finance/financeSeasonAggregate'

const FINANCE_STALE_MS = 30_000

export function useFinanceSeasonYears() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: financeSeasonYearsQueryKey(userId),
    queryFn: () => financeSeasonService.listAvailableSeasonYears(),
    enabled: Boolean(userId),
    staleTime: FINANCE_STALE_MS,
  })
}

export function useFinanceSeason(seasonYear: number | null) {
  const { user } = useAuth()
  const userId = user?.id
  const year = seasonYear ?? 0

  return useQuery({
    queryKey: financeSeasonQueryKey(userId, year),
    queryFn: () => financeSeasonService.loadSeason(year),
    enabled: Boolean(userId) && seasonYear != null && seasonYear > 0,
    staleTime: FINANCE_STALE_MS,
    placeholderData: (previous) => previous,
  })
}

export function useResolvedFinanceSeasonYear(
  selectedYear: number | null,
): {
  seasonYear: number | null
  yearsQuery: ReturnType<typeof useFinanceSeasonYears>
  resolving: boolean
} {
  const yearsQuery = useFinanceSeasonYears()
  const resolving = yearsQuery.isLoading || yearsQuery.isFetching

  if (selectedYear != null) {
    return { seasonYear: selectedYear, yearsQuery, resolving: false }
  }

  if (!yearsQuery.isSuccess) {
    return { seasonYear: null, yearsQuery, resolving }
  }

  return {
    seasonYear: resolveDefaultSeasonYear(yearsQuery.data ?? []),
    yearsQuery,
    resolving: false,
  }
}
