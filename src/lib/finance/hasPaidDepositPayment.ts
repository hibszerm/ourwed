/**
 * Canonical “paid deposit received” for payment CTA sequencing.
 * Agreed deposit alone does NOT count.
 * Unpaid deposit rows (payment_date null) do NOT count.
 */
export function hasPaidDepositPayment(
  payments: ReadonlyArray<{ type: string; paid: boolean }>,
): boolean {
  return payments.some((p) => p.type === 'deposit' && p.paid)
}
