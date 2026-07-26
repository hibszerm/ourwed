/**
 * Run-aware local resolution for fragmented client contact values.
 *
 * Handles real DOCX form fields where digits/letters are interleaved with
 * decorative ellipsis (…), NBSP, and formatting-only run boundaries.
 * Matching stays local to one anchor — never document-wide fuzzy search.
 */

import type { DocumentTextAnchor } from '@/features/ai-contract-lab/aiContractLabTypes'

export type RunAwareMatch = {
  exactSourceText: string
  start: number
  end: number
  normalizedValue: string
  confidence: number
}

type MappedChar = {
  orig: number
  ch: string
  /** Character kept for logical contact reconstruction. */
  logical: string | null
}

function buildCharMap(original: string): MappedChar[] {
  const out: MappedChar[] = []
  for (let i = 0; i < original.length; i += 1) {
    const ch = original[i]!
    if (
      ch === '\u200b' ||
      ch === '\u200c' ||
      ch === '\u200d' ||
      ch === '\ufeff'
    ) {
      out.push({ orig: i, ch, logical: null })
      continue
    }
    const space = /[\u00a0\u202f\u2007]/.test(ch) ? ' ' : ch
    // Decorative ellipsis / middle dots used in form underlines
    if (/[…·•]/.test(space)) {
      out.push({ orig: i, ch: space, logical: null })
      continue
    }
    out.push({
      orig: i,
      ch: space,
      logical: space,
    })
  }
  return out
}

