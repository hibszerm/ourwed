/**
 * Modern /sesje presentation helpers. UI-only.
 * Do not fetch; operate on the existing light session list.
 */

import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { getSessionLocationSummary } from '@/features/sessions/presentation/getSessionLocationSummary'
import { formatSessionType } from '@/features/sessions/presentation/sessionType'
import { formatCurrency } from '@/lib/utils/currency'
import { toLocalCalendarDateKey } from '@/lib/utils/localCalendarDate'
import type { Session } from '@/types/session'

export type EditorialDateParts = {
  day: string
  month: string
  weekday: string
  dateTime: string
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

export function getModernSessionSearchText(session: Session): string {
  const name = getSessionDisplayName(session)
  const location = getSessionLocationSummary(session.location) ?? ''
  const typeLabel = formatSessionType(session)
  return `${name} ${location} ${typeLabel}`.trim()
}

export function matchesModernSessionSearch(
  session: Session,
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return getModernSessionSearchText(session).toLowerCase().includes(q)
}

/**
 * Session commercial SoT is totalPrice (contractual session price).
 * Omit when missing or zero — same presentation rule as wedding WARTOŚĆ.
 */
export function getModernSessionValueLabel(
  session: Pick<Session, 'totalPrice'>,
): string | null {
  const value = Number.isFinite(session.totalPrice)
    ? Math.max(0, session.totalPrice)
    : 0
  if (value <= 0) return null
  return formatCurrency(value)
}

export function compareSessionDateAsc(a: Session, b: Session): number {
  return (a.date || '').localeCompare(b.date || '')
}

export type ModernSessionSeasonGroup = {
  season: number
  items: Session[]
}

export type ModernSessionSeasonLayer = {
  /** Full calendar year of the current season. Null when that year has no visible sessions. */
  active: ModernSessionSeasonGroup | null
  future: ModernSessionSeasonGroup[]
  /** Calendar years earlier than the current season. Never includes the current year. */
  previous: ModernSessionSeasonGroup[]
}

function chronologicalYear(
  group: { season: number; items: readonly Session[] },
): ModernSessionSeasonGroup {
  return {
    season: group.season,
    items: [...group.items].sort(compareSessionDateAsc),
  }
}

/**
 * Season = calendar year of the session date.
 * Active = the full current year (past, today, and remaining dates).
 * Previous = only years before the current year.
 * Future years stay as their own layer.
 */
export function splitModernSessionsSeasons(
  groups: readonly { season: number; items: readonly Session[] }[],
  referenceYear: number,
): ModernSessionSeasonLayer {
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
  layers: Pick<ModernSessionSeasonLayer, 'active' | 'future'>,
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
