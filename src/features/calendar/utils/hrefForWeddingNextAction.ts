/**
 * Calendar-safe Next Action navigation.
 * Maps shared WeddingNextAction destinations to Wedding Detail routes/tabs.
 * Prefer navigation over cross-page modals (Calendar has no Overview handlers).
 */

import type { WeddingNextAction } from '@/lib/workflow/resolveWeddingNextAction'

/**
 * Exhaustive href for Calendar CTA — mirrors Overview dispatch targets.
 */
export function hrefForWeddingNextAction(
  weddingId: string,
  action: WeddingNextAction,
): string {
  switch (action.id) {
    case 'send_contract_questionnaire':
    case 'mark_contract_signed':
    case 'record_deposit':
      return `/sluby/${weddingId}?tab=contract_finance`
    case 'generate_contract': {
      const dest = action.destination
      if (dest.kind === 'route') return dest.path
      return `/sluby/${weddingId}/umowy/nowa`
    }
    case 'send_prewedding':
    case 'review_apply':
    case 'set_ceremony_time':
      return `/sluby/${weddingId}?tab=pre_wedding_questionnaire`
    case 'complete_core_locations':
      return `/sluby/${weddingId}?tab=overview`
    case 'open_cockpit':
      return `/sluby/${weddingId}/dzien-slubu`
    default: {
      const _exhaustive: never = action.id
      void _exhaustive
      return `/sluby/${weddingId}`
    }
  }
}
