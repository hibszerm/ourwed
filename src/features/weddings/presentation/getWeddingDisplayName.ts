import type { Couple, Wedding } from '@/types/wedding'

export const WEDDING_DISPLAY_NAME_FALLBACK = 'Bez tytułu'

const PARTNER_PLACEHOLDERS = new Set(['—', '–', '-', 'n/a', 'na', 'brak'])

export type WeddingDisplayNameInput = Pick<Wedding, 'couple' | 'displayName'>

export type GetWeddingDisplayNameOptions = {
  /** Prefer first names when both real partners are present. */
  short?: boolean
}

function cleanPart(value: string | undefined | null): string {
  return (value ?? '').trim()
}

export function isAbsentPartnerName(value: string | undefined | null): boolean {
  const cleaned = cleanPart(value)
  if (!cleaned) return true
  return PARTNER_PLACEHOLDERS.has(cleaned.toLowerCase())
}

function partnerFullName(
  couple: Couple,
  which: 'partner1' | 'partner2',
  short: boolean,
): string {
  if (which === 'partner1') {
    if (short) {
      return (
        cleanPart(couple.partner1FirstName) ||
        cleanPart(couple.partner1).split(/\s+/)[0] ||
        ''
      )
    }
    return (
      [couple.partner1FirstName, couple.partner1LastName]
        .map(cleanPart)
        .filter(Boolean)
        .join(' ') || cleanPart(couple.partner1)
    )
  }

  if (short) {
    return (
      cleanPart(couple.partner2FirstName) ||
      cleanPart(couple.partner2).split(/\s+/)[0] ||
      ''
    )
  }
  return (
    [couple.partner2FirstName, couple.partner2LastName]
      .map(cleanPart)
      .filter(Boolean)
      .join(' ') || cleanPart(couple.partner2)
  )
}

/**
 * UI-only wedding title. Never use in contracts, questionnaires, merge fields,
 * or other business workflows — those must keep reading partner/client data.
 */
export function getWeddingDisplayName(
  wedding: WeddingDisplayNameInput,
  options: GetWeddingDisplayNameOptions = {},
): string {
  const manual = cleanPart(wedding.displayName)
  if (manual) return manual

  const partner1 = partnerFullName(wedding.couple, 'partner1', Boolean(options.short))
  const partner2Raw = partnerFullName(wedding.couple, 'partner2', Boolean(options.short))
  const partner2 = isAbsentPartnerName(partner2Raw) ? '' : partner2Raw

  if (partner1 && partner2) return `${partner1} i ${partner2}`
  if (partner1) return partner1
  if (partner2) return partner2
  return WEDDING_DISPLAY_NAME_FALLBACK
}
