/**
 * READ-only aggregate helpers for Assistant V1.
 * Counts/sums run in trusted OurWed code — never in the model.
 */

import { FINANCE_INCLUDED_STATUSES } from '@/lib/finance/financeSeasonAggregate'
import { getContractValue } from '@/lib/utils/commercial'
import { toLocalCalendarDateKey } from '@/lib/utils/localCalendarDate'
import type { Session } from '@/types/session'
import type { Wedding } from '@/types/wedding'

export function isFinanceIncludedWedding(
  wedding: Pick<Wedding, 'status'>,
): boolean {
  return (FINANCE_INCLUDED_STATUSES as readonly string[]).includes(
    wedding.status,
  )
}

export function dateInInclusiveRange(
  date: string | null | undefined,
  from: string,
  to: string,
): boolean {
  const key = toLocalCalendarDateKey(date)
  if (!key) return false
  return key >= from && key <= to
}

export function filterWeddingsInRange(
  weddings: Wedding[],
  from: string,
  to: string,
): Wedding[] {
  return weddings.filter(
    (w) =>
      isFinanceIncludedWedding(w) && dateInInclusiveRange(w.date, from, to),
  )
}

export function filterSessionsInRange(
  sessions: Session[],
  from: string,
  to: string,
): Session[] {
  return sessions.filter((s) => dateInInclusiveRange(s.date, from, to))
}

/** Canonical wedding contract value sum — getContractValue / wedding.price. */
export function sumWeddingContractValues(weddings: Wedding[]): number {
  return weddings.reduce((sum, w) => sum + getContractValue(w), 0)
}

export function polishCountUnit(
  scope: 'weddings' | 'sessions' | 'assignments',
  count: number,
): string {
  const n = Math.abs(count)
  const mod10 = n % 10
  const mod100 = n % 100
  const few = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)

  if (scope === 'weddings') {
    if (n === 1) return 'wesele'
    if (few) return 'wesela'
    return 'wesel'
  }
  if (scope === 'sessions') {
    if (n === 1) return 'sesja'
    if (few) return 'sesje'
    return 'sesji'
  }
  if (n === 1) return 'zlecenie'
  if (few) return 'zlecenia'
  return 'zleceń'
}
