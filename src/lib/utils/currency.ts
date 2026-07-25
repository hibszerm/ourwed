/**
 * Contract-ready PLN formatting — deterministic pl-PL style for legal text.
 * UI `formatCurrency` delegates here so contract and screens stay aligned.
 */

/** Group integer with thin spaces: 9500 → "9 500". */
export function formatPlnDigits(amount: number): string {
  if (!Number.isFinite(amount)) return ''
  const rounded = Math.round(amount)
  const negative = rounded < 0
  const abs = Math.abs(rounded)
  const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${negative ? '-' : ''}${grouped}`
}

/**
 * Formatted PLN for contracts and UI.
 * 9500 → "9 500 zł"
 */
export function formatContractPln(amount: number): string {
  if (!Number.isFinite(amount)) return ''
  return `${formatPlnDigits(amount)} zł`
}

/** @deprecated Prefer formatContractPln — kept as the shared UI entry point. */
export function formatCurrency(amount: number): string {
  return formatContractPln(amount)
}
