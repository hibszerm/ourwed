import type { Wedding } from '@/types/wedding'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { normalizeEmailForCompare, normalizePhoneForCompare } from './normalizeContact'
import type { ImportDuplicateCandidate, ImportRowIssue, WeddingImportReviewRow } from './types'

export function normalizeCoupleName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function dateAndCoupleKey(weddingDate: string | null, coupleDisplayName: string): string {
  if (!weddingDate || !coupleDisplayName.trim()) return ''
  return `${weddingDate}|${normalizeCoupleName(coupleDisplayName)}`
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
      source: 'existing_wedding',
      weddingId: wedding.id,
      displayName,
      weddingDate: existingDate,
      contractValue: wedding.price ?? null,
      reason: reasons.join(', '),
    })
  }

  return candidates
}

export function isDuplicateIssueCode(code: string): boolean {
  return (
    code === 'DUPLICATE_EXISTING_WEDDING' ||
    code === 'DUPLICATE_IN_FILE' ||
    code === 'POSSIBLE_DUPLICATE'
  )
}

function deriveStatusFromIssues(
  issues: ImportRowIssue[],
  excluded: boolean,
): WeddingImportReviewRow['status'] {
  if (excluded) return 'excluded'
  if (issues.some((i) => i.severity === 'error')) return 'invalid'
  if (issues.some((i) => isDuplicateIssueCode(i.code))) return 'possible_duplicate'
  if (issues.some((i) => i.severity === 'warning')) return 'warning'
  return 'ready'
}

/**
 * Later occurrences of the same identity inside this file are possible
 * duplicates. The first occurrence stays importable (unless it has other issues).
 * Same date + different couple is not a duplicate.
 */
export function applyInFileDuplicateFlags(
  rows: WeddingImportReviewRow[],
): WeddingImportReviewRow[] {
  const seenNameDate = new Map<string, WeddingImportReviewRow>()
  const seenEmail = new Map<string, WeddingImportReviewRow>()
  const seenPhone = new Map<string, WeddingImportReviewRow>()

  return rows.map((row) => {
    const issues = row.issues.filter((issue) => issue.code !== 'DUPLICATE_IN_FILE')
    const candidates = row.duplicateCandidates.filter(
      (candidate) => candidate.source !== 'in_file',
    )
    const matches: ImportDuplicateCandidate[] = []

    const nameKey = dateAndCoupleKey(row.weddingDate, row.coupleDisplayName)
    const emailKey = row.email ? normalizeEmailForCompare(row.email) : ''
    const phoneKey = row.phone ? normalizePhoneForCompare(row.phone) : ''

    const nameFirst = nameKey ? seenNameDate.get(nameKey) : undefined
    if (nameFirst) {
      matches.push({
        source: 'in_file',
        displayName: nameFirst.coupleDisplayName,
        weddingDate: nameFirst.weddingDate,
        contractValue: nameFirst.contractValue,
        reason: 'ta sama data i para w pliku',
        sourceRowNumber: nameFirst.sourceRowNumber,
      })
    }

    const emailFirst = emailKey ? seenEmail.get(emailKey) : undefined
    if (emailFirst && emailFirst.id !== row.id) {
      matches.push({
        source: 'in_file',
        displayName: emailFirst.coupleDisplayName,
        weddingDate: emailFirst.weddingDate,
        contractValue: emailFirst.contractValue,
        reason: 'ten sam e-mail w pliku',
        sourceRowNumber: emailFirst.sourceRowNumber,
      })
    }

    const phoneFirst = phoneKey ? seenPhone.get(phoneKey) : undefined
    if (phoneFirst && phoneFirst.id !== row.id) {
      matches.push({
        source: 'in_file',
        displayName: phoneFirst.coupleDisplayName,
        weddingDate: phoneFirst.weddingDate,
        contractValue: phoneFirst.contractValue,
        reason: 'ten sam telefon w pliku',
        sourceRowNumber: phoneFirst.sourceRowNumber,
      })
    }

    if (matches.length) {
      issues.push({
        code: 'DUPLICATE_IN_FILE',
        severity: 'warning',
        message: 'Ten rekord powtarza się w tym pliku.',
      })
      candidates.push(...matches)
    }

    if (nameKey && !seenNameDate.has(nameKey)) seenNameDate.set(nameKey, row)
    if (emailKey && !seenEmail.has(emailKey)) seenEmail.set(emailKey, row)
    if (phoneKey && !seenPhone.has(phoneKey)) seenPhone.set(phoneKey, row)

    const status = deriveStatusFromIssues(issues, row.status === 'excluded')
    const duplicateBlocked =
      status === 'possible_duplicate' && row.duplicateDecision !== 'import_anyway'

    return {
      ...row,
      issues,
      duplicateCandidates: candidates,
      status,
      selectedForImport:
        row.status === 'excluded' || status === 'invalid' || duplicateBlocked
          ? false
          : row.selectedForImport,
    }
  })
}
