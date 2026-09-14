/**
 * Phase 3A — typed single-resource wedding finance execution results.
 * Facts only. No LLM prose. No full wedding/payment dumps.
 */

export const V4_PHASE3A_FINANCE_METRICS = [
  'contract_value',
  'paid',
  'remaining',
] as const

export type V4FinanceMetric = (typeof V4_PHASE3A_FINANCE_METRICS)[number]

export type V4FinanceExecutionResult =
  | {
      status: 'success'
      resourceType: 'wedding'
      weddingId: string
      metric: V4FinanceMetric
      amount: number
      currency: string
      /** Safe presentation label already used by Assistant cards — optional. */
      displayName?: string
    }
  | {
      status: 'needs_clarification'
      missingSlot: 'resource' | 'participant' | 'subject' | 'other'
      safeCode: string
    }
  | {
      status: 'unsupported'
      safeCode: string
    }
  | {
      status: 'not_found'
      safeCode: string
    }
  | {
      status: 'error'
      safeCode: string
    }

export type V4FinanceShadowComparison = {
  supported: boolean
  resolvedSameResource: boolean | null
  metricSame: boolean | null
  amountSame: boolean | null
  v4Status: V4FinanceExecutionResult['status'] | 'skipped'
  v3Present: boolean
}
