/**
 * Generic capability search — token overlap over sealed metadata text.
 * No synonym maps, no intent tables, no capability-specific branches.
 *
 * K3 scale: generic field weighting + phrase/coverage bonuses + slightly higher top-k.
 */

import {
  getCapability,
  listCapabilities,
  sealCapability,
} from './registry'
import type { SealedCapabilityKnowledge } from './types'

const DEFAULT_LIMIT = 8
const MAX_LIMIT = 12

/** Generic function words — not capability-specific synonyms. */
const STOP = new Set(
  [
    'jak',
    'gdzie',
    'co',
    'mam',
    'musi',
    'musze',
    'trzeba',
    'zeby',
    'żeby',
    'dla',
    'przy',
    'oraz',
    'albo',
    'lub',
    'the',
    'and',
    'for',
    'with',
    'from',
    'this',
    'that',
    'ourwed',
    'systemie',
    'aplikacji',
    'funkcji',
    'korzystac',
    'skorzystac',
    'znajde',
    'znajdę',
  ].map((s) => s.normalize('NFD').replace(/\p{M}/gu, '')),
)

function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function normalizeToken(raw: string): string {
  return normalizeText(raw).replace(/[^a-z0-9]+/gi, '')
}

function tokenize(text: string): string[] {
  return text
    .split(/[\s/._:?&=,\-!]+/)
    .map(normalizeToken)
    .filter((t) => t.length >= 3 && !STOP.has(t))
}

function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text))
}

function overlapScore(
  queryTokens: string[],
  fieldTokens: Set<string>,
  weight: number,
): number {
  let score = 0
  for (const qt of queryTokens) {
    if (fieldTokens.has(qt)) {
      score += weight
      continue
    }
    // Soft prefix / shared stem only for longer tokens (generic; no synonym table)
    if (qt.length < 5) continue
    for (const ct of fieldTokens) {
      if (ct.length < 5) continue
      if (ct.startsWith(qt) || qt.startsWith(ct)) {
        score += Math.max(1, Math.floor(weight / 2))
        break
      }
      // Shared prefix of length >= 5 (e.g. usun/usunac, edytuj/edycja)
      const n = Math.min(qt.length, ct.length)
      let shared = 0
      while (shared < n && qt[shared] === ct[shared]) shared += 1
      if (shared >= 5) {
        score += Math.max(1, Math.floor(weight / 3))
        break
      }
    }
  }
  return score
}

function phraseBonus(queryNorm: string, fieldNorm: string, weight: number): number {
  if (queryNorm.length < 6 || fieldNorm.length < 6) return 0
  // Longest contiguous query window of 2+ tokens present in field
  const qTokens = queryNorm.split(/\s+/).filter(Boolean)
  if (qTokens.length < 2) {
    return fieldNorm.includes(queryNorm) ? weight : 0
  }
  let best = 0
  for (let i = 0; i < qTokens.length; i++) {
    for (let j = i + 1; j <= qTokens.length; j++) {
      const window = qTokens.slice(i, j).join(' ')
      if (window.length < 6) continue
      if (fieldNorm.includes(window)) {
        best = Math.max(best, j - i)
      }
    }
  }
  if (best >= 3) return weight * 2
  if (best >= 2) return weight
  return 0
}

export type ProductKnowledgeSearchInput = {
  query?: string
  terms?: string[]
  capability_id?: string
  limit?: number
}

export type ProductKnowledgeSearchResult = {
  results: SealedCapabilityKnowledge[]
}

export function searchProductKnowledge(
  input: ProductKnowledgeSearchInput,
): ProductKnowledgeSearchResult {
  const limit = Math.min(
    Math.max(1, input.limit ?? DEFAULT_LIMIT),
    MAX_LIMIT,
  )

  if (input.capability_id) {
    const exact = getCapability(input.capability_id)
    return {
      results: exact ? [sealCapability(exact)] : [],
    }
  }

  const queryParts = [
    typeof input.query === 'string' ? input.query : '',
    ...(Array.isArray(input.terms)
      ? input.terms.filter((t): t is string => typeof t === 'string')
      : []),
  ]
  const queryJoined = queryParts.join(' ')
  const queryTokens = tokenize(queryJoined)
  if (queryTokens.length === 0) {
    return { results: [] }
  }
  const queryNorm = normalizeText(queryJoined).replace(/[^a-z0-9\s]+/gi, ' ')

  const ranked = listCapabilities()
    .map((cap) => {
      const titleTokens = tokenSet(cap.title)
      const summaryTokens = tokenSet(cap.summary)
      const helpTokens = tokenSet(
        [
          ...(cap.help.steps ?? []),
          ...(cap.help.prerequisites ?? []),
          ...(cap.help.notes ?? []),
        ].join(' '),
      )
      const domainTokens = tokenSet(cap.domain)
      const idTokens = tokenSet(cap.id.replace(/\./g, ' '))
      const routeTokens = tokenSet(cap.navigation?.routePattern ?? '')

      let score =
        overlapScore(queryTokens, titleTokens, 14) +
        overlapScore(queryTokens, idTokens, 11) +
        overlapScore(queryTokens, domainTokens, 5) +
        overlapScore(queryTokens, summaryTokens, 5) +
        overlapScore(queryTokens, helpTokens, 3) +
        overlapScore(queryTokens, routeTokens, 2)

      // Exact title token-set containment
      if (
        titleTokens.size > 0 &&
        [...titleTokens].every((t) => queryTokens.includes(t))
      ) {
        score += 28
      } else if (titleTokens.size > 0) {
        // Partial title coverage (generic ranking)
        const hit = [...titleTokens].filter((t) =>
          queryTokens.some(
            (q) =>
              q === t ||
              (q.length >= 5 && t.length >= 5 && (q.startsWith(t) || t.startsWith(q))),
          ),
        ).length
        const frac = hit / titleTokens.size
        if (frac >= 0.5) score += Math.round(16 * frac)
      }

      const titleNorm = normalizeText(cap.title)
      const summaryNorm = normalizeText(cap.summary)
      score += phraseBonus(queryNorm, titleNorm, 10)
      score += phraseBonus(queryNorm, summaryNorm, 6)

      return { cap, score }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.cap.id.localeCompare(b.cap.id))
    .slice(0, limit)

  return {
    results: ranked.map((r) => sealCapability(r.cap)),
  }
}
