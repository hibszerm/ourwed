/**
 * Modern Session Detail — presentation composers only.
 * Reuses shared date helpers; Session-specific countdown copy (not wedding wording).
 */

import { formatSessionType } from '@/features/sessions/presentation/sessionType'
import {
  composeRecordHeroDateParts,
  daysUntilWeddingDate,
  type RecordHeroCountdown,
  type RecordHeroDateParts,
} from '@/features/weddings/modern-detail/modernWeddingDetailModel'
import type { Session } from '@/types/session'

export type SessionHeroMetaView = {
  dateParts: RecordHeroDateParts | null
  countdown: RecordHeroCountdown | null
  metaLine: string | null
}

function personLabel(person?: {
  firstName?: string
  lastName?: string
} | null): string | null {
  if (!person) return null
  const name = [person.firstName, person.lastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ')
  return name || null
}

function locationMetaText(session: Session): string | null {
  const name = session.location?.name?.trim() || null
  const address =
    session.location?.formattedAddress?.trim() ||
    session.location?.address?.trim() ||
    null
  if (name && address && name !== address) return name
  return name || address
}

function timeMetaText(session: Session): string | null {
  const start = session.startTime?.trim()
  const end = session.endTime?.trim()
  if (start && end) return `${start}–${end}`
  if (start) return start
  if (end) return end
  return null
}

/** Session header meta: location · type · time — omit empty segments. */
export function composeSessionHeaderMetaLine(session: Session): string | null {
  const parts = [
    locationMetaText(session),
    formatSessionType(session) || null,
    timeMetaText(session),
  ].filter(Boolean) as string[]
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Countdown rail for Session Detail.
 * Visual structure matches Wedding Detail; copy is session-specific.
 */
export function composeSessionHeroCountdown(
  date: string | null | undefined,
  todayKey?: string,
): RecordHeroCountdown | null {
  const days = daysUntilWeddingDate(date, todayKey)
  if (days == null) return null
  if (days < 0) {
    return { kind: 'past', value: 'PO', unit: 'sesji', caption: null }
  }
  if (days === 0) {
    return { kind: 'today', value: 'DZIŚ', unit: null, caption: null }
  }
  return {
    kind: 'future',
    value: String(days),
    unit: days === 1 ? 'dzień' : 'dni',
    caption: 'do sesji',
  }
}

export function composeSessionHeroMeta(
  session: Session,
  todayKey?: string,
): SessionHeroMetaView {
  return {
    dateParts: composeRecordHeroDateParts(session.date),
    countdown: composeSessionHeroCountdown(session.date, todayKey),
    metaLine: composeSessionHeaderMetaLine(session),
  }
}

export function formatSessionPersonLine(
  person?: { firstName?: string; lastName?: string } | null,
): string {
  return personLabel(person) ?? '—'
}
