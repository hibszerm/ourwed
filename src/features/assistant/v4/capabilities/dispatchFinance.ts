/**
 * Phase 3B dispatch: ResolvedTask → Capability Registry → finance result shape.
 * Preserves Phase 3A executePhase3AFinanceIfEligible contract for shadow.
 */

import type { V4FinanceExecutionResult } from '../execution/financeTypes'
import type { ResolvedTaskResult } from '../resolver/types'
import { capabilityResultToFinanceExecution } from './adaptFinanceResult'
import { runV4CapabilityExecution } from './runtime'

/**
 * Eligibility gate + execute via V4 Capability Registry.
 * Unsupported families never call the service.
 * Disabled capability → null (skip).
 */
export async function executePhase3AFinanceIfEligible(
  resolution: ResolvedTaskResult | null | undefined,
): Promise<V4FinanceExecutionResult | null> {
  const dispatched = await runV4CapabilityExecution(resolution)
  if (!dispatched.handled) return null
  if (dispatched.result.status === 'disabled') return null
  return capabilityResultToFinanceExecution(dispatched.result)
}
