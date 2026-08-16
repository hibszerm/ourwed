import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { formatSessionType } from '@/features/sessions/presentation/sessionType'
import { getSessionLocationSummary } from '@/features/sessions/presentation/getSessionLocationSummary'
import {
  getMonthlyWeddingCount,
  getNearestUpcomingWedding,
} from '@/lib/utils/weddingMetrics'
import type { CalendarEvent } from '@/lib/api/calendarEventService'
import type { Session } from '@/types/session'
import type { Wedding } from '@/types/wedding'
import { compareCalendarUiEvents } from './assignmentMetrics'
import { parseDateKey, toDateKey } from './calendarDates'

export const UNKNOWN_TIME_LABEL = 'Godzina do ustalenia'

/** Chip / block colors — category identity, not workflow stage. */
export interface CalendarEventColors {
  background: string
  text: string
  border: string
}

/** Neutral chip colors for session events. */
export const SESSION_CALENDAR_COLORS: CalendarEventColors = {
  background: 'rgba(0, 0, 0, 0.04)',
  text: '#1a1a1a',
  border: 'rgba(0, 0, 0, 0.12)',
}

/**
 * Neutral wedding event treatment.
 * Package accent remains on the left border via `packageColor` — not workflow stage.
 */
export const WEDDING_CALENDAR_COLORS: CalendarEventColors = {
  background: 'rgba(0, 0, 0, 0.04)',
  text: '#1a1a1a',
  border: 'rgba(0, 0, 0, 0.12)',
}

function compactWeddingLocation(wedding: Wedding): string | undefined {
  return getWeddingPrimaryLocationSummary(wedding).displayText ?? undefined
}

export interface CalendarWeddingEvent {
  entityType: 'wedding'
  entityId: string
  href: string
  id: string
  wedding: Wedding
  dateKey: string
  /** Display title (couple / wedding name). */
  title: string
  coupleLabel: string
  ceremonyLocation: string
  receptionLocation: string
  /** Ceremony start time HH:mm, or undefined if unknown. */
  ceremonyTime?: string
  timeLabel: string
  colors: CalendarEventColors
  packageName: string
  packageColor: string
  /** Badge label for assignment widgets. */
  assignmentTypeLabel: 'Ślub'
  /** Contract / list value (wedding.price). */
  assignmentValue: number
  locationSummary?: string
}

export interface CalendarSessionEvent {
  entityType: 'session'
  entityId: string
  href: string
  id: string
  session: Session
  dateKey: string
  title: string
  sessionTypeLabel: string
  startTime?: string
  endTime?: string
  /** Same role as wedding ceremonyTime for week layout. */
  ceremonyTime?: string
  timeLabel: string
  locationSummary?: string
  colors: CalendarEventColors
  packageColor: string
  assignmentTypeLabel: 'Sesja'
  /** List / stats value (session.totalPrice). */
  assignmentValue: number
}

export type CalendarUiEvent = CalendarWeddingEvent | CalendarSessionEvent

export function getCeremonyTime(wedding: Wedding): string | undefined {
  const ceremony = wedding.schedule.find((event) =>
    /ceremonia/i.test(event.title),
  )
  if (ceremony?.time) return ceremony.time
  // Light calendar path has no schedule hydrate — use weddings.ceremony_time.
  const scalar = wedding.ceremonyTime?.trim()
  return scalar || undefined
}

function extractTimeLabel(iso: string, allDay: boolean): string | undefined {
  if (allDay) return undefined
  const match = iso.match(/T(\d{2}):(\d{2})/)
  if (!match) return undefined
  return `${match[1]}:${match[2]}`
}

export function toCalendarEvent(wedding: Wedding): CalendarWeddingEvent {
  const ceremonyTime = getCeremonyTime(wedding)
  const coupleLabel = getWeddingDisplayName(wedding)

  return {
    entityType: 'wedding',
    entityId: wedding.id,
    href: `/sluby/${wedding.id}`,
    id: wedding.id,
    wedding,
    dateKey: toDateKey(parseDateKey(wedding.date)),
    title: coupleLabel,
    coupleLabel,
    ceremonyLocation: wedding.ceremonyLocation ?? '—',
    receptionLocation: wedding.receptionLocation ?? '—',
    ceremonyTime,
    timeLabel: ceremonyTime ?? UNKNOWN_TIME_LABEL,
    colors: WEDDING_CALENDAR_COLORS,
    packageName: wedding.packageName,
    packageColor: wedding.accentColor,
    assignmentTypeLabel: 'Ślub',
    assignmentValue: wedding.price,
    locationSummary: compactWeddingLocation(wedding),
  }
}

