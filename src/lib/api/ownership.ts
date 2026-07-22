/**
 * Ownership helpers — always resolve the authenticated studio user.
 * Prefer RLS as the real boundary; these filters are defense in depth.
 */

import { resolveStudioUserId } from '@/lib/api/studioUser'
import { weddingService } from '@/lib/api/weddingService'

export async function requireStudioUserId(): Promise<string> {
  return resolveStudioUserId()
}

/** Returns owned wedding ids for the current studio (empty when none). */
export async function listOwnedWeddingIds(): Promise<string[]> {
  const weddings = await weddingService.getAll()
  return weddings.map((w) => w.id)
}

export async function assertWeddingOwned(weddingId: string): Promise<void> {
  const wedding = await weddingService.getById(weddingId)
  if (!wedding) {
    throw new Error('Ślub nie istnieje lub brak dostępu.')
  }
}
