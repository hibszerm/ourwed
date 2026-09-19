/**
 * Studio Attention V1 — derived Dashboard feed (not persisted).
 * Pure types only; no React / network.
 */

import type { WeddingNextActionId } from '@/lib/workflow/resolveWeddingNextAction'

export const STUDIO_ATTENTION_LIMIT = 6

/** Phone presentation truncates the shared ranked pool (same query). */
export const STUDIO_ATTENTION_MOBILE_VISIBLE = 5

/** V1 Next Action kinds eligible for studio Attention. */
export const STUDIO_ATTENTION_NEXT_ACTION_IDS = [
  'complete_contract_data_manually',
  'resolve_travel_fee',
  'generate_contract',
  'mark_contract_sent',
  'mark_contract_signed',
  'record_deposit',
  'send_prewedding',
] as const satisfies readonly WeddingNextActionId[]

export type StudioAttentionNextActionId =
  (typeof STUDIO_ATTENTION_NEXT_ACTION_IDS)[number]

export type StudioAttentionKind =
  | StudioAttentionNextActionId
  | 'overdue_payment'
  | 'overdue_delivery'

export type StudioAttentionUrgency = 'overdue' | 'blocker' | 'preparation'

export type StudioAttentionItem = {
  id: string
  kind: StudioAttentionKind
  entityType: 'wedding'
  entityId: string
  title: string
  description: string
  urgency: StudioAttentionUrgency
  dueAt: string | null
  href: string
  /** Deterministic CTA label (Polish product copy). */
  ctaLabel: string
  /**
   * Relative timing context for the right column (e.g. "12 dni po terminie").
   * Null when no meaningful timing signal — never invent.
   */
  contextLabel: string | null
  /** Couple / wedding display name for the row. */
  entityLabel: string
  /** Wedding date YYYY-MM-DD for ranking (nullable). */
  weddingDate: string | null
}

export function isStudioAttentionNextActionId(
  id: WeddingNextActionId,
): id is StudioAttentionNextActionId {
  return (STUDIO_ATTENTION_NEXT_ACTION_IDS as readonly string[]).includes(id)
}
