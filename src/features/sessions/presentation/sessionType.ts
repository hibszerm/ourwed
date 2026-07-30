import type { Session, SessionType } from '@/types/session'

export const SESSION_TYPES: SessionType[] = [
  'engagement',
  'postWedding',
  'family',
  'business',
  'other',
]

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  engagement: 'Narzeczeńska',
  postWedding: 'Poślubna',
  family: 'Rodzinna',
  business: 'Biznesowa',
  other: 'Inna',
}

export type SessionTypeDisplayInput = Pick<
  Session,
  'sessionType' | 'customSessionType'
>

/** Translated type label; for `other` uses customSessionType when present. */
export function formatSessionType(session: SessionTypeDisplayInput): string {
  if (session.sessionType === 'other') {
    const custom = session.customSessionType?.trim()
    return custom || SESSION_TYPE_LABELS.other
  }
  return SESSION_TYPE_LABELS[session.sessionType] ?? SESSION_TYPE_LABELS.other
}

/** When leaving `other`, custom type must be cleared. */
export function normalizeSessionTypeFields(
  sessionType: SessionType,
  customSessionType?: string | null,
): { sessionType: SessionType; customSessionType?: string } {
  if (sessionType === 'other') {
    const custom = customSessionType?.trim()
    return {
      sessionType,
      customSessionType: custom || undefined,
    }
  }
  return { sessionType, customSessionType: undefined }
}
