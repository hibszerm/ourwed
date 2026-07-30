/**
 * Pure season-navigation semantics for SeasonGroupedList.
 * Kept separate for unit tests (no DOM).
 */

export function areAllSeasonsExpanded(
  seasons: readonly number[],
  expanded: ReadonlySet<number>,
): boolean {
  return seasons.length > 0 && seasons.every((s) => expanded.has(s))
}

/**
 * Chip selection model:
 * - "all" is selected only when every visible season is expanded
 * - otherwise the scroll-tracked year (or first season) is current
 */
export function resolveSeasonChipSelection(input: {
  seasons: readonly number[]
  expanded: ReadonlySet<number>
  activeYear: number | null
}): { allSelected: boolean; currentYear: number | null } {
  const allSelected = areAllSeasonsExpanded(input.seasons, input.expanded)
  const currentYear =
    input.activeYear != null && input.seasons.includes(input.activeYear)
      ? input.activeYear
      : (input.seasons[0] ?? null)
  return { allSelected, currentYear }
}

export function expandSeasonKeepingOthers(
  expanded: ReadonlySet<number>,
  season: number,
): Set<number> {
  const next = new Set(expanded)
  next.add(season)
  return next
}

export function toggleSeasonExpanded(
  expanded: ReadonlySet<number>,
  season: number,
): Set<number> {
  const next = new Set(expanded)
  if (next.has(season)) next.delete(season)
  else next.add(season)
  return next
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
