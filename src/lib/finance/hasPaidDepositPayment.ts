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

/**
 * Apply-defaults package change must ask before rewriting agreed deposit when
 * a paid deposit already exists and the catalog default differs.
 */
export function requiresAgreedDepositConfirmOnPackageDefaults(input: {
  payments: ReadonlyArray<{ type: string; paid: boolean }>
  currentAgreedDeposit: number
  catalogDefaultDeposit: number
}): boolean {
  const current = Math.max(
    0,
    Number.isFinite(input.currentAgreedDeposit)
      ? input.currentAgreedDeposit
      : 0,
  )
  const catalog = Math.max(
    0,
    Number.isFinite(input.catalogDefaultDeposit)
      ? input.catalogDefaultDeposit
      : 0,
  )
  return hasPaidDepositPayment(input.payments) && catalog !== current
}
