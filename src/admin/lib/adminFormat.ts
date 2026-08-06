/** Format timestamps for admin UI in Europe/Warsaw. */

const TZ = 'Europe/Warsaw'

export function formatAdminDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)
}

export function formatAdminDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: TZ,
    dateStyle: 'medium',
  }).format(d)
}

export function formatUpdatedAt(value: string | null | undefined): string {
  if (!value) return '—'
  return `Dane zaktualizowane: ${formatAdminDateTime(value)}`
}

export function pctOf(part: number, whole: number): string | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null
  return `${Math.round((part / whole) * 1000) / 10}%`
}
