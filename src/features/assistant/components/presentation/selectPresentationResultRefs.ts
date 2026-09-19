/**
 * Phase 2I — presentation-local result selection.
 * Distinguishes evidence references (contract) from result/display refs.
 * Never invents entities or actions from prose.
 */

import type { AssistantReference } from '../../v7/presentation/types'

export type ResultCardinality = 'zero' | 'one' | 'many'

export type PresentationResultSelection = {
  /** Contract evidence (input) — not mutated. */
  evidenceReferences: AssistantReference[]
  /** Current-turn answer members only. */
  resultReferences: AssistantReference[]
  cardinality: ResultCardinality
  reason:
    | 'selection_single'
    | 'selection_suppress_evidence'
    | 'collection_members'
    | 'single_entity'
    | 'empty'
}

function isNavigableWedding(ref: AssistantReference): boolean {
  return (
    ref.kind === 'wedding' &&
    ref.actions.some((a) => a.type === 'open_wedding')
  )
}

function isNavigableSession(ref: AssistantReference): boolean {
  return (
    ref.kind === 'session' &&
    ref.actions.some((a) => a.type === 'open_session')
  )
}

/** Prefer authoritative result refs when present (Phase 2I.1). */
function navigableForDisplay(
  evidence: AssistantReference[],
): AssistantReference[] {
  const results = evidence.filter(
    (r) =>
      r.role === 'result' &&
      (isNavigableWedding(r) || isNavigableSession(r)),
  )
  if (results.length > 0) return results
  // Back-compat: no authoritative selection → all navigable OPEN refs.
  return evidence.filter(
    (r) => isNavigableWedding(r) || isNavigableSession(r),
  )
}

function normalizeUtterance(raw: string): string {
  return raw
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Conservative selection/ranking follow-up detector.
 * Not a full NL ranker — only gates result cardinality reduction.
 * Avoids treating "najbliższa sesja" detail asks as multi-candidate ranking.
 */
export function isSelectionPresentationUtterance(utterance: string): boolean {
  const u = normalizeUtterance(utterance)
  if (!u) return false
  // Explicit list / detail phrasing stays out of selection reduction.
  if (
    u.includes('jakie mam') ||
    u.includes('lista ') ||
    u.includes('pokaz ') ||
    u.includes('pokaż ') ||
    u.includes('opowiedz') ||
    u.includes('co wiesz')
  ) {
    return false
  }

  const hasWhich = /\bktore\b|\bktora\b|\bktory\b|\bz nich\b/.test(u)
  const hasPriceRank = /\b(najdrozsz|najtansz)\b/.test(u)
  const hasOrderRank = /\b(najbliz|najwyzsz|najnizsz|najwczes|najpozniej)\b/.test(
    u,
  )

  // "a które jest najdroższe?" / "które jest najbliżej?"
  if (hasWhich && (hasPriceRank || hasOrderRank || /\bjest\b/.test(u))) {
    return true
  }
  // Bare price extremes still selection among prior set
  if (hasPriceRank) return true
  if (/\b(pierwsz|ostatni)/.test(u) && hasWhich) return true
  return false
}

function isPriceLikeSelection(utterance: string): boolean {
  const u = normalizeUtterance(utterance)
  return /\b(najdrozsz|najtansz|cena|kwota|wartosc|platn|finan)/.test(u)
}

/**
 * Combined chronological top-K for mixed assignment candidates.
 * Presentation/test helper — uses structured ISO dates only.
 */
export function selectCombinedChronologicalTopK<
  T extends { date?: string; id: string },
>(candidates: T[], k: number): T[] {
  if (k < 1 || candidates.length === 0) return []
  const indexed = candidates.map((c, i) => ({ c, i }))
  indexed.sort((a, b) => {
    const da = a.c.date && /^\d{4}-\d{2}-\d{2}/.test(a.c.date) ? a.c.date : '9999-99-99'
    const db = b.c.date && /^\d{4}-\d{2}-\d{2}/.test(b.c.date) ? b.c.date : '9999-99-99'
    const byDate = da.localeCompare(db)
    if (byDate !== 0) return byDate
    return a.i - b.i
  })
  return indexed.slice(0, k).map((x) => x.c)
}

/**
 * Reduce contract evidence → current-turn result refs for display.
 */
export function selectPresentationResultRefs(input: {
  utterance: string
  evidenceReferences: AssistantReference[]
  /** When true, apply selection/ranking cardinality rules. */
  selectionQuery: boolean
}): PresentationResultSelection {
  const evidence = input.evidenceReferences
  const navigable = navigableForDisplay(evidence)
  const weddings = navigable.filter(isNavigableWedding)
  const sessions = navigable.filter(isNavigableSession)

  if (navigable.length === 0) {
    return {
      evidenceReferences: evidence,
      resultReferences: [],
      cardinality: 'zero',
      reason: 'empty',
    }
  }

  if (input.selectionQuery) {
    // Price-like mixed evidence: wedding is the comparable commercial entity.
    if (
      isPriceLikeSelection(input.utterance) &&
      weddings.length === 1 &&
      sessions.length >= 1
    ) {
      return {
        evidenceReferences: evidence,
        resultReferences: [weddings[0]!],
        cardinality: 'one',
        reason: 'selection_single',
      }
    }
    if (weddings.length === 1 && sessions.length === 0) {
      return {
        evidenceReferences: evidence,
        resultReferences: [weddings[0]!],
        cardinality: 'one',
        reason: 'selection_single',
      }
    }
    if (sessions.length === 1 && weddings.length === 0) {
      return {
        evidenceReferences: evidence,
        resultReferences: [sessions[0]!],
        cardinality: 'one',
        reason: 'selection_single',
      }
    }
    // Multiple comparison candidates / mixed non-price → do not display as results.
    return {
      evidenceReferences: evidence,
      resultReferences: [],
      cardinality: 'zero',
      reason: 'selection_suppress_evidence',
    }
  }

  if (navigable.length >= 2) {
    return {
      evidenceReferences: evidence,
      resultReferences: navigable,
      cardinality: 'many',
      reason: 'collection_members',
    }
  }

  return {
    evidenceReferences: evidence,
    resultReferences: navigable,
    cardinality: 'one',
    reason: 'single_entity',
  }
}
