/**
 * G0 — DomainQuery shadow executor.
 * Trusted mapping: DomainQuery → list-light rows + registry filters + commercial helpers.
 * No N+1. No arbitrary Supabase builder. Shadow/tests only.
 */

import { weddingListLightService } from '@/lib/api/weddingListLightService'
import { FINANCE_INCLUDED_STATUSES } from '@/lib/finance/financeSeasonAggregate'
import type { Wedding } from '@/types/wedding'
import {
  weddingToCollectionRow,
  type CollectionMoneyRow,
} from '../capabilities/collection/executeCollectionQuery'
import {
  locationQueryMatchesHaystack,
  type CollectionLocationRole,
} from '../capabilities/collection/locationMatch'
import {
  DOMAIN_QUERY_LIST_LIMIT,
  DOMAIN_QUERY_MEMBER_ID_CAP,
  type DomainQuery,
} from './domainQuery'
import type { DomainQueryResult } from './observations'
import { validateDomainQuery } from './validateDomainQuery'
import type { PlaceRoleValue, SemanticFieldId } from './fieldRegistry'

function isIncludedWedding(w: Wedding): boolean {
  return (FINANCE_INCLUDED_STATUSES as readonly string[]).includes(w.status)
}

function measureValue(
  row: CollectionMoneyRow,
  measure: SemanticFieldId,
): number {
  if (measure === 'wedding.contract_value') return row.contractValue
  if (measure === 'wedding.paid_amount') return row.paidAmount
  if (measure === 'wedding.remaining_amount') return row.remainingAmount
  return 0
}

function matchesPlace(
  row: CollectionMoneyRow,
  name: string | null,
  role: PlaceRoleValue,
): boolean {
  if (!name?.trim()) return true
  const r = role === 'any' || !role ? 'any' : role
  if (r !== 'any') {
    const roleHay = row.locationByRole?.[r as Exclude<CollectionLocationRole, 'any'>] ?? []
    if (roleHay.length > 0) {
      return locationQueryMatchesHaystack(name, roleHay)
    }
  }
  if (row.locationHaystack?.length) {
    return locationQueryMatchesHaystack(name, row.locationHaystack)
  }
  return false
}

function inDateRange(
  date: string | null,
  range: { from: string; to: string } | null,
): boolean {
  if (!range) return true
  if (!date) return false
  return date >= range.from && date <= range.to
}

/** Apply DomainQuery filters/relations/dateBinding to money rows. */
export function filterRowsByDomainQuery(
  rows: CollectionMoneyRow[],
  query: DomainQuery,
): CollectionMoneyRow[] {
  let placeName: string | null = null
  let placeRole: PlaceRoleValue = 'any'

  for (const rel of query.relations) {
    if (rel.field === 'place.name' && typeof rel.value === 'string') {
      placeName = rel.value
    }
    if (rel.field === 'place.role' && typeof rel.value === 'string') {
      placeRole = rel.value as PlaceRoleValue
    }
  }
  // Also accept place filters in filters[] for flexibility
  for (const f of query.filters) {
    if (f.field === 'place.name' && typeof f.value === 'string') {
      placeName = f.value
    }
    if (f.field === 'place.role' && typeof f.value === 'string') {
      placeRole = f.value as PlaceRoleValue
    }
  }

  const dateRange =
    query.dateBinding?.dimension === 'wedding.date'
      ? query.dateBinding.range
      : null

  // Inline wedding.date in_range filter if present
  let inlineDate = dateRange
  for (const f of query.filters) {
    if (
      f.field === 'wedding.date' &&
      f.op === 'in_range' &&
      f.value &&
      typeof f.value === 'object' &&
      'from' in f.value
    ) {
      inlineDate = f.value as { from: string; to: string }
    }
  }

  return rows.filter((row) => {
    if (!inDateRange(row.date, inlineDate)) return false
    if (!matchesPlace(row, placeName, placeRole)) return false
    return true
  })
}

