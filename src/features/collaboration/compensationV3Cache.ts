import type { QueryClient } from '@tanstack/react-query'
import { invalidateFinanceQueries } from '@/features/finance/invalidateFinanceQueries'
import { compensationV3QueryKeys } from './compensationV3Service'

/** Refresh only the current recipient's private compensation and Finance data. */
export async function invalidateCompensationPrivateMutation(
  queryClient: QueryClient,
  input: {
    userId: string | undefined
    weddingId: string
    relationshipId: string
    accessVersion: string
  },
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: compensationV3QueryKeys.shared(input.userId, input.weddingId, input.accessVersion),
      exact: true,
    }),
    queryClient.invalidateQueries({
      queryKey: compensationV3QueryKeys.private(input.userId, input.relationshipId, input.accessVersion),
      exact: true,
    }),
    queryClient.invalidateQueries({
      queryKey: ['personal-finance-v3', input.userId],
    }),
  ])
}

/** Receiver changes affect the ledger, both recipient settlements, and owner Finance. */
export async function invalidateCompensationPaymentMutation(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['weddings'] }),
    queryClient.invalidateQueries({ queryKey: ['collaboration-compensation-v3'] }),
    invalidateFinanceQueries(queryClient),
  ])
}
