/** Controlled value for native `<input type="date">` — ISO date-only or blank, never display text. */
export function reviewDateInputValue(weddingDate: string | null | undefined): string {
  if (!weddingDate) return ''
  return /^\d{4}-\d{2}-\d{2}$/.test(weddingDate) ? weddingDate : ''
}

export function isReviewDateInputBlank(value: string): boolean {
  return value === ''
}