function spanFromLogical(
  map: MappedChar[],
  logicalStart: number,
  logicalEnd: number,
): { start: number; end: number; exact: string } | null {
  const logicalIndices: number[] = []
  for (let i = 0; i < map.length; i += 1) {
    if (map[i]!.logical != null) logicalIndices.push(i)
  }
  if (
    logicalStart < 0 ||
    logicalEnd > logicalIndices.length ||
    logicalStart >= logicalEnd
  ) {
    return null
  }
  const firstMap = logicalIndices[logicalStart]!
  const lastMap = logicalIndices[logicalEnd - 1]!
  // Expand to include adjacent decorative ellipsis that belong to the field.
  let startIdx = firstMap
  let endIdx = lastMap
  while (startIdx > 0 && map[startIdx - 1]!.logical == null && /[…·•]/.test(map[startIdx - 1]!.ch)) {
    startIdx -= 1
  }
  while (
    endIdx + 1 < map.length &&
    map[endIdx + 1]!.logical == null &&
    /[…·•]/.test(map[endIdx + 1]!.ch)
  ) {
    endIdx += 1
  }
  const start = map[startIdx]!.orig
  const end = map[endIdx]!.orig + 1
  return {
    start,
    end,
    exact: map
      .slice(startIdx, endIdx + 1)
      .map((item) => item.ch)
      .join(''),
  }
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Resolve a phone number inside a single anchor, including decorative-dot forms.
 */
export function resolveRunAwarePhone(input: {
  anchor: DocumentTextAnchor
  proposed?: string | null
}): RunAwareMatch | null {
  const text = input.anchor.text
  const map = buildCharMap(text)
  const logical = map.map((item) => item.logical ?? '').join('')
  const proposedDigits = input.proposed ? digitsOnly(input.proposed) : null

  // Prefer labeled region after "telefon:" / "tel."
  const label = /(?:telefon|tel\.?)\s*:?\s*/i.exec(logical)
  const searchFrom = label ? (label.index ?? 0) + label[0].length : 0
  const searchRegion = logical.slice(searchFrom)

  // Collect digit runs allowing spaces between groups
  const phoneRe = /(?:\+48\s*)?(?:\d[\s]*){8,11}\d/g
  const candidates: Array<RunAwareMatch & { score: number }> = []
  let match: RegExpExecArray | null
  while ((match = phoneRe.exec(searchRegion))) {
    const raw = match[0]
    const digits = digitsOnly(raw)
    if (digits.length < 9 || digits.length > 12) continue
    const logicalStart = searchFrom + (match.index ?? 0)
    const logicalEnd = logicalStart + raw.length
    const spanned = spanFromLogical(map, logicalStart, logicalEnd)
    if (!spanned) continue
    let score = 1
    if (proposedDigits && digits.endsWith(proposedDigits.slice(-9))) score += 5
    if (proposedDigits && digits === proposedDigits) score += 3
    if (label) score += 2
    // Prefer 9-digit Polish mobiles
    if (digits.length === 9 || (digits.length === 11 && digits.startsWith('48'))) {
      score += 1
    }
    candidates.push({
      exactSourceText: spanned.exact,
      start: spanned.start,
      end: spanned.end,
      normalizedValue: digits.slice(-9),
      confidence: Math.min(0.99, 0.86 + score * 0.02),
      score,
    })
  }

  // Fallback: reconstruct from digit-only stream in labeled region
  if (candidates.length === 0 && label) {
    const digitStream: Array<{ logicalIndex: number; d: string }> = []
    for (let i = searchFrom; i < logical.length; i += 1) {
      const ch = logical[i]!
      if (/\d/.test(ch)) digitStream.push({ logicalIndex: i, d: ch })
      // Stop at email separator
      if (ch === ',' || ch === '@' || /e/i.test(ch) && logical.slice(i, i + 5).toLowerCase().startsWith('e-mail')) {
        if (digitStream.length >= 9) break
      }
    }
    if (digitStream.length >= 9) {
      const take = digitStream.slice(0, 9)
      const spanned = spanFromLogical(
        map,
        take[0]!.logicalIndex,
        take[8]!.logicalIndex + 1,
      )
      if (spanned) {
        const digits = take.map((item) => item.d).join('')
        candidates.push({
          exactSourceText: spanned.exact,
          start: spanned.start,
          end: spanned.end,
          normalizedValue: digits,
          confidence: 0.94,
          score: proposedDigits && digits === proposedDigits.slice(-9) ? 10 : 4,
        })
      }
    }
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.score - a.score || a.start - b.start)
  const best = candidates[0]!
  return {
    exactSourceText: best.exactSourceText,
    start: best.start,
    end: best.end,
    normalizedValue: best.normalizedValue,
    confidence: best.confidence,
  }
}

/**
 * Resolve an email inside a single anchor, including decorative-dot forms.
 */
export function resolveRunAwareEmail(input: {
  anchor: DocumentTextAnchor
  proposed?: string | null
}): RunAwareMatch | null {
  const text = input.anchor.text
  const map = buildCharMap(text)
  const logical = map.map((item) => item.logical ?? '').join('')
  const proposed = input.proposed?.trim().toLowerCase() ?? null

  const label = /e-?mail\s*:?\s*/i.exec(logical)
  const searchFrom = label ? (label.index ?? 0) + label[0].length : 0
  const searchRegion = logical.slice(searchFrom)

  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  const candidates: Array<RunAwareMatch & { score: number }> = []
  let match: RegExpExecArray | null
  while ((match = emailRe.exec(searchRegion))) {
    const raw = match[0]
    const logicalStart = searchFrom + (match.index ?? 0)
    const logicalEnd = logicalStart + raw.length
    const spanned = spanFromLogical(map, logicalStart, logicalEnd)
    if (!spanned) continue
    const norm = raw.toLowerCase()
    let score = 1
    if (proposed && norm === proposed) score += 5
    if (proposed && norm.includes(proposed.split('@')[0] ?? '')) score += 2
    if (label) score += 2
    candidates.push({
      exactSourceText: spanned.exact,
      start: spanned.start,
      end: spanned.end,
      normalizedValue: norm,
      confidence: Math.min(0.99, 0.86 + score * 0.02),
      score,
    })
  }

  // Fallback: rebuild local-part@domain by stripping spaces from labeled region
  if (candidates.length === 0 && label) {
    const compact = searchRegion.replace(/\s+/g, '')
    const rebuilt = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(compact)
    if (rebuilt) {
      // Find first/last contributing logical indices for the rebuilt email chars
      const wanted = rebuilt[0].toLowerCase()
      let built = ''
      let startLi: number | null = null
      let endLi: number | null = null
      for (let i = searchFrom; i < logical.length; i += 1) {
        const ch = logical[i]!
        if (/\s/.test(ch)) continue
        const next = (built + ch).toLowerCase()
        if (wanted.startsWith(next)) {
          if (startLi == null) startLi = i
          endLi = i
          built += ch
          if (built.toLowerCase() === wanted) break
        } else if (startLi != null) {
          // restart if we drifted
          built = /[A-Z0-9._%+-]/i.test(ch) ? ch : ''
          startLi = built ? i : null
          endLi = startLi
        }
      }
      if (startLi != null && endLi != null && built.toLowerCase() === wanted) {
        const spanned = spanFromLogical(map, startLi, endLi + 1)
        if (spanned) {
          candidates.push({
            exactSourceText: spanned.exact,
            start: spanned.start,
            end: spanned.end,
            normalizedValue: wanted,
            confidence: 0.95,
            score: proposed && wanted === proposed ? 10 : 5,
          })
        }
      }
    }
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.score - a.score || a.start - b.start)
  const best = candidates[0]!
  return {
    exactSourceText: best.exactSourceText,
    start: best.start,
    end: best.end,
    normalizedValue: best.normalizedValue,
    confidence: best.confidence,
  }
}

export function resolveRunAwareClientContact(input: {
  role: string
  anchor: DocumentTextAnchor
  proposedSourceText?: string | null
}): RunAwareMatch | null {
  const role = input.role
  if (/phone|telefon/i.test(role) || role.endsWith('_phone')) {
    return resolveRunAwarePhone({
      anchor: input.anchor,
      proposed: input.proposedSourceText,
    })
  }
  if (/email|mail/i.test(role) || role.endsWith('_email')) {
    return resolveRunAwareEmail({
      anchor: input.anchor,
      proposed: input.proposedSourceText,
    })
  }
  return null
}
