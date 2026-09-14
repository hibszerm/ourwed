/**
 * DEV-only structured V3↔V4 finance fact comparison (no prose).
 */

import type { AssistantResponse } from '../../types'
import type {
  V4FinanceExecutionResult,
  V4FinanceMetric,
  V4FinanceShadowComparison,
} from './financeTypes'

function v3MetricFromAspect(
  aspect: string | null | undefined,
): V4FinanceMetric | null {
  if (aspect === 'contract_value') return 'contract_value'
  if (aspect === 'paid') return 'paid'
  if (aspect === 'remaining') return 'remaining'
  // overview / missing: V3 still returns full finance DTO; aspect optional
  return null
}

function v3AmountForMetric(
  metric: V4FinanceMetric,
  finance: {
    contractValue: number
    totalPaid: number
    remainingToPay: number
  },
): number {
  if (metric === 'contract_value') return finance.contractValue
  if (metric === 'paid') return finance.totalPaid
  return finance.remainingToPay
}

/** Exact integer PLN comparison (project money is whole PLN numbers). */
export function financeAmountsEqual(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.round(a) === Math.round(b)
}

export function compareV4FinanceWithV3Response(input: {
  v4: V4FinanceExecutionResult | null
  v3: AssistantResponse | null | undefined
}): V4FinanceShadowComparison {
  const v4 = input.v4
  if (!v4) {
    return {
      supported: false,
      resolvedSameResource: null,
      metricSame: null,
      amountSame: null,
      v4Status: 'skipped',
      v3Present: false,
    }
  }

  if (input.v3?.kind !== 'finance' || !input.v3.finance) {
    return {
      supported: true,
      resolvedSameResource: null,
      metricSame: null,
      amountSame: null,
      v4Status: v4.status,
      v3Present: false,
    }
  }

  const finance = input.v3.finance
  const aspectMetric = v3MetricFromAspect(input.v3.financeAspect)

  if (v4.status !== 'success') {
    return {
      supported: true,
      resolvedSameResource: false,
      metricSame: false,
      amountSame: false,
      v4Status: v4.status,
      v3Present: true,
    }
  }

  const resolvedSameResource = finance.weddingId === v4.weddingId
  const metricSame =
    aspectMetric == null ? true : aspectMetric === v4.metric
  const compareMetric = aspectMetric ?? v4.metric
  const v3Amount = v3AmountForMetric(compareMetric, finance)
  const amountSame = financeAmountsEqual(v3Amount, v4.amount)

  return {
    supported: true,
    resolvedSameResource,
    metricSame,
    amountSame,
    v4Status: v4.status,
    v3Present: true,
  }
}
