/**
 * Soft duplicate signal for manual create + Path B approve.
 * Deterministic, explainable — warning only, never a hard block.
 */

import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import {
  normalizeEmailForCompare,
  normalizePhoneForCompare,
} from '@/features/weddings/import/normalizeContact'
import { normalizeCoupleName } from '@/features/weddings/import/detectDuplicates'
import type { Wedding } from '@/types/wedding'

export type LikelyDuplicateWedding = {
  weddingId: string
  displayName: string
  weddingDate: string | null
  reasons: string[]
}

export function coupleDisplayName(partner1: string, partner2: string): string {
  const a = partner1.trim()
  const b = partner2.trim()
  if (a && b) return `${a} i ${b}`
  return a || b || ''
}

/**
 * Strongest soft signal: same wedding date + same couple display name.
 * Additional soft signals: same email or phone (when present on both sides).
 */
export function findLikelyWeddingDuplicates(input: {
  weddingDate: string | null | undefined
  partner1: string
  partner2: string
  email?: string | null
  phone?: string | null
  existingWeddings: Wedding[]
  /** Exclude a wedding id (e.g. editing — not used for create). */
  excludeWeddingId?: string
}): LikelyDuplicateWedding[] {
  const date = (input.weddingDate ?? '').trim() || null
  const couple = coupleDisplayName(input.partner1, input.partner2)
  const importName = normalizeCoupleName(couple)
  const importEmail = input.email
    ? normalizeEmailForCompare(input.email)
    : ''
  const importPhone = input.phone
    ? normalizePhoneForCompare(input.phone)
    : ''

  if (!date && !importEmail && !importPhone && !importName) return []

  const out: LikelyDuplicateWedding[] = []

  for (const wedding of input.existingWeddings) {
    if (input.excludeWeddingId && wedding.id === input.excludeWeddingId) continue
    const displayName = getWeddingDisplayName(wedding)
    const existingName = normalizeCoupleName(displayName)
    const existingDate = wedding.date || null
    const reasons: string[] = []

    if (date && existingDate === date && importName && importName === existingName) {
      reasons.push('ta sama data i para')
    }

    if (importEmail) {
      const emails = [
        wedding.couple.email,
        wedding.couple.partner1Email,
        wedding.couple.partner2Email,
      ]
        .filter(Boolean)
        .map((e) => normalizeEmailForCompare(String(e)))
      if (emails.includes(importEmail)) reasons.push('ten sam e-mail')
    }

    if (importPhone) {
      const phones = [
        wedding.couple.phone,
        wedding.couple.partner1Phone,
        wedding.couple.partner2Phone,
      ]
        .filter(Boolean)
        .map((p) => normalizePhoneForCompare(String(p)))
      if (phones.includes(importPhone)) reasons.push('ten sam telefon')
    }

    // Soft warn only when we have at least one strong reason.
    // Same-date alone (without couple/contact) must NOT warn.
    const hasStrong =
      reasons.includes('ta sama data i para') ||
      reasons.includes('ten sam e-mail') ||
      reasons.includes('ten sam telefon')
    if (!hasStrong) continue

    out.push({
      weddingId: wedding.id,
      displayName,
      weddingDate: existingDate,
      reasons: [...new Set(reasons)],
    })
  }

  return out
}
