import { formatShortDate } from '@/lib/utils/dates'

/** Existing inbox timestamp presentation — do not change calendar-day semantics. */
export function formatNotificationWhen(iso: string): string {
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
