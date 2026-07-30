/** Remaining amount for a session — never negative. */
export function getSessionRemainingAmount(
  totalPrice: number,
  depositAmount: number,
): number {
  const total = Number.isFinite(totalPrice) ? totalPrice : 0
  const deposit = Number.isFinite(depositAmount) ? depositAmount : 0
  return Math.max(total - deposit, 0)
}
