/**
 * Shared season grouping for Weddings & Sessions list pages.
 * Season = calendar year of the event date (never createdAt/updatedAt).
 */

export type SeasonGroup<T> = {
  season: number
  items: T[]
}

/** Extract YYYY from ISO date key `YYYY-MM-DD` (or longer ISO). */
export function getEventSeasonYear(dateKey: string | null | undefined): number | null {
  if (!dateKey) return null
  const match = String(dateKey).trim().match(/^(\d{4})/)
  if (!match) return null
  const year = Number(match[1])
  return Number.isFinite(year) ? year : null
}

/**
 * Sort seasons for list display:
 * 1. current year
 * 2. future years ascending
 * 3. past years descending
 */
export function compareSeasonsForDisplay(
  a: number,
  b: number,
  referenceYear: number,
): number {
  const rank = (year: number): [number, number] => {
    if (year === referenceYear) return [0, 0]
    if (year > referenceYear) return [1, year]
    return [2, -year]
  }
  const [ar, av] = rank(a)
  const [br, bv] = rank(b)
  if (ar !== br) return ar - br
  return av - bv
}

export type GroupAssignmentsBySeasonOptions = {
  /** Defaults to the calendar year of "today". */
  referenceYear?: number
}

/**
 * Group a flat assignment list by event-year season.
 * Preserves relative item order within each season (caller should pre-sort).
 * Items without a parseable date are omitted.
 */
export function groupAssignmentsBySeason<T>(
  items: readonly T[],
  getDate: (item: T) => string | null | undefined,
  options: GroupAssignmentsBySeasonOptions = {},
): SeasonGroup<T>[] {
  const referenceYear =
    options.referenceYear ?? new Date().getFullYear()

  const byYear = new Map<number, T[]>()
  for (const item of items) {
    const year = getEventSeasonYear(getDate(item))
    if (year == null) continue
    const bucket = byYear.get(year)
    if (bucket) bucket.push(item)
    else byYear.set(year, [item])
  }

  return [...byYear.entries()]
    .sort(([a], [b]) => compareSeasonsForDisplay(a, b, referenceYear))
    .map(([season, seasonItems]) => ({ season, items: seasonItems }))
}

/** Polish count for weddings: 1 ślub / 2–4 śluby / 5+ ślubów */
export function formatWeddingSeasonCount(count: number): string {
  const n = Math.max(0, Math.floor(count))
  return `${n} ${polishWeddingNoun(n)}`
}

/** Polish count for sessions: 1 sesja / 2–4 sesje / 5+ sesji */
export function formatSessionSeasonCount(count: number): string {
  const n = Math.max(0, Math.floor(count))
  return `${n} ${polishSessionNoun(n)}`
}

function polishWeddingNoun(n: number): string {
  if (n === 1) return 'ślub'
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return 'śluby'
  }
  return 'ślubów'
}

function polishSessionNoun(n: number): string {
  if (n === 1) return 'sesja'
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return 'sesje'
  }
  return 'sesji'
}

/** Initial expanded set: current season only when present; else first group. */
export function getDefaultExpandedSeasons(
  groups: readonly SeasonGroup<unknown>[],
  referenceYear: number = new Date().getFullYear(),
): Set<number> {
  if (groups.length === 0) return new Set()
  if (groups.some((g) => g.season === referenceYear)) {
    return new Set([referenceYear])
  }
  return new Set([groups[0]!.season])
}
