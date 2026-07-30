import type { Session, SessionPerson } from '@/types/session'

export const SESSION_DISPLAY_NAME_FALLBACK = 'Sesja bez nazwy'

function trimPart(value?: string | null): string {
  return value?.trim() ?? ''
}

function fullPersonName(person?: SessionPerson | null): string {
  if (!person) return ''
  return `${trimPart(person.firstName)} ${trimPart(person.lastName)}`.trim()
}

function firstPersonToken(person?: SessionPerson | null): string {
  if (!person) return ''
  return (
    trimPart(person.firstName) ||
    trimPart(person.lastName) ||
    ''
  )
}

export type SessionDisplayNameInput = Pick<
  Session,
  'customName' | 'primaryPerson' | 'secondaryPerson'
>

/**
 * UI display name for a Session. Not persisted.
 * Priority: customName → two people → one full name → first token → fallback.
 */
export function getSessionDisplayName(
  session: SessionDisplayNameInput,
): string {
  const custom = trimPart(session.customName)
  if (custom) return custom

  const primaryFull = fullPersonName(session.primaryPerson)
  const secondaryFull = fullPersonName(session.secondaryPerson)

  if (primaryFull && secondaryFull) {
    const pFirst = trimPart(session.primaryPerson?.firstName) || primaryFull
    const sFirst = trimPart(session.secondaryPerson?.firstName) || secondaryFull
    // Prefer "Anna i Michał" when first names exist; otherwise full names joined.
    if (
      trimPart(session.primaryPerson?.firstName) &&
      trimPart(session.secondaryPerson?.firstName)
    ) {
      return `${pFirst} i ${sFirst}`
    }
    return `${primaryFull} i ${secondaryFull}`
  }

  if (primaryFull) return primaryFull
  if (secondaryFull) return secondaryFull

  const token =
    firstPersonToken(session.primaryPerson) ||
    firstPersonToken(session.secondaryPerson)
  if (token) return token

  return SESSION_DISPLAY_NAME_FALLBACK
}
