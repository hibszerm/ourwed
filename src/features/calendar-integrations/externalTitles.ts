import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { formatSessionType } from '@/features/sessions/presentation/sessionType'
import type { Wedding } from '@/types/wedding'
import type { Session } from '@/types/session'

/** External calendar title for a Wedding — Polish, no emoji, no PII beyond names. */
export function buildWeddingExternalTitle(
  wedding: Pick<Wedding, 'couple' | 'displayName'>,
): string {
  const name = getWeddingDisplayName(wedding, { short: true })
  return `Ślub — ${name}`
}

/** External calendar title for a Session. */
export function buildSessionExternalTitle(
  session: Pick<
    Session,
    | 'customName'
    | 'primaryPerson'
    | 'secondaryPerson'
    | 'sessionType'
    | 'customSessionType'
  >,
): string {
  const custom = session.customName?.trim()
  if (custom) {
    return /^sesja\b/i.test(custom) ? custom : `Sesja — ${custom}`
  }
  const typeLabel = formatSessionType(session)
  const typeLower =
    typeLabel.length > 0
      ? typeLabel.charAt(0).toLocaleLowerCase('pl-PL') + typeLabel.slice(1)
      : 'sesja'
  const name = getSessionDisplayName(session)
  return `Sesja ${typeLower} — ${name}`
}
