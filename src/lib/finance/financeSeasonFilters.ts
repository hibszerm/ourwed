/**
 * In-memory filter / sort for Finance Center season model.
 */

import {
  buildFinanceMonthBuckets,
  buildFinanceSeasonKpis,
  assignmentDateMonth,
} from '@/lib/finance/financeSeasonAggregate'
import type {
  FinanceAssignment,
  FinanceKindFilter,
  FinancePaymentFilter,
  FinanceSeasonKpis,
  FinanceMonthBucket,
  FinanceSortField,
} from '@/lib/finance/financeSeasonTypes'

export function filterFinanceAssignments(
  assignments: FinanceAssignment[],
  opts: {
    paymentFilter: FinancePaymentFilter
    kindFilter?: FinanceKindFilter
    /** 1–12, or null for whole season */
    month: number | null
  },
): FinanceAssignment[] {
  const kindFilter = opts.kindFilter ?? 'all'
  return assignments.filter((a) => {
    if (kindFilter === 'wedding' && a.kind !== 'wedding') return false
    if (kindFilter === 'session' && a.kind !== 'session') return false
    if (opts.month != null) {
      if (assignmentDateMonth(a.date) !== opts.month) return false
    }
    switch (opts.paymentFilter) {
      case 'paid':
        return a.paymentStatus === 'paid'
      case 'partial':
        return a.paymentStatus === 'partial'
      case 'unpaid':
        return a.paymentStatus === 'unpaid'
      case 'missing_deposit':
        return a.depositStatus === 'missing'
      default:
        return true
    }
  })
}

/** @deprecated Prefer filterFinanceAssignments */
export function filterFinanceWeddings(
  weddings: FinanceAssignment[],
  opts: {
    paymentFilter: FinancePaymentFilter
    month: number | null
    kindFilter?: FinanceKindFilter
  },
): FinanceAssignment[] {
  return filterFinanceAssignments(weddings, opts)
}

export function sortFinanceAssignments(
  assignments: FinanceAssignment[],
  field: FinanceSortField | 'wedding_date',
  direction: 'asc' | 'desc' = 'asc',
): FinanceAssignment[] {
  const dir = direction === 'asc' ? 1 : -1
  const sortField: FinanceSortField =
    field === 'wedding_date' ? 'date' : field
  const sorted = [...assignments]
  sorted.sort((a, b) => {
    const cmp =
      sortField === 'contract_value'
        ? a.contractValue - b.contractValue
        : sortField === 'total_paid'
          ? a.totalPaid - b.totalPaid
          : sortField === 'remaining'
            ? a.remaining - b.remaining
            : a.date.localeCompare(b.date)
    if (cmp !== 0) return cmp * dir
    return a.displayName.localeCompare(b.displayName, 'pl') * dir
  })
  return sorted
}

/** @deprecated Prefer sortFinanceAssignments */
export function sortFinanceWeddings(
  weddings: FinanceAssignment[],
  field: FinanceSortField | 'wedding_date',
  direction: 'asc' | 'desc' = 'asc',
): FinanceAssignment[] {
  return sortFinanceAssignments(weddings, field, direction)
}

/** Rebuild KPIs / months for a kind-filtered assignment subset (no refetch). */
export function projectFinanceSubset(assignments: FinanceAssignment[]): {
  months: FinanceMonthBucket[]
  kpis: FinanceSeasonKpis
} {
  return {
    months: buildFinanceMonthBuckets(assignments),
    kpis: buildFinanceSeasonKpis(assignments),
  }
}
