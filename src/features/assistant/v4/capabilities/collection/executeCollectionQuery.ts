/**
 * Phase 3D/3E — wedding collection executor.
 * Tenant-scoped list-light + batched payments + places (no N+1 getById).
 * Canonical money: getContractValue / getTotalPaid / getRemainingToPay.
 */

import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { weddingListLightService } from '@/lib/api/weddingListLightService'
import { FINANCE_INCLUDED_STATUSES } from '@/lib/finance/financeSeasonAggregate'
import { getContractValue } from '@/lib/utils/commercial'
import { getRemainingToPay, getTotalPaid } from '@/lib/utils/finance'
import { toLocalCalendarDateKey } from '@/lib/utils/localCalendarDate'
import type { Wedding } from '@/types/wedding'
import { resolveAggregateDateRange } from '../../../dates'
import type { CollectionObservation } from '../../observations/types'
import {
  COLLECTION_QUERY_LIST_LIMIT,
  COLLECTION_QUERY_MEMBER_ID_CAP,
  type CollectionQuery,
  type CollectionQueryFilters,
  type CollectionQueryMetric,
} from './collectionQueryContract'
import {
  type CollectionLocationRole,
  locationQueryMatchesHaystack,
  weddingLocationHaystack,
} from './locationMatch'

export type CollectionMoneyRow = {
  id: string
  displayLabel: string
  date: string | null
  contractValue: number
  paidAmount: number
  remainingAmount: number
  /** Authoritative place text for venue matching (list-light hydrate). */
  locationHaystack?: string[]
  locationByRole?: Partial<
    Record<'preparations' | 'ceremony' | 'reception', string[]>
  >
}

function isIncludedWedding(w: Wedding): boolean {
  return (FINANCE_INCLUDED_STATUSES as readonly string[]).includes(w.status)
}

function metricValue(
  row: CollectionMoneyRow,
  metric: CollectionQueryMetric,
): number {
  if (metric === 'contract_value') return row.contractValue
  if (metric === 'paid') return row.paidAmount
  return row.remainingAmount
}

function inDateRange(
  date: string | null,
  range: { from: string; to: string } | null | undefined,
): boolean {
  if (!range) return true
  if (!date) return false
  return date >= range.from && date <= range.to
}

export function weddingToCollectionRow(w: Wedding): CollectionMoneyRow {
  const contractValue = getContractValue(w)
  const paidAmount = getTotalPaid(w.payments ?? [])
  const remainingAmount = getRemainingToPay(contractValue, w.payments ?? [])
  return {
    id: w.id,
    displayLabel: getWeddingDisplayName(w),
    date: toLocalCalendarDateKey(w.date),
    contractValue,
    paidAmount,
    remainingAmount,
    locationHaystack: weddingLocationHaystack(w, 'any'),
    locationByRole: {
      preparations: weddingLocationHaystack(w, 'preparations'),
      ceremony: weddingLocationHaystack(w, 'ceremony'),
      reception: weddingLocationHaystack(w, 'reception'),
    },
  }
}

function rowMatchesLocation(
  row: CollectionMoneyRow,
  locationQuery: string | null | undefined,
  role: CollectionLocationRole,
): boolean {
  if (!locationQuery?.trim()) return true
  if (role !== 'any') {
    const roleHay = row.locationByRole?.[role] ?? []
    if (roleHay.length > 0) {
      return locationQueryMatchesHaystack(locationQuery, roleHay)
    }
  }
  if (row.locationHaystack?.length) {
    return locationQueryMatchesHaystack(locationQuery, row.locationHaystack)
  }
  // No place text → does not match a positive location filter
  return false
}

function matchesFilters(
  row: CollectionMoneyRow,
  filters: CollectionQueryFilters,
): boolean {
  if (!inDateRange(row.date, filters.dateRange ?? null)) return false
  const role = (filters.locationRole ?? 'any') as CollectionLocationRole
  return rowMatchesLocation(row, filters.locationQuery, role)
}

function collectionLabel(filters: CollectionQueryFilters): string | undefined {
  const parts: string[] = []
  if (filters.locationQuery?.trim()) {
    parts.push(filters.locationQuery.trim())
  }
  const dr = filters.dateRange
  if (dr) {
    const yFrom = dr.from.slice(0, 4)
    const yTo = dr.to.slice(0, 4)
    // Full calendar year → label as year only (not "STYCZEŃ").
    if (
      yFrom === yTo &&
      dr.from.endsWith('-01-01') &&
      dr.to.endsWith('-12-31')
    ) {
      parts.push(yFrom)
    } else {
      const months = [
        'styczeń',
        'luty',
        'marzec',
        'kwiecień',
        'maj',
        'czerwiec',
        'lipiec',
        'sierpień',
        'wrzesień',
        'październik',
        'listopad',
        'grudzień',
      ]
      const m = Number(dr.from.slice(5, 7))
      const phrase = `${months[m - 1] ?? ''} ${yFrom}`.trim()
      const title = resolveAggregateDateRange(phrase)?.titleLabel
      if (title) parts.push(title)
    }
  }
  return parts.length ? parts.join(' · ') : undefined
}

