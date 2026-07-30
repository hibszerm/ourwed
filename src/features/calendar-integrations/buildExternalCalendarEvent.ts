import {
  addOneCalendarDay,
  isCalendarDateOnOrAfter,
  toCalendarDate,
  todayCalendarDate,
} from '@/features/calendar-integrations/allDayDates'
import {
  buildSessionExternalTitle,
  buildWeddingExternalTitle,
} from '@/features/calendar-integrations/externalTitles'
import type {
  CalendarBackfillMode,
  CanonicalExternalCalendarEvent,
} from '@/features/calendar-integrations/types'
import type { Session } from '@/types/session'
import type { Wedding, WeddingStatus } from '@/types/wedding'

export type ExternalCalendarCategorySettings = {
  syncWeddings: boolean
  syncSessions: boolean
  backfillMode: CalendarBackfillMode
  /** YYYY-MM-DD — typically photographer's local calendar today. */
  referenceDate?: string
  timeZone?: string
}

function fingerprint(parts: {
  entityType: string
  entityId: string
  startDate: string
  title: string
}): string {
  return [
    parts.entityType,
    parts.entityId,
    parts.startDate,
    parts.title,
  ].join('|')
}

export function isWeddingEligibleStatus(status: WeddingStatus): boolean {
  // Archived historical records remain in calendars.
  // Cancelled orders are removed (no longer booked).
  return status !== 'cancelled'
}

export function buildWeddingExternalCalendarEvent(
  wedding: Pick<Wedding, 'id' | 'date' | 'status' | 'couple' | 'displayName'>,
  settings: ExternalCalendarCategorySettings,
): CanonicalExternalCalendarEvent {
  const startDate = toCalendarDate(wedding.date)
  if (!startDate) {
    return {
      entityType: 'wedding',
      entityId: wedding.id,
      startDate: '',
      endDateExclusive: '',
      title: '',
      eligible: false,
      omissionReason: 'no_date',
      fingerprint: '',
    }
  }

  if (!isWeddingEligibleStatus(wedding.status)) {
    return {
      entityType: 'wedding',
      entityId: wedding.id,
      startDate,
      endDateExclusive: addOneCalendarDay(startDate),
      title: buildWeddingExternalTitle(wedding),
      eligible: false,
      omissionReason: 'cancelled',
      fingerprint: '',
    }
  }

  if (!settings.syncWeddings) {
    return {
      entityType: 'wedding',
      entityId: wedding.id,
      startDate,
      endDateExclusive: addOneCalendarDay(startDate),
      title: buildWeddingExternalTitle(wedding),
      eligible: false,
      omissionReason: 'category_disabled',
      fingerprint: '',
    }
  }

  const reference =
    settings.referenceDate ??
    todayCalendarDate(settings.timeZone ?? 'Europe/Warsaw')
  if (
    settings.backfillMode === 'future' &&
    !isCalendarDateOnOrAfter(startDate, reference)
  ) {
    return {
      entityType: 'wedding',
      entityId: wedding.id,
      startDate,
      endDateExclusive: addOneCalendarDay(startDate),
      title: buildWeddingExternalTitle(wedding),
      eligible: false,
      omissionReason: 'backfill_future',
      fingerprint: '',
    }
  }

  const title = buildWeddingExternalTitle(wedding)
  const endDateExclusive = addOneCalendarDay(startDate)
  return {
    entityType: 'wedding',
    entityId: wedding.id,
    startDate,
    endDateExclusive,
    title,
    eligible: true,
    fingerprint: fingerprint({
      entityType: 'wedding',
      entityId: wedding.id,
      startDate,
      title,
    }),
  }
}

export function buildSessionExternalCalendarEvent(
  session: Pick<
    Session,
    | 'id'
    | 'date'
    | 'customName'
    | 'primaryPerson'
    | 'secondaryPerson'
    | 'sessionType'
    | 'customSessionType'
  >,
  settings: ExternalCalendarCategorySettings,
): CanonicalExternalCalendarEvent {
  const startDate = toCalendarDate(session.date)
  if (!startDate) {
    return {
      entityType: 'session',
      entityId: session.id,
      startDate: '',
      endDateExclusive: '',
      title: '',
      eligible: false,
      omissionReason: 'no_date',
      fingerprint: '',
    }
  }

  if (!settings.syncSessions) {
    return {
      entityType: 'session',
      entityId: session.id,
      startDate,
      endDateExclusive: addOneCalendarDay(startDate),
      title: buildSessionExternalTitle(session),
      eligible: false,
      omissionReason: 'category_disabled',
      fingerprint: '',
    }
  }

  const reference =
    settings.referenceDate ??
    todayCalendarDate(settings.timeZone ?? 'Europe/Warsaw')
  if (
    settings.backfillMode === 'future' &&
    !isCalendarDateOnOrAfter(startDate, reference)
  ) {
    return {
      entityType: 'session',
      entityId: session.id,
      startDate,
      endDateExclusive: addOneCalendarDay(startDate),
      title: buildSessionExternalTitle(session),
      eligible: false,
      omissionReason: 'backfill_future',
      fingerprint: '',
    }
  }

  const title = buildSessionExternalTitle(session)
  const endDateExclusive = addOneCalendarDay(startDate)
  return {
    entityType: 'session',
    entityId: session.id,
    startDate,
    endDateExclusive,
    title,
    eligible: true,
    fingerprint: fingerprint({
      entityType: 'session',
      entityId: session.id,
      startDate,
      title,
    }),
  }
}

/** Provider-neutral builder entry used by Google sync and Apple ICS. */
export function buildExternalCalendarEvent(
  entity:
    | {
        kind: 'wedding'
        wedding: Parameters<typeof buildWeddingExternalCalendarEvent>[0]
      }
    | {
        kind: 'session'
        session: Parameters<typeof buildSessionExternalCalendarEvent>[0]
      },
  settings: ExternalCalendarCategorySettings,
): CanonicalExternalCalendarEvent {
  if (entity.kind === 'wedding') {
    return buildWeddingExternalCalendarEvent(entity.wedding, settings)
  }
  return buildSessionExternalCalendarEvent(entity.session, settings)
}
