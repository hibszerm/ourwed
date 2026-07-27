/**
 * Auto-fill vs manual-completion policy for detected payment schedules.
 */

import type {
  DetectedPaymentEntry,
  DetectedPaymentSchedule,
  ManualPaymentScheduleIssue,
  OurWedFinanceSnapshot,
  PaymentSchedulePolicyResult,
} from './types'

function cloneSchedule(s: DetectedPaymentSchedule): DetectedPaymentSchedule {
  return {
    ...s,
    entries: s.entries.map((e) => ({ ...e })),
  }
}

function fillDepositRemaining(
  schedule: DetectedPaymentSchedule,
  finance: OurWedFinanceSnapshot,
): DetectedPaymentSchedule | null {
  if (finance.depositAmount == null || finance.remainingAmount == null) {
    return null
  }
  if (finance.depositAmount + finance.remainingAmount !== finance.totalContractAmount) {
    return null
  }
  const next = cloneSchedule(schedule)
  const deposit = next.entries.find((e) => e.normalizedRole === 'deposit')
  const remaining = next.entries.find(
    (e) => e.normalizedRole === 'remaining' || e.normalizedRole === 'final',
  )
  if (!deposit || !remaining) return null
  if (next.entries.length !== 2) return null

  deposit.amount = finance.depositAmount
  deposit.amountSource = 'ourwed'
  deposit.requiresManualAmount = false
  remaining.amount = finance.remainingAmount
  remaining.amountSource = 'ourwed'
  remaining.requiresManualAmount = false
  next.requiresManualCompletion = false
  return next
}

function fillSingleFullPayment(
  schedule: DetectedPaymentSchedule,
  finance: OurWedFinanceSnapshot,
): DetectedPaymentSchedule | null {
  if (schedule.entries.length !== 1) return null
  if (finance.depositAmount != null && finance.depositAmount > 0) return null
  const next = cloneSchedule(schedule)
  const only = next.entries[0]!
  only.amount = finance.totalContractAmount
  only.amountSource = 'ourwed'
  only.requiresManualAmount = false
  only.normalizedRole =
    only.normalizedRole === 'other' ? 'final' : only.normalizedRole
  next.requiresManualCompletion = false
  return next
}

export function evaluatePaymentSchedulePolicy(
  schedule: DetectedPaymentSchedule,
  finance: OurWedFinanceSnapshot,
): PaymentSchedulePolicyResult {
  const reasonCodes: string[] = []
  const unresolved: string[] = []

  if (schedule.entries.length === 0) {
    return {
      canAutoFill: true,
      requiresManualCompletion: false,
      unresolvedEntryIds: [],
      reasonCodes: ['no_schedule_entries'],
      resolvedSchedule: {
        ...schedule,
        requiresManualCompletion: false,
      },
    }
  }

  if (schedule.entries.length >= 3) {
    reasonCodes.push('three_or_more_entries')
  }

  const depositCount = schedule.entries.filter(
    (e) => e.normalizedRole === 'deposit',
  ).length
  const remainingLike = schedule.entries.filter(
    (e) =>
      e.normalizedRole === 'remaining' ||
      e.normalizedRole === 'final' ||
      e.normalizedRole === 'installment',
  )
  if (remainingLike.length > 1 && schedule.entries.length > 2) {
    reasonCodes.push('competing_remaining_allocation')
  }
  if (depositCount > 1) {
    reasonCodes.push('multiple_deposit_rows')
  }

  const explicitValues =
    (finance.depositAmount != null ? 1 : 0) +
    (finance.remainingAmount != null ? 1 : 0)
  if (schedule.entries.length > Math.max(explicitValues, 1)) {
    reasonCodes.push('more_entries_than_ourwed_values')
  }

  // Try auto paths first
  const twoPart = fillDepositRemaining(schedule, finance)
  if (twoPart && schedule.entries.length === 2 && reasonCodes.length === 0) {
    return {
      canAutoFill: true,
      requiresManualCompletion: false,
      unresolvedEntryIds: [],
      reasonCodes: [],
      resolvedSchedule: twoPart,
    }
  }

  // Two-part with only deposit+remaining roles even if reasonCodes empty from length
  if (
    schedule.entries.length === 2 &&
    schedule.entries.some((e) => e.normalizedRole === 'deposit') &&
    schedule.entries.some(
      (e) => e.normalizedRole === 'remaining' || e.normalizedRole === 'final',
    )
  ) {
    const filled = fillDepositRemaining(schedule, finance)
    if (filled) {
      return {
        canAutoFill: true,
        requiresManualCompletion: false,
        unresolvedEntryIds: [],
        reasonCodes: [],
        resolvedSchedule: filled,
      }
    }
  }

  const single = fillSingleFullPayment(schedule, finance)
  if (single) {
    return {
      canAutoFill: true,
      requiresManualCompletion: false,
      unresolvedEntryIds: [],
      reasonCodes: [],
      resolvedSchedule: single,
    }
  }

  for (const e of schedule.entries) {
    if (e.requiresManualAmount || e.amount == null) unresolved.push(e.id)
  }

  const manual = cloneSchedule(schedule)
  // Pre-fill deposit from OurWed when present, leave other installments null
  if (finance.depositAmount != null) {
    const dep = manual.entries.find((e) => e.normalizedRole === 'deposit')
    if (dep) {
      dep.amount = finance.depositAmount
      dep.amountSource = 'ourwed'
      dep.requiresManualAmount = false
    }
  }
  for (const e of manual.entries) {
    if (e.normalizedRole !== 'deposit') {
      e.amount = null
      e.requiresManualAmount = true
      e.amountSource = 'unknown'
    }
  }
  manual.requiresManualCompletion = true

  const stillUnresolved = manual.entries
    .filter((e) => e.requiresManualAmount || e.amount == null)
    .map((e) => e.id)

  return {
    canAutoFill: false,
    requiresManualCompletion: true,
    unresolvedEntryIds: stillUnresolved,
    reasonCodes:
      reasonCodes.length > 0 ? reasonCodes : ['ambiguous_payment_schedule'],
    resolvedSchedule: manual,
  }
}

