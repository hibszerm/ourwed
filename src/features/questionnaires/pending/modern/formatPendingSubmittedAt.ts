import { formatShortDate } from '@/lib/utils/dates'

/** Existing calendar-day presentation — do not change timezone semantics. */
export function formatPendingSubmittedAt(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return formatShortDate(iso)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const time = d.toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
  })
  if (sameDay) return `Dzisiaj, ${time}`
  return `${formatShortDate(iso)}, ${time}`
}
