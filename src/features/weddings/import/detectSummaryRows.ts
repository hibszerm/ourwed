const SUMMARY_PATTERNS =
  /^(razem|suma|łącznie|lacznie|total|subtotal|podsumowanie)$/i

export function isLikelySummaryRow(input: {
  coupleDisplayName: string
  weddingDate: string | null
  contractValue: number | null
  note?: string
}): boolean {
  const name = input.coupleDisplayName.trim()
  if (SUMMARY_PATTERNS.test(name)) return true
  if (!input.weddingDate && !name && input.contractValue != null) return true
  if (!input.weddingDate && SUMMARY_PATTERNS.test(input.note ?? '')) return true
  return false
}

export function isRowCompletelyEmpty(values: Record<string, unknown>): boolean {
  return Object.values(values).every(
    (value) => value == null || String(value).trim() === '',
  )
}
