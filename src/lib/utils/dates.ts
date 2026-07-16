const PL_LOCALE = 'pl-PL'

export function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  return new Date(dateStr).toLocaleDateString(PL_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...options,
  })
}

export function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(PL_LOCALE, {
    day: 'numeric',
    month: 'short',
  })
}

export function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function getCountdownParts(dateStr: string) {
  const days = getDaysUntil(dateStr)
  if (days < 0) return { days: 0, hours: 0, minutes: 0, isPast: true }
  if (days === 0) return { days: 0, hours: 0, minutes: 0, isPast: false, isToday: true }

  return { days, hours: 0, minutes: 0, isPast: false, isToday: false }
}

export function coupleName(partner1: string, partner2: string): string {
  return `${partner1} & ${partner2}`
}
