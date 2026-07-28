import type { Wedding } from '@/types/wedding'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { normalizeEmailForCompare, normalizePhoneForCompare } from './normalizeContact'
import type { ImportDuplicateCandidate } from './types'

function normalizeCoupleName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function detectDuplicateCandidates(input: {
  weddingDate: string | null
  coupleDisplayName: string
  partner1Name: string
  partner2Name: string
  email?: string
  phone?: string
  contractValue: number | null
  existingWeddings: Wedding[]
}): ImportDuplicateCandidate[] {
  const candidates: ImportDuplicateCandidate[] = []
  const importName = normalizeCoupleName(input.coupleDisplayName)
  const importEmail = input.email ? normalizeEmailForCompare(input.email) : ''
  const importPhone = input.phone ? normalizePhoneForCompare(input.phone) : ''

  for (const wedding of input.existingWeddings) {
    const displayName = getWeddingDisplayName(wedding)
    const existingName = normalizeCoupleName(displayName)
    const existingDate = wedding.date || null
    const reasons: string[] = []

    if (
      input.weddingDate &&
      existingDate === input.weddingDate &&
      importName &&
      importName === existingName
    ) {
      reasons.push('ta sama data i para')
    }

    if (importEmail && wedding.couple.email) {
      if (importEmail === normalizeEmailForCompare(wedding.couple.email)) {
        reasons.push('ten sam e-mail')
      }
    }

    if (importPhone && wedding.couple.phone) {
      if (importPhone === normalizePhoneForCompare(wedding.couple.phone)) {
        reasons.push('ten sam telefon')
      }
    }

    if (
      input.weddingDate &&
      existingDate === input.weddingDate &&
      input.contractValue != null &&
      wedding.price === input.contractValue &&
      importName &&
      existingName.includes(importName.split(' ')[0] ?? '')
    ) {
      reasons.push('ta sama data i kwota')
    }

    if (!reasons.length) continue

    candidates.push({
      weddingId: wedding.id,
      displayName,
      weddingDate: existingDate,
      contractValue: wedding.price ?? null,
      reason: reasons.join(', '),
    })
  }

  return candidates
}