export type CollectionQueryExecution = {
  observation: CollectionObservation
  activeCollection: {
    resource: 'weddings'
    filters: CollectionQueryFilters
    memberIds: string[]
    resultCount: number
    label?: string
  }
  activeResource: {
    kind: 'wedding'
    id: string
    label: string
  } | null
}

function filterSummary(filters: CollectionQueryFilters) {
  return {
    dateRange: filters.dateRange ?? null,
    locationQuery: filters.locationQuery ?? null,
    locationRole: filters.locationRole ?? null,
    label: collectionLabel(filters) ?? null,
  }
}

/** Pure execution over already-loaded money rows (fixture / tests / live). */
export function executeCollectionQueryOnRows(
  allRows: CollectionMoneyRow[],
  query: CollectionQuery,
): CollectionQueryExecution {
  const rows = allRows.filter((r) => matchesFilters(r, query.filters))

  const label = collectionLabel(query.filters)
  const memberIds = rows.map((r) => r.id).slice(0, COLLECTION_QUERY_MEMBER_ID_CAP)
  const activeCollection = {
    resource: 'weddings' as const,
    filters: {
      dateRange: query.filters.dateRange ?? null,
      locationQuery: query.filters.locationQuery ?? null,
      locationRole: query.filters.locationRole ?? null,
    },
    memberIds,
    resultCount: rows.length,
    label,
  }

  const summary = filterSummary(query.filters)

  if (query.operation === 'count') {
    return {
      observation: {
        kind: 'collection',
        resource: 'wedding',
        operation: 'count',
        filters: summary,
        totalCount: rows.length,
        returnedCount: 0,
        truncated: false,
        currency: 'PLN',
      },
      activeCollection,
      activeResource: null,
    }
  }

  if (query.operation === 'sum') {
    const metric = query.metric!
    const amount = rows.reduce((acc, r) => acc + metricValue(r, metric), 0)
    return {
      observation: {
        kind: 'collection',
        resource: 'wedding',
        operation: 'sum',
        filters: summary,
        totalCount: rows.length,
        returnedCount: 0,
        truncated: false,
        metric,
        amount,
        currency: 'PLN',
      },
      activeCollection,
      activeResource: null,
    }
  }

  if (query.operation === 'rank') {
    const metric = query.metric!
    const direction = query.rank?.direction ?? 'desc'
    const limit = Math.min(query.rank?.limit ?? 1, COLLECTION_QUERY_LIST_LIMIT)
    if (rows.length === 0) {
      return {
        observation: {
          kind: 'collection',
          resource: 'wedding',
          operation: 'rank',
          filters: summary,
          totalCount: 0,
          returnedCount: 0,
          truncated: false,
          metric,
          items: [],
          currency: 'PLN',
        },
        activeCollection,
        activeResource: null,
      }
    }
    const sorted = [...rows].sort((a, b) => {
      const av = metricValue(a, metric)
      const bv = metricValue(b, metric)
      return direction === 'desc' ? bv - av : av - bv
    })
    const page = sorted.slice(0, limit)
    const items = page.map((r) => ({
      resource: { kind: 'wedding' as const, id: r.id },
      displayName: r.displayLabel,
      date: r.date,
      metricValue: metricValue(r, metric),
    }))
    const winner = page[0]!
    return {
      observation: {
        kind: 'collection',
        resource: 'wedding',
        operation: 'rank',
        filters: summary,
        totalCount: rows.length,
        returnedCount: items.length,
        truncated: rows.length > items.length,
        metric,
        items,
        currency: 'PLN',
      },
      activeCollection,
      activeResource: {
        kind: 'wedding',
        id: winner.id,
        label: winner.displayLabel,
      },
    }
  }

  const limit = Math.min(
    query.limit ?? COLLECTION_QUERY_LIST_LIMIT,
    COLLECTION_QUERY_LIST_LIMIT,
  )
  const sorted = [...rows].sort((a, b) => {
    const ad = a.date ?? '9999-99-99'
    const bd = b.date ?? '9999-99-99'
    return ad.localeCompare(bd)
  })
  const page = sorted.slice(0, limit)
  const items = page.map((r) => ({
    resource: { kind: 'wedding' as const, id: r.id },
    displayName: r.displayLabel,
    date: r.date,
    metricValue: query.metric ? metricValue(r, query.metric) : undefined,
  }))

  return {
    observation: {
      kind: 'collection',
      resource: 'wedding',
      operation: 'list',
      filters: summary,
      totalCount: rows.length,
      returnedCount: items.length,
      truncated: rows.length > items.length,
      metric: query.metric ?? null,
      items,
      currency: 'PLN',
    },
    activeCollection,
    activeResource: null,
  }
}

/**
 * Execute against tenant wedding list-light (batched payments + places).
 * Conceptual network: 1 list + 1 payment batch + 1 places batch inside enrich.
 */
export async function executeCollectionQuery(
  query: CollectionQuery,
): Promise<CollectionQueryExecution> {
  const weddings = await weddingListLightService.listWeddingsForList()
  const rows = weddings.filter(isIncludedWedding).map(weddingToCollectionRow)
  return executeCollectionQueryOnRows(rows, query)
}
