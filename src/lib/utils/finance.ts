import type { Payment } from '@/types/wedding'

/** Sum of all paid client payments toward the contract. */
export function getTotalPaid(payments: Payment[]): number {
  return payments.filter((p) => p.paid).reduce((sum, p) => sum + p.amount, 0)
}

/** Amount already paid as deposit-type payments. */
export function getDepositPaid(payments: Payment[]): number {
  return payments
    .filter((p) => p.paid && p.type === 'deposit')
    .reduce((sum, p) => sum + p.amount, 0)
}

/**
 * Remaining to pay = contractValue − totalPaid.
 * This is what the couple still owes.
 */
export function getRemainingToPay(
  contractValue: number,
  payments: Payment[],
): number {
  return Math.max(0, contractValue - getTotalPaid(payments))
}

/**
 * Remaining after agreed deposit = contractValue − agreedDeposit.
 * Balance expected after the contractual deposit is settled (not payment-ledger based).
 */
export function getRemainingAfterDeposit(
  contractValue: number,
  agreedDeposit: number,
): number {
  return Math.max(0, contractValue - Math.max(0, agreedDeposit))
}

/**
 * @deprecated Use getRemainingToPay — name was ambiguous vs remainingAfterDeposit.
 */
export function getRemainingAmount(
  contractValue: number,
  payments: Payment[],
): number {
  return getRemainingToPay(contractValue, payments)
}
