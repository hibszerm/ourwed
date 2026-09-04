/**
 * Modern /kalendarz collection view preference (UI-only, localStorage).
 * Independent from Calendar month/week mode and from Śluby/Sesje keys.
 */

export type CalendarCollectionViewMode = 'grid' | 'list'

export const CALENDAR_VIEW_MODE_KEY = 'ourwed:calendar-view-mode'

export function parseCalendarViewMode(
  raw: string | null | undefined,
): CalendarCollectionViewMode {
  if (raw === 'list' || raw === 'grid') return raw
  return 'grid'
}

export function readCalendarViewMode(): CalendarCollectionViewMode {
  if (typeof localStorage === 'undefined') return 'grid'
  try {
    return parseCalendarViewMode(localStorage.getItem(CALENDAR_VIEW_MODE_KEY))
  } catch {
    return 'grid'
  }
}

export function writeCalendarViewMode(mode: CalendarCollectionViewMode): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CALENDAR_VIEW_MODE_KEY, mode)
  } catch {
    // Ignore quota / private-mode failures.
  }
}
