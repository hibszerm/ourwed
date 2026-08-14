/**
 * Pure Finance Center aggregators for mixed assignments.
 * Reuses getTotalPaid / getDepositPaid / getRemainingToPay — no duplicate formulas.
 */

import {
  getDepositPaid,
  getRemainingToPay,
  getTotalPaid,
} from '@/lib/utils/finance'
import type { Payment } from '@/types/wedding'
import type { SessionPayment } from '@/types/sessionPayment'
import type {
  FinanceAssignment,
  FinanceDepositStatus,
  FinanceMonthBucket,
  FinancePaymentStatus,
  FinanceSeasonKpis,
  FinanceSeasonModel,
} from '@/lib/finance/financeSeasonTypes'
import { financeWeddingDetailHref, financeSessionDetailHref } from '@/features/finance/financeLabels'

export const FINANCE_INCLUDED_STATUSES = ['active', 'archived'] as const

export interface FinanceWeddingScalarRow {
  id: string
  wedding_date: string
  status: string
  bride_name: string
  groom_name: string
  display_name: string | null
  contract_value: number | string | null
  deposit_amount: number | string | null
  currency: string | null
}

export interface FinanceSessionScalarRow {
  id: string
  session_date: string
  session_type: string
  custom_name: string | null
  primary_first_name: string | null
  primary_last_name: string | null
  secondary_first_name: string | null
  secondary_last_name: string | null
  custom_session_type: string | null
  total_price: number | string | null
  deposit_amount: number | string | null
  linked_wedding_id: string | null
}

function toMoney(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, n)
}

function asLedgerPayments(payments: SessionPayment[]): Payment[] {
  return payments.map((p) => ({
    id: p.id,
    label: p.label,
    amount: p.amount,
    type: p.type,
    paid: p.paid,
    paidAt: p.paidAt,
    method: p.method,
    note: p.note,
  }))
}

/** Couple label for Finance list — mirrors getWeddingDisplayName without Wedding type. */
export function financeCoupleName(row: {
  bride_name: string
  groom_name: string
  display_name: string | null
}): string {
  const manual = (row.display_name ?? '').trim()
  if (manual) return manual
  const a = (row.bride_name ?? '').trim()
  const bRaw = (row.groom_name ?? '').trim()
  const placeholders = new Set(['—', '–', '-', 'n/a', 'na', 'brak'])
  const b =
    !bRaw || placeholders.has(bRaw.toLowerCase()) ? '' : bRaw
  if (a && b) return `${a} i ${b}`
  if (a) return a
  if (b) return b
  return 'Bez tytułu'
}

export function financeSessionDisplayName(row: FinanceSessionScalarRow): string {
  const custom = (row.custom_name ?? '').trim()
  if (custom) return custom
  const a = [row.primary_first_name, row.primary_last_name]
    .map((x) => (x ?? '').trim())
    .filter(Boolean)
    .join(' ')
  const b = [row.secondary_first_name, row.secondary_last_name]
    .map((x) => (x ?? '').trim())
    .filter(Boolean)
    .join(' ')
  if (a && b) return `${a} i ${b}`
  if (a) return a
  if (b) return b
  if (row.session_type === 'other') {
    const customType = (row.custom_session_type ?? '').trim()
    if (customType) return customType
  }
  return 'Sesja'
}

export function resolveFinancePaymentStatus(
  contractValue: number,
  totalPaid: number,
): FinancePaymentStatus {
  if (!(contractValue > 0)) return 'value_unset'
  if (totalPaid >= contractValue) return 'paid'
  if (totalPaid > 0) return 'partial'
  return 'unpaid'
}

export function resolveFinanceDepositStatus(
  agreedDeposit: number,
  depositPaid: number,
): FinanceDepositStatus {
  if (depositPaid > 0) return 'received'
  if (agreedDeposit > 0) return 'missing'
  return 'none'
}

export function buildFinanceWeddingAssignment(
  row: FinanceWeddingScalarRow,
  payments: Payment[],
): FinanceAssignment {
  const contractValue = toMoney(row.contract_value)
  const agreedDeposit = toMoney(row.deposit_amount)
  const totalPaid = getTotalPaid(payments)
  const depositPaid = getDepositPaid(payments)
  const remaining = getRemainingToPay(contractValue, payments)
  const overpayment =
    contractValue > 0 ? Math.max(0, totalPaid - contractValue) : 0
  const weddingStatus =
    row.status === 'archived' ? 'archived' : 'active'

  return {
    id: row.id,
    kind: 'wedding',
    date: row.wedding_date.slice(0, 10),
    displayName: financeCoupleName(row),
    contractValue,
    agreedDeposit,
    depositPaid,
    totalPaid,
    remaining,
    overpayment,
    currency: (row.currency ?? 'PLN').trim() || 'PLN',
    paymentStatus: resolveFinancePaymentStatus(contractValue, totalPaid),
    depositStatus: resolveFinanceDepositStatus(agreedDeposit, depositPaid),
    deepLink: financeWeddingDetailHref(row.id),
    weddingStatus,
  }
}

/** @deprecated Prefer buildFinanceWeddingAssignment */
export function buildFinanceWedding(
  row: FinanceWeddingScalarRow,
  payments: Payment[],
) {
  return buildFinanceWeddingAssignment(row, payments)
}

