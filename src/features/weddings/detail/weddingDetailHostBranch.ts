import type { WeddingDetailAuthority } from './weddingDetailAuthority'

export type WeddingDetailHostBranch = 'loading' | 'error' | 'unavailable' | 'owned' | 'shared'

/** Pure branch decision used to keep owner hooks behind an explicit authority result. */
export function resolveWeddingDetailHostBranch(input: {
  validId: boolean
  isFetching: boolean
  isPending: boolean
  isError: boolean
  authority?: WeddingDetailAuthority
}): WeddingDetailHostBranch {
  if (!input.validId) return 'unavailable'
  if (input.isFetching || input.isPending) return 'loading'
  if (input.isError || !input.authority) return 'error'
  if (input.authority.kind === 'unavailable') return 'unavailable'
  return input.authority.kind
}
