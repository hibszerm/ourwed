import {
  toIcsDateValue,
} from '@/features/calendar-integrations/allDayDates'
import type { CanonicalExternalCalendarEvent } from '@/features/calendar-integrations/types'

const CRLF = '\r\n'
const FOLD_LIMIT = 75

/** Escape TEXT values per RFC 5545. */
export function escapeIcsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\r\n', '\\n')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\n')
}

/** Fold long lines with CRLF + space continuation. */
export function foldIcsLine(line: string): string {
  if (line.length <= FOLD_LIMIT) return line
  const chunks: string[] = []
  let remaining = line
  let first = true
  while (remaining.length > 0) {
    const limit = first ? FOLD_LIMIT : FOLD_LIMIT - 1
    if (remaining.length <= limit) {
      chunks.push(first ? remaining : ` ${remaining}`)
      break
    }
    const piece = remaining.slice(0, limit)
    chunks.push(first ? piece : ` ${piece}`)
    remaining = remaining.slice(limit)
    first = false
  }
  return chunks.join(CRLF)
}

export function stableAppleEventUid(
  entityType: string,
  entityId: string,
  domain = 'ourwed.app',
): string {
  return `${entityType}-${entityId}@${domain}`
}

function formatIcsUtcStamp(iso: string | Date = new Date()): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

export type BuildAppleIcsInput = {
  events: CanonicalExternalCalendarEvent[]
  calendarName?: string
  calendarDescription?: string
  prodId?: string
  now?: Date
}

export function buildAppleIcsDocument(input: BuildAppleIcsInput): string {
  const now = input.now ?? new Date()
  const stamp = formatIcsUtcStamp(now)
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${input.prodId ?? '-//OurWed//Calendar//PL'}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(input.calendarName ?? 'OurWed')}`,
    `X-WR-CALDESC:${escapeIcsText(
      input.calendarDescription ??
        'Śluby i sesje z OurWed (tylko do odczytu)',
    )}`,
  ]

  for (const event of input.events) {
    if (!event.eligible) continue
    const uid = stableAppleEventUid(event.entityType, event.entityId)
    const seq = Math.abs(
      Array.from(event.fingerprint).reduce(
        (acc, ch) => (acc + ch.charCodeAt(0)) % 1_000_000,
        0,
      ),
    )
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`DTSTART;VALUE=DATE:${toIcsDateValue(event.startDate)}`)
    lines.push(`DTEND;VALUE=DATE:${toIcsDateValue(event.endDateExclusive)}`)
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`)
    lines.push(`SEQUENCE:${seq}`)
    lines.push(`LAST-MODIFIED:${stamp}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.map(foldIcsLine).join(CRLF) + CRLF
}

/** Google Calendar API all-day payload (exclusive end date). */
export function toGoogleAllDayEventBody(event: CanonicalExternalCalendarEvent): {
  summary: string
  start: { date: string }
  end: { date: string }
} {
  return {
    summary: event.title,
    start: { date: event.startDate },
    end: { date: event.endDateExclusive },
  }
}