function sortRows(
  rows: CollectionMoneyRow[],
  query: DomainQuery,
): CollectionMoneyRow[] {
  if (!query.orderBy.length) {
    return [...rows].sort((a, b) => {
      const da = a.date ?? ''
      const db = b.date ?? ''
      return da < db ? -1 : da > db ? 1 : 0
    })
  }
  const out = [...rows]
  for (const ob of [...query.orderBy].reverse()) {
    out.sort((a, b) => {
      if (ob.field === 'wedding.date') {
        const cmp = (a.date ?? '').localeCompare(b.date ?? '')
        return ob.direction === 'asc' ? cmp : -cmp
      }
      const av = measureValue(a, ob.field)
      const bv = measureValue(b, ob.field)
      const d = av - bv
      return ob.direction === 'asc' ? d : -d
    })
  }
  return out
}

/**
 * Pure DomainQuery execution over fixture / preloaded rows (tests + shadow).
 */
export function executeDomainQueryOnRows(
  allRows: CollectionMoneyRow[],
  rawQuery: unknown,
): DomainQueryResult {
  const validated = validateDomainQuery(rawQuery)
  if (!validated.ok) {
    return {
      ok: false,
      failure: {
        kind: 'domain_query_failure',
        reason: 'validation_failed',
        detail: validated.reason,
      },
    }
  }
  const query = validated.query
  const filtered = filterRowsByDomainQuery(allRows, query)
  const sorted = sortRows(filtered, query)
  const memberIds = sorted.map((r) => r.id).slice(0, DOMAIN_QUERY_MEMBER_ID_CAP)

  const activeCollection = {
    query,
    memberIds,
    resultCount: sorted.length,
  }

  // LIST: aggregate null
  if (query.aggregate === null) {
    const lim = query.limit ?? DOMAIN_QUERY_LIST_LIMIT
    const slice = sorted.slice(0, lim)
    return {
      ok: true,
      observation: {
        kind: 'domain_query',
        query,
        aggregate: 'list',
        measure: null,
        totalCount: sorted.length,
        returnedCount: slice.length,
        truncated: sorted.length > slice.length,
        currency: 'PLN',
        items: slice.map((r) => ({
          resource: { kind: 'wedding' as const, id: r.id },
          displayName: r.displayLabel,
          date: r.date,
        })),
      },
      activeCollection,
    }
  }

  if (query.aggregate === 'count') {
    return {
      ok: true,
      observation: {
        kind: 'domain_query',
        query,
        aggregate: 'count',
        measure: null,
        totalCount: sorted.length,
        returnedCount: 0,
        truncated: false,
        currency: 'PLN',
      },
      activeCollection,
    }
  }

  if (query.aggregate === 'sum') {
    const measure = query.measure!
    const amount = sorted.reduce((s, r) => s + measureValue(r, measure), 0)
    return {
      ok: true,
      observation: {
        kind: 'domain_query',
        query,
        aggregate: 'sum',
        measure,
        totalCount: sorted.length,
        returnedCount: 0,
        truncated: false,
        amount,
        currency: 'PLN',
      },
      activeCollection,
    }
  }

  return {
    ok: false,
    failure: {
      kind: 'domain_query_failure',
      reason: 'unsupported',
      detail: `aggregate_${String(query.aggregate)}`,
    },
  }
}

/**
 * Live shadow path: tenant list-light → DomainQuery.
 * Does not mutate WorkingContext / V3 / V4 capability state.
 */
export async function executeDomainQueryShadow(
  rawQuery: unknown,
): Promise<DomainQueryResult> {
  try {
    const weddings = await weddingListLightService.listWeddingsForList()
    const rows = weddings
      .filter(isIncludedWedding)
      .map(weddingToCollectionRow)
    return executeDomainQueryOnRows(rows, rawQuery)
  } catch (e) {
    return {
      ok: false,
      failure: {
        kind: 'domain_query_failure',
        reason: 'execution_error',
        detail: e instanceof Error ? e.message : 'unknown',
      },
    }
  }
}
