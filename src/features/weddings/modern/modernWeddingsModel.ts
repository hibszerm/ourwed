/**
 * Modern /sluby presentation helpers. UI-only.
 * Do not fetch; operate on the existing light wedding list.
 */

import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getWeddingPrimaryLocationSummary } from '@/features/weddings/presentation/getWeddingPrimaryLocationSummary'
import { getContractValue } from '@/lib/utils/commercial'
import { formatCurrency } from '@/lib/utils/currency'
import { localCalendarDateKey, toLocalCalendarDateKey } from '@/lib/utils/localCalendarDate'
import type { Wedding, WeddingStatus } from '@/types/wedding'

export const NEAR_TERM_MAX_DAYS = 14

export function isArchivedOrCancelled(wedding: Pick<Wedding, 'status'>): boolean {
  return wedding.status === 'archived' || wedding.status === 'cancelled'
}

export function weddingStatusCue(status: WeddingStatus): string | null {
  if (status === 'archived') return 'Zarchiwizowany'
  if (status === 'cancelled') return 'Anulowany'
  return null
}

export function getModernWeddingSearchText(wedding: Wedding): string {
  const name = getWeddingDisplayName(wedding)
  const location = getWeddingPrimaryLocationSummary(wedding).displayText ?? ''
  const packageName = wedding.packageName?.trim() ?? ''
  return `${name} ${location} ${packageName}`.trim()
}

export function matchesModernWeddingSearch(
  wedding: Wedding,
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return getModernWeddingSearchText(wedding).toLowerCase().includes(q)
}

export function getModernContractValueLabel(
  wedding: Pick<Wedding, 'price'>,
): string | null {
  const value = getContractValue(wedding)
  if (value <= 0) return null
  return formatCurrency(value)
}

function parseDay(key: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  return {
    y: Number(match[1]),
    m: Number(match[2]),
    d: Number(match[3]),
  }
}

export function localCalendarDayDiff(
  fromKey: string,
  toKey: string,
): number | null {
  const from = parseDay(fromKey)
  const to = parseDay(toKey)
  if (!from || !to) return null
  const ms =
    Date.UTC(to.y, to.m - 1, to.d) - Date.UTC(from.y, from.m - 1, from.d)
  return Math.round(ms / 86_400_000)
}

export function daysUntilWeddingDate(
  date: string,
  todayKey: string = localCalendarDateKey(),
): number | null {
  const key = toLocalCalendarDateKey(date)
  if (!key) return null
  return localCalendarDayDiff(todayKey, key)
}

export function getNearTermCue(
  date: string,
  todayKey: string = localCalendarDateKey(),
): string | null {
  const days = daysUntilWeddingDate(date, todayKey)
  if (days == null || days < 0 || days > NEAR_TERM_MAX_DAYS) return null
  if (days === 0) return 'dzisiaj'
  if (days === 1) return 'za 1 dzień'
  return `za ${days} dni`
}

export type EditorialDateParts = {
  day: string
  month: string
  weekday: string
  dateTime: string
}

export function getEditorialDateParts(date: string): EditorialDateParts | null {
  const key = toLocalCalendarDateKey(date)
  if (!key) return null
  const parsed = parseDay(key)
  if (!parsed) return null
  const local = new Date(parsed.y, parsed.m - 1, parsed.d, 12, 0, 0)
  return {
    day: local.toLocaleDateString('pl-PL', { day: 'numeric' }),
    month: local.toLocaleDateString('pl-PL', { month: 'short' }),
    weekday: local.toLocaleDateString('pl-PL', { weekday: 'short' }),
    dateTime: key,
  }
}

/** Horizontal ledger date: "20 SIE 2026". Year stays visible inside season groups. */
export function formatLedgerFullDate(parts: EditorialDateParts): string {
  const month = parts.month.replace(/\./g, '').trim().toLocaleUpperCase('pl-PL')
  const year = parts.dateTime.slice(0, 4)
  return `${parts.day} ${month} ${year}`
}

export function compareWeddingDateAsc(a: Wedding, b: Wedding): number {
  return (a.date || '').localeCompare(b.date || '')
}

export type ModernSeasonGroup = {
  season: number
  items: Wedding[]
}

export type ModernSeasonLayer = {
  /** Full calendar year of the current season. Null when that year has no visible weddings. */
  active: ModernSeasonGroup | null
  future: ModernSeasonGroup[]
  /** Calendar years earlier than the current season. Never includes the current year. */
  previous: ModernSeasonGroup[]
}

function chronologicalYear(
  group: { season: number; items: readonly Wedding[] },
): ModernSeasonGroup {
  return {
    season: group.season,
    items: [...group.items].sort(compareWeddingDateAsc),
  }
}

/**
 * Season = calendar year of the wedding date.
 * Active = the full current year (past, today, and remaining dates).
 * Previous = only years before the current year.
 * Future years stay as their own layer.
 */
export function splitModernWeddingsSeasons(
  groups: readonly { season: number; items: readonly Wedding[] }[],
  referenceYear: number,
): ModernSeasonLayer {
  const current = groups.find((g) => g.season === referenceYear) ?? null
  return {
    active: current ? chronologicalYear(current) : null,
    future: groups
      .filter((g) => g.season > referenceYear)
      .map(chronologicalYear),
    previous: groups
      .filter((g) => g.season < referenceYear)
      .map(chronologicalYear),
  }
}

/** Top selector years: current calendar year + future years only. */
export function listCurrentAndFutureYears(
  layers: Pick<ModernSeasonLayer, 'active' | 'future'>,
): number[] {
  const years: number[] = []
  if (layers.active) years.push(layers.active.season)
  for (const group of layers.future) years.push(group.season)
  return years
}

export function defaultSelectedCurrentFutureYear(
  years: readonly number[],
  referenceYear: number,
): number | null {
  if (years.includes(referenceYear)) return referenceYear
  return years[0] ?? null
}

export function defaultExpandedCurrentFutureYears(
  years: readonly number[],
  referenceYear: number,
): Set<number> {
  const selected = defaultSelectedCurrentFutureYear(years, referenceYear)
  return selected == null ? new Set() : new Set([selected])
}

export function selectExclusiveCurrentFutureYear(year: number): Set<number> {
  return new Set([year])
}

export function expandAllCurrentFutureYears(
  years: readonly number[],
): Set<number> {
  return new Set(years)
}

export function toggleCurrentFutureYearExpanded(
  expanded: ReadonlySet<number>,
  year: number,
): Set<number> {
  const next = new Set(expanded)
  if (next.has(year)) next.delete(year)
  else next.add(year)
  return next
}

/**
 * Chip state from current/future accordion only.
 * History never participates.
 */
export function resolveCurrentFutureChipSelection(
  years: readonly number[],
  expanded: ReadonlySet<number>,
): { allSelected: boolean; selectedYear: number | null } {
  if (years.length === 0) {
    return { allSelected: false, selectedYear: null }
  }
  const open = years.filter((year) => expanded.has(year))
  if (open.length === years.length) {
    return { allSelected: true, selectedYear: null }
  }
  if (open.length === 1) {
    return { allSelected: false, selectedYear: open[0]! }
  }
  if (open.length > 1) {
    return { allSelected: true, selectedYear: null }
  }
  return { allSelected: false, selectedYear: null }
}
