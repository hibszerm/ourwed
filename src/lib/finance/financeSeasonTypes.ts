/**
 * Finance Center — mixed assignments (weddings + sessions).
 * Season/month grouping is always by execution date, never payment_date.
 */

export type FinanceAssignmentKind = 'wedding' | 'session'

export type FinanceKindFilter = 'all' | 'wedding' | 'session'

export type FinancePaymentStatus =
  | 'paid'
  | 'partial'
  | 'unpaid'
  | 'value_unset'

export type FinanceDepositStatus = 'received' | 'missing' | 'none'

export type FinancePaymentFilter =
  | 'all'
  | 'paid'
  | 'partial'
  | 'unpaid'
  | 'missing_deposit'

export type FinanceSortField =
  | 'date'
  | 'contract_value'
  | 'total_paid'
  | 'remaining'

/** @deprecated Use FinanceSortField 'date' */
export type FinanceLegacySortField = FinanceSortField | 'wedding_date'

export interface FinanceAssignment {
  id: string
  kind: FinanceAssignmentKind
  date: string
  displayName: string
  contractValue: number
  agreedDeposit: number
  depositPaid: number
  totalPaid: number
  remaining: number
  /** max(0, totalPaid − contractValue) when CV > 0; else 0 */
  overpayment: number
  currency: string
  paymentStatus: FinancePaymentStatus
  depositStatus: FinanceDepositStatus
  deepLink: string
  /** Wedding archive flag only */
  weddingStatus?: 'active' | 'archived'
}

/** @deprecated Prefer FinanceAssignment — kept as alias for gradual migration */
export type FinanceWedding = FinanceAssignment

export interface FinanceMonthBucket {
  /** 1–12 */
  month: number
  /** Assignment count in month (weddings + sessions) */
  assignmentCount: number
  /** @deprecated alias of assignmentCount for older UI */
  weddingCount: number
  contractValue: number
  totalPaid: number
  remaining: number
  depositsReceived: number
}

export interface FinanceSeasonKpis {
  contractValue: number
  totalPaid: number
  remaining: number
  depositsReceived: number
  assignmentCount: number
  weddingCount: number
  sessionCount: number
  /** Average CV over assignments with contractValue > 0 */
  averageContractValue: number | null
  paidCount: number
  partialCount: number
  unpaidCount: number
  missingDepositCount: number
  valueUnsetCount: number
}

export interface FinanceSeasonModel {
  seasonYear: number
  assignments: FinanceAssignment[]
  /** @deprecated Prefer assignments */
  weddings: FinanceAssignment[]
  months: FinanceMonthBucket[]
  kpis: FinanceSeasonKpis
}
