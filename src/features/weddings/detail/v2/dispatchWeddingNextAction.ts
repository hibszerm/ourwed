/**
 * UI-layer adapter: declarative WeddingNextAction → existing Overview handlers.
 * Domain resolver stays free of React callbacks.
 */

import type { WeddingNextAction } from '@/lib/workflow/resolveWeddingNextAction'

export type WeddingNextActionHandlers = {
  sendContractQuestionnaire: () => void
  generateContract: () => void
  /** Contract tab — WeddingContractSignedControls lives there. */
  openContractFinance: () => void
  recordDeposit: () => void
  /**
   * Ankieta tab — send pre-wedding, MappingPanel (Apply), and Plan dnia
   * ceremony-time authoring (OperationalTimeControl).
   */
  openPreWedding: () => void
  editLocations: () => void
  openCockpit: () => void
}

/**
 * Exhaustive dispatch for V1 action ids.
 * Compile-time exhaustiveness via `never` when catalog grows.
 */
export function dispatchWeddingNextAction(
  action: WeddingNextAction,
  handlers: WeddingNextActionHandlers,
): void {
  switch (action.id) {
    case 'send_contract_questionnaire':
      handlers.sendContractQuestionnaire()
      return
    case 'generate_contract':
      handlers.generateContract()
      return
    case 'mark_contract_signed':
      handlers.openContractFinance()
      return
    case 'record_deposit':
      handlers.recordDeposit()
      return
    case 'send_prewedding':
    case 'review_apply':
    case 'set_ceremony_time':
      handlers.openPreWedding()
      return
    case 'complete_core_locations':
      handlers.editLocations()
      return
    case 'open_cockpit':
      handlers.openCockpit()
      return
    default: {
      const _exhaustive: never = action.id
      void _exhaustive
    }
  }
}
