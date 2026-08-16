/**
 * Dashboard Dzisiaj task time horizons (ephemeral UI — never persisted).
 * End dates are local calendar keys (YYYY-MM-DD).
 */

import {
  localCalendarDateKey,
  toLocalCalendarDateKey,
} from '@/lib/utils/localCalendarDate'

export type DashboardTaskHorizon = 'today' | '7_days' | '14_days' | 'month'

export const DASHBOARD_TASK_HORIZONS: readonly DashboardTaskHorizon[] = [
  'today',
  '7_days',
  '14_days',
  'month',
] as const

/** Default on every Dashboard mount / reload. */
export const DEFAULT_DASHBOARD_TASK_HORIZON: DashboardTaskHorizon = 'today'

/** Closed trigger labels (compact). */
export const DASHBOARD_TASK_HORIZON_TRIGGER: Record<
  DashboardTaskHorizon,
  string
> = {
  today: 'Dzisiaj',
  '7_days': '7 dni',
  '14_days': '14 dni',
  month: 'Miesiąc',
}

/** Open menu labels. */
export const DASHBOARD_TASK_HORIZON_MENU: Record<DashboardTaskHorizon, string> =
  {
    today: 'Dzisiaj',
    '7_days': 'Najbliższe 7 dni',
    '14_days': 'Najbliższe 14 dni',
    month: 'Najbliższy miesiąc',
  }

export function dashboardTaskHorizonEmptyCopy(
  horizon: DashboardTaskHorizon,
): { title: string; subtitle: string } {
  switch (horizon) {
    case 'today':
      return {
        title: 'Czysty dzień',
        subtitle: 'Brak zadań na dziś',
      }
    case '7_days':
      return {
        title: 'Brak zadań',
        subtitle: 'Brak zadań na najbliższe 7 dni',
      }
    case '14_days':
      return {
        title: 'Brak zadań',
        subtitle: 'Brak zadań na najbliższe 14 dni',
      }
    case 'month':
      return {
        title: 'Brak zadań',
        subtitle: 'Brak zadań na najbliższy miesiąc',
      }
  }
}

function parseLocalDay(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number)
  return { y: y!, m: m!, d: d! }
}

/** Add calendar days to a local YYYY-MM-DD key. */
export function addLocalCalendarDays(dayKey: string, days: number): string {
  const { y, m, d } = parseLocalDay(dayKey)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return localCalendarDateKey(date)
}

/**
 * Add calendar months to a local YYYY-MM-DD key (safe month-end clamp).
 * Aug 16 → Sep 16; Jan 31 → Feb 28/29.
 */
export function addLocalCalendarMonths(dayKey: string, months: number): string {
  const { y, m, d } = parseLocalDay(dayKey)
  const targetMonthIndex = m - 1 + months
  const year = y + Math.floor(targetMonthIndex / 12)
  const month = ((targetMonthIndex % 12) + 12) % 12
  const lastDay = new Date(year, month + 1, 0).getDate()
  return localCalendarDateKey(new Date(year, month, Math.min(d, lastDay)))
}

/** Inclusive end date (local) for the selected horizon. Overdue always included via <= end. */
export function dashboardTaskHorizonEndDate(
  horizon: DashboardTaskHorizon,
  todayKey: string = localCalendarDateKey(),
): string {
  const today = toLocalCalendarDateKey(todayKey) ?? localCalendarDateKey()
  switch (horizon) {
    case 'today':
      return today
    case '7_days':
      return addLocalCalendarDays(today, 7)
    case '14_days':
      return addLocalCalendarDays(today, 14)
    case 'month':
      return addLocalCalendarMonths(today, 1)
  }
}