export function buildManualPaymentScheduleRequiredIssue(
  schedule: DetectedPaymentSchedule,
  unresolvedEntryIds: string[],
): ManualPaymentScheduleIssue {
  return {
    severity: 'action_required',
    code: 'manual_payment_schedule_required',
    canonicalField: 'contract.paymentSchedule',
    safeDescription:
      'Ta umowa zawiera niestandardowy harmonogram płatności. Uzupełnij kwoty przed przygotowaniem dokumentu.',
    metadata: {
      scheduleId: schedule.scheduleId,
      entryCount: schedule.entries.length,
      unresolvedEntryIds,
    },
  }
}

export function validateManualPaymentSubmission(input: {
  schedule: DetectedPaymentSchedule
  entries: Array<{
    entryId: string
    amount: number
    dueDate?: string | null
    dueDateText?: string | null
  }>
}): {
  ok: boolean
  sum: number
  issues: ManualPaymentScheduleIssue[]
  applied: DetectedPaymentSchedule
} {
  const issues: ManualPaymentScheduleIssue[] = []
  const byId = new Map(input.entries.map((e) => [e.entryId, e]))
  const applied = cloneSchedule(input.schedule)

  for (const entry of applied.entries) {
    const sub = byId.get(entry.id)
    if (!sub) {
      if (entry.requiresManualAmount) {
        issues.push({
          severity: 'blocking',
          code: 'payment_schedule_missing_entry',
          canonicalField: 'contract.paymentSchedule',
          safeDescription: `Brakuje kwoty dla pozycji: ${entry.label}`,
        })
      }
      continue
    }
    if (!Number.isInteger(sub.amount) || sub.amount <= 0) {
      issues.push({
        severity: 'blocking',
        code: 'payment_schedule_invalid_amount',
        canonicalField: 'contract.paymentSchedule',
        safeDescription: `Nieprawidłowa kwota dla pozycji: ${entry.label}`,
      })
      continue
    }
    entry.amount = sub.amount
    entry.amountSource = 'manual'
    entry.requiresManualAmount = false
    if (sub.dueDateText != null && sub.dueDateText.trim()) {
      entry.dueDateText = sub.dueDateText.trim()
      entry.dueDateSource = 'manual'
      entry.requiresManualDueDate = false
    } else if (sub.dueDate != null && sub.dueDate.trim()) {
      entry.dueDate = sub.dueDate.trim()
      entry.dueDateSource = 'manual'
      entry.requiresManualDueDate = false
    } else if (entry.requiresManualDueDate) {
      issues.push({
        severity: 'blocking',
        code: 'payment_schedule_missing_due_date',
        canonicalField: 'contract.paymentSchedule',
        safeDescription: `Brakuje terminu dla pozycji: ${entry.label}`,
      })
    }
  }

  const sum = applied.entries.reduce((n, e) => n + (e.amount ?? 0), 0)
  if (sum !== applied.totalContractAmount) {
    issues.push({
      severity: 'blocking',
      code: 'payment_schedule_sum_mismatch',
      canonicalField: 'contract.paymentSchedule',
      safeDescription: 'Podane raty nie sumują się do wartości umowy.',
      metadata: {
        scheduleId: applied.scheduleId,
        expectedTotal: applied.totalContractAmount,
        actualSum: sum,
      },
    })
  }

  applied.requiresManualCompletion = false
  return {
    ok: issues.length === 0,
    sum,
    issues,
    applied,
  }
}

export function applyOurWedAmountsToEntries(
  entries: DetectedPaymentEntry[],
  finance: OurWedFinanceSnapshot,
): DetectedPaymentEntry[] {
  return entries.map((e) => {
    if (e.normalizedRole === 'deposit' && finance.depositAmount != null) {
      return {
        ...e,
        amount: finance.depositAmount,
        amountSource: 'ourwed' as const,
        requiresManualAmount: false,
      }
    }
    return e
  })
}
