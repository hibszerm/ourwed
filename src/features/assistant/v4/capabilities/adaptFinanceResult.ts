/**
 * Adapt CapabilityExecutionResult → Phase 3A finance result shape
 * so shadow session / compare harness stay stable.
 */

import type { V4FinanceExecutionResult } from '../execution/financeTypes'
import type { CapabilityExecutionResult } from './types'

export function capabilityResultToFinanceExecution(
  result: CapabilityExecutionResult,
): V4FinanceExecutionResult {
  switch (result.status) {
    case 'success': {
      const obs = result.observation
      if (obs.kind !== 'money') {
        return { status: 'error', safeCode: 'unexpected_observation_kind' }
      }
      return {
        status: 'success',
        resourceType: 'wedding',
        weddingId: obs.resource.id,
        metric: obs.metric,
        amount: obs.amount,
        currency: obs.currency,
        displayName: obs.displayName,
      }
    }
    case 'needs_clarification':
      return {
        status: 'needs_clarification',
        missingSlot: result.missingSlot,
        safeCode: result.safeCode,
      }
    case 'not_found':
      return { status: 'not_found', safeCode: result.safeCode }
    case 'unsupported':
      return { status: 'unsupported', safeCode: result.safeCode }
    case 'disabled':
      // Caller treats disabled as skip (null); this branch is defensive.
      return { status: 'unsupported', safeCode: result.safeCode }
    case 'conflict':
      return { status: 'error', safeCode: result.safeCode }
    case 'error':
      return { status: 'error', safeCode: result.safeCode }
    default: {
      const _exhaustive: never = result
      return _exhaustive
    }
  }
}
