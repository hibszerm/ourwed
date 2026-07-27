/**
 * Detected payment schedule domain for production contract generation.
 */

export type PaymentNormalizedRole =
  | 'deposit'
  | 'remaining'
  | 'installment'
  | 'final'
  | 'other'

export type PaymentValueSource =
  | 'ourwed'
  | 'template'
  | 'manual'
  | 'unknown'

export type DetectedPaymentEntry = {
  id: string
  order: number
  label: string
  normalizedRole: PaymentNormalizedRole
  /** Integer PLN major units (no floating point). */
  amount: number | null
  amountBlockId?: string
  /** Slot id when amount is bound to a template slot. */
  amountSlotId?: string
  amountRegistryKey?: string | null
  dueDate: string | null
  dueDateText: string | null
  dueDateBlockId?: string
  dueDateSlotId?: string
  labelBlockId?: string
  amountSource: PaymentValueSource
  dueDateSource: PaymentValueSource
  requiresManualAmount: boolean
  requiresManualDueDate: boolean
  /** Paragraph index for provenance (when known). */
  paragraphIndex?: number | null
}

export type DetectedPaymentSchedule = {
  scheduleId: string
  totalContractAmount: number
  currency: 'PLN'
  entries: DetectedPaymentEntry[]
  source: 'template_analysis'
  requiresManualCompletion: boolean
}

export type OurWedFinanceSnapshot = {
  totalContractAmount: number
  depositAmount: number | null
  remainingAmount: number | null
}

export type PaymentSchedulePolicyResult = {
  canAutoFill: boolean
  requiresManualCompletion: boolean
  unresolvedEntryIds: string[]
  reasonCodes: string[]
  /** Auto-filled schedule when unambiguous; otherwise null. */
  resolvedSchedule: DetectedPaymentSchedule | null
}

export type ManualPaymentScheduleSubmission = {
  entries: Array<{
    entryId: string
    amount: number
    dueDate?: string | null
    dueDateText?: string | null
  }>
}

export type ManualPaymentScheduleIssue = {
  severity: 'action_required' | 'blocking' | 'warning'
  code: 'manual_payment_schedule_required' | 'payment_schedule_sum_mismatch' | string
  canonicalField: 'contract.paymentSchedule'
  safeDescription: string
  metadata?: {
    scheduleId?: string
    entryCount?: number
    unresolvedEntryIds?: string[]
    expectedTotal?: number
    actualSum?: number
  }
}

export type FriendlyQualityRowStatus =
  | 'ok'
  | 'attention'
  | 'manual'

export type FriendlyQualitySummary = {
  rows: Array<{
    id: string
    label: string
    status: FriendlyQualityRowStatus
    detail?: string
  }>
  paymentScheduleManual?: {
    entries: Array<{ label: string; amountFormatted: string }>
    totalFormatted: string
  }
}
