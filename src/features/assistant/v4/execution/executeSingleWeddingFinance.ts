/**
 * Phase 3A — single-wedding finance domain loader.
 * Maps allowlisted subjects → existing commercial helpers via weddingService.
 * Never accepts ownerId/userId/tenantId. Never invents arithmetic.
 *
 * Phase 3B: Capability wedding.finance.get calls loadWeddingFinanceMetric.
 * Registry dispatch lives in capabilities/ (avoids import cycles).
 */

import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { weddingService } from '@/lib/api/weddingService'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import type { ResolvedTask } from '../resolver/types'
import type {
  V4FinanceExecutionResult,
  V4FinanceMetric,
} from './financeTypes'

function amountForMetric(
  metric: V4FinanceMetric,
  summary: ReturnType<typeof getWeddingCommercialSummary>,
): number {
  switch (metric) {
    case 'contract_value':
      return summary.contractValue
    case 'paid':
      return summary.totalPaid
    case 'remaining':
      return summary.remainingToPay
    default: {
      const _exhaustive: never = metric
      return _exhaustive
    }
  }
}

/**
 * Canonical single-wedding finance read by weddingId + metric.
 * Ownership: weddingService.getById filters by authenticated studio user_id + RLS.
 * Never accepts ownerId/userId/tenantId.
 */
export async function loadWeddingFinanceMetric(input: {
  weddingId: string
  metric: V4FinanceMetric
}): Promise<V4FinanceExecutionResult> {
  try {
    const weddingId = input.weddingId.trim()
    if (!weddingId) {
      return {
        status: 'needs_clarification',
        missingSlot: 'resource',
        safeCode: 'wedding_required',
      }
    }

    const wedding = await weddingService.getById(weddingId)
    if (!wedding) {
      return { status: 'not_found', safeCode: 'wedding_not_found' }
    }

    const summary = getWeddingCommercialSummary(wedding)
    const amount = amountForMetric(input.metric, summary)
    const currency =
      typeof summary.currency === 'string' && summary.currency.trim()
        ? summary.currency.trim()
        : 'PLN'

    return {
      status: 'success',
      resourceType: 'wedding',
      weddingId: wedding.id,
      metric: input.metric,
      amount,
      currency,
      displayName: getWeddingDisplayName(wedding),
    }
  } catch {
    return { status: 'error', safeCode: 'finance_execution_failed' }
  }
}

/**
 * Execute a resolved single-wedding finance task.
 * Prefer calling with a ResolvedTask already selected as eligible.
 */
export async function executeSingleWeddingFinanceTask(
  task: ResolvedTask,
  metric: V4FinanceMetric,
): Promise<V4FinanceExecutionResult> {
  if (task.resource?.kind !== 'wedding' || !task.resource.id) {
    return {
      status: 'needs_clarification',
      missingSlot: 'resource',
      safeCode: 'wedding_required',
    }
  }
  return loadWeddingFinanceMetric({
    weddingId: task.resource.id,
    metric,
  })
}
