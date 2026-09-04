/**
 * Modern /kalendarz collection + preview presentation helpers. UI-only.
 * Bind CalendarUiEvent fields — do not fetch.
 */

import { formatCurrency } from '@/lib/utils/currency'
import { getDaysUntil } from '@/lib/utils/dates'
import { UNKNOWN_TIME_LABEL } from '@/features/calendar/utils/calendarEvents'
import type { CalendarUiEvent } from '@/features/calendar/utils/calendarEvents'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'

export function getModernCalendarValueLabel(
  event: Pick<CalendarUiEvent, 'assignmentValue'>,
): string | null {
  const value = Number.isFinite(event.assignmentValue)
    ? event.assignmentValue
    : 0
  if (value <= 0) return null
  return formatCurrency(value)
}

export function getModernCalendarTypeSlot(event: CalendarUiEvent): string | null {
  if (event.entityType === 'wedding') {
    const packageName = event.packageName?.trim()
    return packageName || null
  }
  const typeLabel = event.sessionTypeLabel?.trim()
  return typeLabel || null
}

export function getModernCalendarLocationSlot(
  event: CalendarUiEvent,
): string | null {
  if (event.entityType === 'wedding') {
    const compact = getWeddingPrimaryLocationSummary(event.wedding).displayText
      ?.trim()
    return compact || null
  }
  const location = event.locationSummary?.trim()
  return location || null
}

export function getModernCalendarSupportingLine(
  event: CalendarUiEvent,
): string | null {
  const location = getModernCalendarLocationSlot(event)
  const typeSlot = getModernCalendarTypeSlot(event)
  if (location && typeSlot) return `${location}  ·  ${typeSlot}`
  return location || typeSlot
}

function meaningfulPlace(value?: string | null): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || trimmed === '—' || trimmed === '–' || trimmed === '-') {
    return null
  }
  return trimmed
}

export function getModernCalendarPreviewTime(
  event: CalendarUiEvent,
): string | null {
  const label = event.timeLabel?.trim() ?? ''
  if (label && label !== UNKNOWN_TIME_LABEL) return label
  const time = event.ceremonyTime?.trim() ?? ''
  if (time && time !== UNKNOWN_TIME_LABEL) return time
  return null
}

export type ModernCalendarRemaining =
  | { kind: 'today' }
  | { kind: 'future'; days: number }

export function getModernCalendarRemaining(
  dateKey: string,
  todayKey?: string,
): ModernCalendarRemaining | null {
  const days = todayKey ? dayDiff(todayKey, dateKey) : getDaysUntil(dateKey)
  if (days == null || days < 0) return null
  if (days === 0) return { kind: 'today' }
  return { kind: 'future', days }
}

function dayDiff(fromKey: string, toKey: string): number | null {
  const from = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromKey)
  const to = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toKey)
  if (!from || !to) return null
  const ms =
    Date.UTC(Number(to[1]), Number(to[2]) - 1, Number(to[3])) -
    Date.UTC(Number(from[1]), Number(from[2]) - 1, Number(from[3]))
  return Math.round(ms / 86_400_000)
}

export function formatModernCalendarRemainingValue(days: number): string {
  if (days === 1) return '1 dzień'
  return `${days} dni`
}

export function getModernCalendarPreviewPlaces(event: CalendarUiEvent): {
  ceremony: string | null
  reception: string | null
  session: string | null
} {
  if (event.entityType === 'session') {
    return {
      ceremony: null,
      reception: null,
      session: meaningfulPlace(event.locationSummary),
    }
  }
  const summary = getWeddingPrimaryLocationSummary(event.wedding)
  const reception =
    summary.source === 'reception' || summary.source === 'legacy'
      ? meaningfulPlace(summary.displayText)
      : null
  return { ceremony: null, reception, session: null }
}