export function toCalendarSessionEvent(session: Session): CalendarSessionEvent {
  const title = getSessionDisplayName(session)
  const startTime = session.startTime?.trim() || undefined
  const endTime = session.endTime?.trim() || undefined
  const locationSummary =
    getSessionLocationSummary(session.location) ?? undefined

  return {
    entityType: 'session',
    entityId: session.id,
    href: `/sesje/${session.id}`,
    id: `session:${session.id}`,
    session,
    dateKey: toDateKey(parseDateKey(session.date)),
    title,
    sessionTypeLabel: formatSessionType(session),
    startTime,
    endTime,
    ceremonyTime: startTime,
    timeLabel: startTime
      ? endTime
        ? `${startTime} – ${endTime}`
        : startTime
      : UNKNOWN_TIME_LABEL,
    locationSummary,
    colors: SESSION_CALENDAR_COLORS,
    packageColor: '#525252',
    assignmentTypeLabel: 'Sesja',
    assignmentValue: session.totalPrice,
  }
}

/** Build UI calendar events from `public.calendar_events` + weddings map. */
export function buildCalendarEventsFromRows(
  events: CalendarEvent[],
  weddings: Wedding[],
): CalendarWeddingEvent[] {
  const byId = new Map(weddings.map((w) => [w.id, w]))
  const mapped: CalendarWeddingEvent[] = []

  for (const event of events) {
    const wedding = byId.get(event.weddingId)
    if (!wedding) continue

    const dateKey = toDateKey(parseDateKey(event.startDate.slice(0, 10)))
    const ceremonyTime =
      extractTimeLabel(event.startDate, event.allDay) ?? getCeremonyTime(wedding)
    const coupleLabel = getWeddingDisplayName(wedding)

    mapped.push({
      entityType: 'wedding',
      entityId: wedding.id,
      href: `/sluby/${wedding.id}`,
      id: event.id,
      wedding,
      dateKey,
      title: coupleLabel,
      coupleLabel,
      ceremonyLocation: event.location || wedding.ceremonyLocation || '—',
      receptionLocation: wedding.receptionLocation ?? '—',
      ceremonyTime,
      timeLabel: ceremonyTime ?? UNKNOWN_TIME_LABEL,
      colors: WEDDING_CALENDAR_COLORS,
      packageName: wedding.packageName,
      packageColor: event.color || wedding.accentColor,
      assignmentTypeLabel: 'Ślub',
      assignmentValue: wedding.price,
      locationSummary:
        event.location?.trim() || compactWeddingLocation(wedding),
    })
  }

  return mapped.sort(compareCalendarUiEvents)
}

/**
 * Compose the unified calendar event list from wedding domain models + sessions.
 * Prefer this when calendar_events rows are not needed (Dashboard, summaries).
 */
export function buildAssignmentEvents(
  weddings: Wedding[],
  sessions: Session[],
): CalendarUiEvent[] {
  return mergeCalendarUiEvents(weddings.map(toCalendarEvent), sessions)
}

/**
 * Compose the unified calendar event list from wedding rows + sessions.
 * This is the single source of truth for grid, nearest, stats, and month list.
 */
export function mergeCalendarUiEvents(
  weddingEvents: CalendarWeddingEvent[],
  sessions: Session[],
): CalendarUiEvent[] {
  const sessionEvents = sessions.map(toCalendarSessionEvent)
  return [...weddingEvents, ...sessionEvents].sort(compareCalendarUiEvents)
}

/** @deprecated Prefer buildCalendarEventsFromRows — calendar_events is source of truth. */
export function buildCalendarEvents(weddings: Wedding[]): CalendarWeddingEvent[] {
  return weddings
    .map(toCalendarEvent)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

export function eventsForDate(
  events: CalendarUiEvent[],
  dateKey: string,
): CalendarUiEvent[] {
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
