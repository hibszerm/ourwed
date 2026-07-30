/**
 * Assignment metrics over the unified CalendarUiEvent model.
 * Single source for nearest / month stats / month list.
 */
import type { CalendarUiEvent } from './calendarEvents'
import { parseDateKey, toDateKey } from './calendarDates'

function resolveYearMonth(anchor: Date | { year: number; month: number }): {
  year: number
  monthIndex: number
} {
  if (anchor instanceof Date) {
    return { year: anchor.getFullYear(), monthIndex: anchor.getMonth() }
  }
  return { year: anchor.year, monthIndex: anchor.month - 1 }
}

function todayDateKey(): string {
  return toDateKey(new Date())
}

/** Chronological sort: date → start time → entity type → entity id. */
export function compareCalendarUiEvents(
  a: CalendarUiEvent,
  b: CalendarUiEvent,
): number {
  const byDate = a.dateKey.localeCompare(b.dateKey)
  if (byDate !== 0) return byDate
  const aTime = a.ceremonyTime ?? ''
  const bTime = b.ceremonyTime ?? ''
  const byTime = aTime.localeCompare(bTime)
  if (byTime !== 0) return byTime
  const byType = a.entityType.localeCompare(b.entityType)
  if (byType !== 0) return byType
  return a.entityId.localeCompare(b.entityId)
}

export function getAssignmentsInMonth(
  events: CalendarUiEvent[],
  anchor: Date | { year: number; month: number },
): CalendarUiEvent[] {
  const { year, monthIndex } = resolveYearMonth(anchor)
  return events
    .filter((event) => {
      const date = parseDateKey(event.dateKey)
      return date.getFullYear() === year && date.getMonth() === monthIndex
    })
    .sort(compareCalendarUiEvents)
}

export interface MonthlyAssignmentStats {
  weddingCount: number
  sessionCount: number
  assignmentValue: number
}

export function getMonthlyAssignmentStats(
  events: CalendarUiEvent[],
  anchor: Date | { year: number; month: number },
): MonthlyAssignmentStats {
  const inMonth = getAssignmentsInMonth(events, anchor)
  let weddingCount = 0
  let sessionCount = 0
  let assignmentValue = 0
  for (const event of inMonth) {
    if (event.entityType === 'wedding') weddingCount += 1
    else sessionCount += 1
    assignmentValue += event.assignmentValue
  }
  return { weddingCount, sessionCount, assignmentValue }
}

/**
 * Nearest upcoming assignment globally (today inclusive).
 * Independent of the calendar month currently displayed.
 */
export function getNearestUpcomingAssignment(
  events: CalendarUiEvent[],
  todayKey: string = todayDateKey(),
): CalendarUiEvent | null {
  return getUpcomingAssignments(events, todayKey)[0] ?? null
}

/**
 * Upcoming assignments from today inclusive, chronological.
 */
export function getUpcomingAssignments(
  events: CalendarUiEvent[],
  todayKey: string = todayDateKey(),
): CalendarUiEvent[] {
  return events
    .filter((event) => event.dateKey >= todayKey)
    .sort(compareCalendarUiEvents)
}

/**
 * Next N assignments after the hero (nearest). Hero is excluded.
 */
export function getNextAssignmentsAfterNearest(
  events: CalendarUiEvent[],
  count = 3,
  todayKey: string = todayDateKey(),
): CalendarUiEvent[] {
  return getUpcomingAssignments(events, todayKey).slice(1, 1 + count)
}

export function getAssignmentTypeBadgeLabel(
  event: CalendarUiEvent,
): 'Ślub' | 'Sesja' {
  return event.entityType === 'wedding' ? 'Ślub' : 'Sesja'
}

export function assignmentEventKey(event: CalendarUiEvent): string {
  return `${event.entityType}:${event.entityId}`
}
