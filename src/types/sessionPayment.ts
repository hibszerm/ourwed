/**
 * Session payment ledger types.
 * Reuses PaymentType / PaymentMethod; does not fake weddingId.
 */

import type { PaymentMethod, PaymentType } from '@/types/wedding'

export type { PaymentMethod, PaymentType }

export interface SessionPayment {
  id: string
  sessionId: string
  label: string
  amount: number
  type: PaymentType
  /** Derived: payment_date is set */
  paid: boolean
  paidAt?: string
  method?: PaymentMethod
  note?: string
  createdAt: string
}

export interface CreateSessionPaymentInput {
  sessionId: string
  type: PaymentType
  amount: number
  paymentDate?: string | null
  method?: PaymentMethod | null
  note?: string
  paid?: boolean
}

export interface UpdateSessionPaymentInput {
  type?: PaymentType
  amount?: number
  paymentDate?: string | null
  method?: PaymentMethod | null
  note?: string | null
  paid?: boolean
}

/** Polish labels for session payment types (zaliczka, not zadatek). */
export const SESSION_PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  deposit: 'Zaliczka',
  installment: 'Rata',
  final: 'Końcowa',
  other: 'Inna',
}

export const SESSION_PAYMENT_MIGRATION_NOTE =
  'Migracja: zaliczka z wcześniejszego modelu sesji'
