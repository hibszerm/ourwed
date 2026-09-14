/**
 * V6-F1 — Resolve typed temporal anchors to executable local date bounds.
 * Semantic definition keeps open ends; execution uses concrete filters.
 */

import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'
import type { V6RelativeTemporal, V6TemporalAnchor } from './types'

export type ResolvedDateBound =
  | { kind: 'open_start'; to: string; toInclusive: boolean }
  | { kind: 'open_end'; from: string; fromInclusive: boolean }
  | { kind: 'closed'; from: string; to: string }
  | { kind: 'unresolved'; reason: string }

function absoluteFromAnchor(
  anchor: V6TemporalAnchor,
  todayKey: string,
): string | null {
  if (anchor.kind === 'now') return todayKey
  if (anchor.kind === 'absolute') {
    return /^\d{4}-\d{2}-\d{2}$/.test(anchor.date) ? anchor.date : null
  }
  if (anchor.kind === 'calendar_year') {
    if (anchor.year < 2000 || anchor.year > 2100) return null
    return `${anchor.year}-01-01`
  }
  if (anchor.kind === 'calendar_month') {
    if (
      anchor.year < 2000 ||
      anchor.year > 2100 ||
      anchor.month < 1 ||
      anchor.month > 12
    ) {
      return null
    }
    const mm = String(anchor.month).padStart(2, '0')
    return `${anchor.year}-${mm}-01`
  }
  return null
}

function endOfMonth(year: number, month: number): string {
  const last = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

/**
 * Resolve V6 relative temporal to executable bounds.
 * Open future/past stay open in semantics; predicate uses from/to with null open end.
 */
export function resolveRelativeTemporal(
  temporal: V6RelativeTemporal,
  todayKey: string = localCalendarDateKey(),
): ResolvedDateBound {
  if (temporal.kind === 'future_from_now') {
    return {
      kind: 'open_end',
      from: todayKey,
      fromInclusive: temporal.inclusive,
    }
  }
  if (temporal.kind === 'past_until_now') {
    return {
      kind: 'open_start',
      to: todayKey,
      toInclusive: temporal.inclusive,
    }
  }
  if (temporal.kind === 'closed_calendar_year') {
    if (temporal.year < 2000 || temporal.year > 2100) {
      return { kind: 'unresolved', reason: 'year_out_of_range' }
    }
    return {
      kind: 'closed',
      from: `${temporal.year}-01-01`,
      to: `${temporal.year}-12-31`,
    }
  }
  if (temporal.kind === 'closed_calendar_month') {
    if (
      temporal.year < 2000 ||
      temporal.year > 2100 ||
      temporal.month < 1 ||
      temporal.month > 12
    ) {
      return { kind: 'unresolved', reason: 'month_out_of_range' }
    }
    return {
      kind: 'closed',
      from: `${temporal.year}-${String(temporal.month).padStart(2, '0')}-01`,
      to: endOfMonth(temporal.year, temporal.month),
    }
  }
  if (temporal.kind === 'closed_range') {
    const from = absoluteFromAnchor(temporal.from, todayKey)
    const to = absoluteFromAnchor(temporal.to, todayKey)
    if (!from || !to) {
      return { kind: 'unresolved', reason: 'anchor_unresolved' }
    }
    // calendar_month as `to` → end of that month
    let toKey = to
    if (temporal.to.kind === 'calendar_month') {
      toKey = endOfMonth(temporal.to.year, temporal.to.month)
    } else if (temporal.to.kind === 'calendar_year') {
      toKey = `${temporal.to.year}-12-31`
    }
    let fromKey = from
    if (temporal.from.kind === 'calendar_year') {
      fromKey = `${temporal.from.year}-01-01`
    }
    if (fromKey > toKey) {
      return { kind: 'unresolved', reason: 'inverted_range' }
    }
    return { kind: 'closed', from: fromKey, to: toKey }
  }
  return { kind: 'unresolved', reason: 'unknown_temporal' }
}

export function dateMatchesBound(
  date: string | null,
  bound: ResolvedDateBound,
): boolean {
  if (bound.kind === 'unresolved') return false
  if (!date) return false
  if (bound.kind === 'closed') {
    return date >= bound.from && date <= bound.to
  }
  if (bound.kind === 'open_end') {
    return bound.fromInclusive ? date >= bound.from : date > bound.from
  }
  if (bound.kind === 'open_start') {
    return bound.toInclusive ? date <= bound.to : date < bound.to
  }
  return false
}
