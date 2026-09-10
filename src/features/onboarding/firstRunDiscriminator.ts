/**
 * First-run Home uses total wedding history (including archived),
 * never “upcoming == 0” alone.
 */

export type FirstRunHomeInput = {
  /** All weddings for the tenant, including archived/cancelled. */
  totalWeddingHistoryCount: number
  /**
   * Session-only preference: user chose “Pomiń i przejdź do Pulpitu”.
   * Must not be confused with setup completion — clears on new session.
   */
  sessionPreferOperationalDashboard?: boolean
}

/** True when this tenant has never had a wedding row. */
export function isZeroWeddingHistory(totalWeddingHistoryCount: number): boolean {
  return totalWeddingHistoryCount === 0
}

/**
 * Whether /dashboard should render First-Run Home instead of the
 * operational Dashboard empty state.
 */
export function shouldShowFirstRunHome(input: FirstRunHomeInput): boolean {
  if (!isZeroWeddingHistory(input.totalWeddingHistoryCount)) return false
  if (input.sessionPreferOperationalDashboard) return false
  return true
}
