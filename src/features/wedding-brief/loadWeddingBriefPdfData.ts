/**
 * Load aggregates needed to build Wedding Brief PDF for an owned wedding.
 * Shared snapshot loader is the source of truth for generation + fingerprinting.
 */

import { buildWeddingBriefPdfData } from '@/features/wedding-brief/buildWeddingBriefPdfData'
import { loadWeddingBriefSourceSnapshot } from '@/features/wedding-brief/loadWeddingBriefSource'
import type { WeddingBriefPdfData } from '@/features/wedding-brief/types'

export async function loadWeddingBriefPdfData(
  weddingId: string,
): Promise<WeddingBriefPdfData> {
  const snapshot = await loadWeddingBriefSourceSnapshot(weddingId)
  return buildWeddingBriefPdfData(snapshot)
}
