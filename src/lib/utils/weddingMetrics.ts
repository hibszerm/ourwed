import type { Wedding } from '@/types/wedding'

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isInMonth(dateStr: string, year: number, monthIndex: number): boolean {
  const date = parseLocalDate(dateStr)
  return date.getFullYear() === year && date.getMonth() === monthIndex
}

function resolveYearMonth(anchor: Date | { year: number; month: number }): {
  year: number
  monthIndex: number
} {
  if (anchor instanceof Date) {
    return { year: anchor.getFullYear(), monthIndex: anchor.getMonth() }
  }
  // month is 1–12 when passed as number object
  return { year: anchor.year, monthIndex: anchor.month - 1 }
}

/** Wszystkie śluby w miesiącu, posortowane rosnąco po dacie. */
export function getWeddingsInMonth(
  weddings: Wedding[],
  anchor: Date | { year: number; month: number },
): Wedding[] {
  const { year, monthIndex } = resolveYearMonth(anchor)
  return weddings
    .filter((wedding) => isInMonth(wedding.date, year, monthIndex))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Liczba ślubów w danym miesiącu (anchor = Date lub { year, month: 1–12 }). */
export function getMonthlyWeddingCount(
  weddings: Wedding[],
  anchor: Date | { year: number; month: number },
): number {
  return getWeddingsInMonth(weddings, anchor).length
}

/**
 * Suma wartości umów (wedding.price) w danym miesiącu.
 * Nie uwzględnia płatności ani zadatków.
 */
export function getMonthlyContractValue(
  weddings: Wedding[],
  anchor: Date | { year: number; month: number },
): number {
  return getWeddingsInMonth(weddings, anchor).reduce(
    (sum, wedding) => sum + wedding.price,
    0,
  )
}

/**
 * Najbliższy nadchodzący ślub globalnie (od dziś włącznie).
 * Niezależny od aktualnie przeglądanego miesiąca kalendarza.
 * Gotowy do Dashboard, Home i Notifications.
 */
export function getNearestUpcomingWedding(weddings: Wedding[]): Wedding | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const upcoming = weddings
    .filter((wedding) => {
      const date = parseLocalDate(wedding.date)
      date.setHours(0, 0, 0, 0)
      return date.getTime() >= today.getTime()
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  return upcoming[0] ?? null
}

/** Pierwszy chronologicznie ślub w miesiącu (metryki miesięczne, nie „najbliższy”). */
export function getFirstWeddingInMonth(
  weddings: Wedding[],
  anchor: Date,
): Wedding | null {
  return getWeddingsInMonth(weddings, anchor)[0] ?? null
}
