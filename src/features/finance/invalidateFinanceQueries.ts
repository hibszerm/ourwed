import type { QueryClient } from '@tanstack/react-query'
import { FINANCE_QUERY_ROOT } from '@/features/finance/financeQueryKeys'

/** Invalidate all Finance Center caches (season + available years). */
export async function invalidateFinanceQueries(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: [FINANCE_QUERY_ROOT] })
}
