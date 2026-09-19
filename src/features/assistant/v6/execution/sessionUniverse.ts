/**
 * Tenant session universe for V7 Session ResourceSets.
 * Canonical money: totalPrice + getTotalPaid / getRemainingToPay (same as V4 session rows).
 */

import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { getSessionLocationSummary } from '@/features/sessions/presentation/getSessionLocationSummary'
import { sessionListLightService } from '@/lib/api/sessionListLightService'
import { getRemainingToPay, getTotalPaid } from '@/lib/utils/finance'
import { toLocalCalendarDateKey } from '@/lib/utils/localCalendarDate'
import type { Session } from '@/types/session'
import type { CollectionMoneyRow } from '../../v4/capabilities/collection/executeCollectionQuery'

export type SessionCollectionRow = CollectionMoneyRow & {
  sessionType: Session['sessionType']
  startTime: string | null
  endTime: string | null
  locationSummary: string | null
  hasLinkedWedding: boolean
  depositAmount: number
}

export function sessionToCollectionRow(s: Session): SessionCollectionRow {
  const contractValue = Number.isFinite(s.totalPrice)
    ? Math.max(0, s.totalPrice)
    : 0
  const paidAmount = getTotalPaid(s.payments ?? [])
  const remainingAmount = getRemainingToPay(contractValue, s.payments ?? [])
  const depositAmount = Number.isFinite(s.depositAmount)
    ? Math.max(0, s.depositAmount)
    : 0
  const locationSummary = getSessionLocationSummary(s.location) ?? null
  return {
    id: s.id,
    displayLabel: getSessionDisplayName(s),
    date: toLocalCalendarDateKey(s.date),
    contractValue,
    paidAmount,
    remainingAmount,
    locationHaystack: locationSummary ? [locationSummary] : [],
    sessionType: s.sessionType,
    startTime: s.startTime?.trim() || null,
    endTime: s.endTime?.trim() || null,
    locationSummary,
    hasLinkedWedding: Boolean(s.linkedWeddingId),
    depositAmount,
  }
}

export async function loadSessionUniverseRows(): Promise<SessionCollectionRow[]> {
  const sessions = await sessionListLightService.listSessionsForList()
  return sessions.map(sessionToCollectionRow)
}

export function sessionRowsByIds(
  universe: SessionCollectionRow[],
  ids: readonly string[],
): SessionCollectionRow[] {
  const map = new Map(universe.map((r) => [r.id, r]))
  const out: SessionCollectionRow[] = []
  for (const id of ids) {
    const row = map.get(id)
    if (row) out.push(row)
  }
  return out
}
