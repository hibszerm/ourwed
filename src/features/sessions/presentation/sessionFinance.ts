/**
 * Pure session finance helpers — ledger-based (session_payments).
 * Does NOT use sessions.deposit_amount as paid truth.
 */

import {
  getDepositPaid,
  getRemainingToPay,
  getTotalPaid,
} from '@/lib/utils/finance'
import type { FinancePaymentStatus } from '@/lib/finance/financeSeasonTypes'
import type { SessionPayment } from '@/types/sessionPayment'
import type { Payment } from '@/types/wedding'

/** Narrow SessionPayment to the Payment shape finance helpers expect. */
function asLedgerPayments(payments: SessionPayment[]): Payment[] {
  return payments.map((p) => ({
    id: p.id,
    label: p.label,
    amount: p.amount,
    type: p.type,
    paid: p.paid,
    paidAt: p.paidAt,
    method: p.method,
    note: p.note,
  }))
}

export function getSessionTotalPaid(payments: SessionPayment[]): number {
  return getTotalPaid(asLedgerPayments(payments))
}

export function getSessionDepositPaid(payments: SessionPayment[]): number {
  return getDepositPaid(asLedgerPayments(payments))
}

export function getSessionRemainingToPay(
  totalPrice: number,
  payments: SessionPayment[],
): number {
  return getRemainingToPay(totalPrice, asLedgerPayments(payments))
}

/**
 * @deprecated Prefer getSessionRemainingToPay(totalPrice, payments).
 * Kept for call-site migration — requires ledger payments, not depositAmount.
 */
export function getSessionRemainingAmount(
  totalPrice: number,
  payments: SessionPayment[],
): number {
  return getSessionRemainingToPay(totalPrice, payments)
}

export function resolveSessionPaymentStatus(
  totalPrice: number,
  totalPaid: number,
): FinancePaymentStatus {
  if (!(totalPrice > 0)) return 'value_unset'
  if (totalPaid >= totalPrice) return 'paid'
  if (totalPaid > 0) return 'partial'
  return 'unpaid'
}

export interface SessionCommercialSummary {
  totalPrice: number
  agreedDeposit: number
  totalPaid: number
  depositPaid: number
  remaining: number
  paymentStatus: FinancePaymentStatus
}

export function buildSessionCommercialSummary(
  totalPrice: number,
  agreedDeposit: number,
  payments: SessionPayment[],
): SessionCommercialSummary {
  const totalPaid = getSessionTotalPaid(payments)
  return {
    totalPrice,
    agreedDeposit,
    totalPaid,
    depositPaid: getSessionDepositPaid(payments),
    remaining: getSessionRemainingToPay(totalPrice, payments),
    paymentStatus: resolveSessionPaymentStatus(totalPrice, totalPaid),
  }
}
