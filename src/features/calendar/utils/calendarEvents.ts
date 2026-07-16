import { coupleName } from '@/lib/utils/dates'
import {
  getMonthlyWeddingCount,
  getNearestUpcomingWedding,
} from '@/lib/utils/weddingMetrics'
import {
  getWorkflowStageColor,
  getWorkflowStatus,
  type WorkflowStageColor,
} from '@/lib/workflow/workflowEngine'
import type { Wedding, WorkflowStage } from '@/types/wedding'
import { parseDateKey, toDateKey } from './calendarDates'

export const UNKNOWN_TIME_LABEL = 'Godzina do ustalenia'

export interface CalendarWeddingEvent {
  id: string
  wedding: Wedding
  dateKey: string
  coupleLabel: string
  ceremonyLocation: string
  receptionLocation: string
  /** Ceremony start time HH:mm, or undefined if unknown. */
  ceremonyTime?: string
  timeLabel: string
  stage: WorkflowStage
  stageLabel: string
  statusMessage: string
  colors: WorkflowStageColor
  packageName: string
  packageColor: string
}

export function getCeremonyTime(wedding: Wedding): string | undefined {
  const ceremony = wedding.schedule.find((event) =>
    /ceremonia/i.test(event.title),
  )
  return ceremony?.time
}

export function toCalendarEvent(wedding: Wedding): CalendarWeddingEvent {
  const status = getWorkflowStatus(wedding)
  const ceremonyTime = getCeremonyTime(wedding)

  return {
    id: wedding.id,
    wedding,
    dateKey: toDateKey(parseDateKey(wedding.date)),
    coupleLabel: coupleName(wedding.couple.partner1, wedding.couple.partner2),
    ceremonyLocation: wedding.ceremonyLocation ?? '—',
    receptionLocation: wedding.receptionLocation ?? '—',
    ceremonyTime,
    timeLabel: ceremonyTime ?? UNKNOWN_TIME_LABEL,
    stage: status.stage,
    stageLabel: status.stageLabel,
    statusMessage: status.message,
    colors: getWorkflowStageColor(status.stage),
    packageName: wedding.packageName,
    packageColor: wedding.accentColor,
  }
}

export function buildCalendarEvents(weddings: Wedding[]): CalendarWeddingEvent[] {
  return weddings
    .map(toCalendarEvent)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

export function eventsForDate(
  events: CalendarWeddingEvent[],
  dateKey: string,
): CalendarWeddingEvent[] {
  return events.filter((event) => event.dateKey === dateKey)
}

export function countWeddingsInMonth(weddings: Wedding[], anchor: Date): number {
  return getMonthlyWeddingCount(weddings, anchor)
}

export function countWeddingsInYear(weddings: Wedding[], anchor: Date): number {
  const year = anchor.getFullYear()
  return weddings.filter((wedding) => parseDateKey(wedding.date).getFullYear() === year).length
}

/** @deprecated Prefer getNearestUpcomingWedding from weddingMetrics. */
export function getNextUpcomingWedding(weddings: Wedding[]): Wedding | null {
  return getNearestUpcomingWedding(weddings)
}

/** Week timeline: 08:00 → 03:00 next day (19 hours). */
export const WEEK_START_HOUR = 8
export const WEEK_END_HOUR = 27
export const WEEK_HOUR_COUNT = WEEK_END_HOUR - WEEK_START_HOUR
export const WEEK_DEFAULT_DURATION_HOURS = 4

export function getWeekHourSlots(): number[] {
  return Array.from({ length: WEEK_HOUR_COUNT }, (_, i) => WEEK_START_HOUR + i)
}

export function getEventPositionPercent(ceremonyTime: string): {
  top: number
  height: number
} {
  const startMinutes = parseTimeToMinutes(ceremonyTime)
  const timelineStart = WEEK_START_HOUR * 60
  const timelineEnd = WEEK_END_HOUR * 60
  const total = timelineEnd - timelineStart
  const duration = WEEK_DEFAULT_DURATION_HOURS * 60

  const clampedStart = Math.max(startMinutes, timelineStart)
  const end = Math.min(clampedStart + duration, timelineEnd)
  const top = ((clampedStart - timelineStart) / total) * 100
  const height = ((end - clampedStart) / total) * 100

  return { top, height: Math.max(height, 4) }
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}
