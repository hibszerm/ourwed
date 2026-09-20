/**
 * V6-F1 — Load tenant wedding universe for collection tools.
 * Uses list-light + canonical finance helpers via weddingToCollectionRow.
 */

import { weddingListLightService } from '@/lib/api/weddingListLightService'
import { FINANCE_INCLUDED_STATUSES } from '@/lib/finance/financeSeasonAggregate'
import type { Wedding } from '@/types/wedding'
import {
  weddingToCollectionRow,
  type CollectionMoneyRow,
} from '../../v4/capabilities/collection/executeCollectionQuery'

function isIncludedWedding(w: Wedding): boolean {
  return (FINANCE_INCLUDED_STATUSES as readonly string[]).includes(w.status)
}

export async function loadWeddingUniverseRows(): Promise<CollectionMoneyRow[]> {
  const weddings = await weddingListLightService.listWeddingsForList()
  return weddings.filter(isIncludedWedding).map(weddingToCollectionRow)
}

export function rowsByIds(
  universe: CollectionMoneyRow[],
  ids: readonly string[],
): CollectionMoneyRow[] {
  const map = new Map(universe.map((r) => [r.id, r]))
  const out: CollectionMoneyRow[] = []
  for (const id of ids) {
    const row = map.get(id)
    if (row) out.push(row)
  }
  return out
}
