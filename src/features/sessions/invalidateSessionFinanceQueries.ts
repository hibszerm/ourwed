import type { QueryClient } from '@tanstack/react-query'
import { invalidateFinanceQueries } from '@/features/finance/invalidateFinanceQueries'

/** Invalidate session surfaces + Finance after session or session-payment changes. */
export async function invalidateSessionFinanceQueries(
  queryClient: QueryClient,
  sessionId?: string,
): Promise<void> {
  const tasks: Promise<unknown>[] = [
    queryClient.invalidateQueries({ queryKey: ['sessions'] }),
    queryClient.invalidateQueries({ queryKey: ['calendar'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    invalidateFinanceQueries(queryClient),
  ]
  if (sessionId) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: ['sessions', undefined, sessionId],
      }),
    )
  }
  await Promise.all(tasks)
}
