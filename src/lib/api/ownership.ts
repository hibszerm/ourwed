/**
 * Ownership helpers — always resolve the authenticated studio user.
 * Prefer RLS as the real boundary; these filters are defense in depth.
 */

import { withDevPerf } from '@/lib/performance/devPerf'
import { resolveStudioUserId } from '@/lib/api/studioUser'
import { weddingService } from '@/lib/api/weddingService'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'

export async function requireStudioUserId(): Promise<string> {
  return resolveStudioUserId()
}

/**
 * Returns owned wedding ids for the current studio (empty when none).
 * ID-only — must NEVER full-hydrate weddings (no getAll / finalize).
 * RLS + explicit user_id filter are defense in depth.
 */
export async function listOwnedWeddingIds(): Promise<string[]> {
  return withDevPerf('listOwnedWeddingIds', async () => {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('weddings')
      .select('id')
      .eq('user_id', userId)

    throwOnError(error)

    return ((data ?? []) as { id: string }[]).map((row) => row.id)
  })
}

export async function assertWeddingOwned(weddingId: string): Promise<void> {
  const wedding = await weddingService.getById(weddingId)
  if (!wedding) {
    throw new Error('Ślub nie istnieje lub brak dostępu.')
  }
}