export function buildFinanceSessionAssignment(
  row: FinanceSessionScalarRow,
  payments: SessionPayment[],
): FinanceAssignment {
  const contractValue = toMoney(row.total_price)
  const agreedDeposit = toMoney(row.deposit_amount)
  const ledger = asLedgerPayments(payments)
  const totalPaid = getTotalPaid(ledger)
  const depositPaid = getDepositPaid(ledger)
  const remaining = getRemainingToPay(contractValue, ledger)
  const overpayment =
    contractValue > 0 ? Math.max(0, totalPaid - contractValue) : 0

  return {
    id: row.id,
    kind: 'session',
    date: row.session_date.slice(0, 10),
    displayName: financeSessionDisplayName(row),
    contractValue,
    agreedDeposit,
    depositPaid,
    totalPaid,
    remaining,
    overpayment,
    currency: 'PLN',
    paymentStatus: resolveFinancePaymentStatus(contractValue, totalPaid),
    depositStatus: resolveFinanceDepositStatus(agreedDeposit, depositPaid),
    deepLink: financeSessionDetailHref(row.id),
  }
}

export function buildEmptyMonthBuckets(): FinanceMonthBucket[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    assignmentCount: 0,
    weddingCount: 0,
    contractValue: 0,
    totalPaid: 0,
    remaining: 0,
    depositsReceived: 0,
  }))
}

/** Month from execution date only — never payment_date. */
export function assignmentDateMonth(date: string): number | null {
  const m = Number(date.slice(5, 7))
  if (!Number.isInteger(m) || m < 1 || m > 12) return null
  return m
}

/** @deprecated Prefer assignmentDateMonth */
export function weddingDateMonth(weddingDate: string): number | null {
  return assignmentDateMonth(weddingDate)
}

export function buildFinanceSeasonKpis(
  assignments: FinanceAssignment[],
): FinanceSeasonKpis {
  let contractValue = 0
  let totalPaid = 0
  let remaining = 0
  let depositsReceived = 0
  let paidCount = 0
  let partialCount = 0
  let unpaidCount = 0
  let missingDepositCount = 0
  let valueUnsetCount = 0
  let avgSum = 0
  let avgCount = 0
  let weddingCount = 0
  let sessionCount = 0

  for (const a of assignments) {
    contractValue += a.contractValue
    totalPaid += a.totalPaid
    remaining += a.remaining
    depositsReceived += a.depositPaid
    if (a.kind === 'wedding') weddingCount += 1
    else sessionCount += 1
    if (a.paymentStatus === 'paid') paidCount += 1
    else if (a.paymentStatus === 'partial') partialCount += 1
    else if (a.paymentStatus === 'unpaid') unpaidCount += 1
    else valueUnsetCount += 1
    if (a.depositStatus === 'missing') missingDepositCount += 1
    if (a.contractValue > 0) {
      avgSum += a.contractValue
      avgCount += 1
    }
  }

  return {
    contractValue,
    totalPaid,
    remaining,
    depositsReceived,
    assignmentCount: assignments.length,
    weddingCount,
    sessionCount,
    averageContractValue: avgCount > 0 ? avgSum / avgCount : null,
    paidCount,
    partialCount,
    unpaidCount,
    missingDepositCount,
    valueUnsetCount,
  }
}

export function buildFinanceMonthBuckets(
  assignments: FinanceAssignment[],
): FinanceMonthBucket[] {
  const months = buildEmptyMonthBuckets()
  for (const a of assignments) {
    const month = assignmentDateMonth(a.date)
    if (month == null) continue
    const bucket = months[month - 1]
    bucket.assignmentCount += 1
    bucket.weddingCount = bucket.assignmentCount
    bucket.contractValue += a.contractValue
    bucket.totalPaid += a.totalPaid
    bucket.remaining += a.remaining
    bucket.depositsReceived += a.depositPaid
  }
  return months
}

export function buildFinanceSeasonModel(
  seasonYear: number,
  weddingRows: FinanceWeddingScalarRow[],
  paymentsByWeddingId: Map<string, Payment[]>,
  sessionRows: FinanceSessionScalarRow[] = [],
  paymentsBySessionId: Map<string, SessionPayment[]> = new Map(),
): FinanceSeasonModel {
  const weddings = weddingRows.map((row) =>
    buildFinanceWeddingAssignment(row, paymentsByWeddingId.get(row.id) ?? []),
  )
  const sessions = sessionRows.map((row) =>
    buildFinanceSessionAssignment(
      row,
      paymentsBySessionId.get(row.id) ?? [],
    ),
  )
  const assignments = [...weddings, ...sessions].sort((a, b) =>
    a.date.localeCompare(b.date),
  )

  return {
    seasonYear,
    assignments,
    weddings: assignments,
    months: buildFinanceMonthBuckets(assignments),
    kpis: buildFinanceSeasonKpis(assignments),
  }
}

/**
 * Prefer current year when it has assignments; else nearest year;
 * if none, fall back to current year (empty season UI).
 */
export function resolveDefaultSeasonYear(
  availableYears: number[],
  nowYear: number = new Date().getFullYear(),
): number {
  const years = [...new Set(availableYears)].sort((a, b) => a - b)
  if (years.length === 0) return nowYear
  if (years.includes(nowYear)) return nowYear
  let best = years[0]
  let bestDist = Math.abs(best - nowYear)
  for (const y of years) {
    const d = Math.abs(y - nowYear)
    if (d < bestDist || (d === bestDist && y > best)) {
      best = y
      bestDist = d
    }
  }
  return best
}

export function seasonDateRange(year: number): { from: string; to: string } {
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  }
}
