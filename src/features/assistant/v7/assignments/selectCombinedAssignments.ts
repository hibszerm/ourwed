/**
 * Phase 2I.1 — deterministic combined assignment selection.
 * Pure merge → sort by structured date ASC → limit K (after merge).
 * No prose parsing. No CRM side effects.
 */

export type CombinedAssignmentKind = 'wedding' | 'session'

export type CombinedAssignmentCandidate = {
  kind: CombinedAssignmentKind
  entityId: string
  date: string
  displayName: string | null
}

/**
 * Global chronological top-K across mixed assignment candidates.
 * Limit applies AFTER merge/sort. Stable for equal dates (input order).
 */
export function selectCombinedAssignments(
  candidates: readonly CombinedAssignmentCandidate[],
  limit: number,
): CombinedAssignmentCandidate[] {
  if (!Number.isInteger(limit) || limit < 1) return []
  const indexed = candidates
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => /^\d{4}-\d{2}-\d{2}$/.test(c.date) && Boolean(c.entityId))
  indexed.sort((a, b) => {
    const byDate = a.c.date.localeCompare(b.c.date)
    if (byDate !== 0) return byDate
    return a.i - b.i
  })
  return indexed.slice(0, limit).map((x) => x.c)
}
