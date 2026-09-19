/**
 * Format calendar presentation labels for Polish product locale.
 * Does not change routing — display only.
 */

export function formatPresentationCalendarLabel(raw: string): string {
  const trimmed = raw.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (iso) {
    const y = Number(iso[1])
    const m = Number(iso[2])
    const d = Number(iso[3])
    const date = new Date(y, m - 1, d)
    if (
      date.getFullYear() === y &&
      date.getMonth() === m - 1 &&
      date.getDate() === d
    ) {
      return date.toLocaleDateString('pl-PL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    }
  }
  return trimmed
}
