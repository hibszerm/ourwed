import { clearStudioUserCache } from '@/lib/api/studioUser'
import { clearTenantModuleCaches } from '@/lib/api/tenantModuleCaches'
import { queryClient } from '@/lib/queryClient'

/**
 * Wipe every client-side tenant artifact when auth.uid() changes.
 *
 * - Cancels in-flight React Query fetches (so responses cannot land in a new session)
 * - Clears query + mutation caches
 * - Resets module-level studio / in-flight promise caches
 *
 * Safe to call repeatedly. Must NOT run on TOKEN_REFRESHED when uid is unchanged.
 */
export function resetTenantClientState(): void {
  void queryClient.cancelQueries()
  queryClient.getMutationCache().clear()
  queryClient.clear()
  clearStudioUserCache()
  clearTenantModuleCaches()
}
