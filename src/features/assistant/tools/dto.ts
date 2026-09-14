import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { getSessionLocationSummary } from '@/features/sessions/presentation/getSessionLocationSummary'
import type { Session } from '@/types/session'
import type { Wedding } from '@/types/wedding'
import type {
  AssistantSessionCardDto,
  AssistantWeddingCardDto,
} from '../types'

export function toWeddingCard(
  wedding: Wedding,
  extras?: Partial<AssistantWeddingCardDto>,
): AssistantWeddingCardDto {
  return {
    id: wedding.id,
    displayName: getWeddingDisplayName(wedding),
    date: wedding.date || null,
    locationLine: getWeddingPrimaryLocationSummary(wedding).displayText ?? null,
    packageName: wedding.packageName?.trim() || null,
    partner1: wedding.couple?.partner1?.trim() || null,
    partner2: wedding.couple?.partner2?.trim() || null,
    ...extras,
  }
}

export function toSessionCard(session: Session): AssistantSessionCardDto {
  const timeParts = [session.startTime, session.endTime].filter(Boolean)
  return {
    id: session.id,
    displayName: getSessionDisplayName(session),
    date: session.date || null,
    timeLine: timeParts.length > 0 ? timeParts.join('–') : null,
    locationLine: getSessionLocationSummary(session.location) ?? null,
  }
}

export function notFoundToolResult(entity: 'wedding' | 'session' = 'wedding') {
  return {
    found: false as const,
    entity,
    /** Neutral — must not leak foreign-tenant existence. */
    message:
      entity === 'session'
        ? 'not_found_session'
        : 'not_found_wedding',
  }
}
