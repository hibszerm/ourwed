import { supabase } from '@/lib/supabase'
import { throwOnError, toNumber } from '@/lib/supabase/helpers'
import {
  SESSION_PAYMENT_TYPE_LABELS,
  type CreateSessionPaymentInput,
  type SessionPayment,
  type UpdateSessionPaymentInput,
} from '@/types/sessionPayment'
import type { PaymentMethod, PaymentType } from '@/types/wedding'

interface SessionPaymentRow {
  id: string
  session_id: string
  type: string
  amount: number | string
  payment_date: string | null
  method: string | null
  note: string | null
  created_at: string
}

function isPaymentType(value: string): value is PaymentType {
  return (
    value === 'deposit' ||
    value === 'installment' ||
    value === 'final' ||
    value === 'other'
  )
}

function isPaymentMethod(value: string | null): value is PaymentMethod {
  return (
    value === 'transfer' ||
    value === 'cash' ||
    value === 'blik' ||
    value === 'other'
  )
}

export function mapSessionPaymentRowToModel(
  row: SessionPaymentRow,
): SessionPayment {
  const type: PaymentType = isPaymentType(row.type) ? row.type : 'other'
  const paymentDate = row.payment_date
    ? row.payment_date.slice(0, 10)
    : undefined

  return {
    id: row.id,
    sessionId: row.session_id,
    label: SESSION_PAYMENT_TYPE_LABELS[type],
    amount: toNumber(row.amount),
    type,
    paid: Boolean(paymentDate),
    paidAt: paymentDate,
    method: isPaymentMethod(row.method) ? row.method : undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  }
}

function emptyPaymentMap(ids: string[]): Map<string, SessionPayment[]> {
  const map = new Map<string, SessionPayment[]>()
  for (const id of ids) map.set(id, [])
  return map
}

function resolvePaymentDate(
  paid: boolean | undefined,
  paymentDate: string | null | undefined,
): string | null {
  if (paid === false) return null
  if (paymentDate) return paymentDate.slice(0, 10)
  if (paid === true) return new Date().toISOString().slice(0, 10)
  return paymentDate === null ? null : (paymentDate?.slice(0, 10) ?? null)
}

export const sessionPaymentService = {
  async listBySessionId(sessionId: string): Promise<SessionPayment[]> {
    const map = await this.listBySessionIds([sessionId])
    return map.get(sessionId) ?? []
  },

  async listBySessionIds(
    sessionIds: string[],
  ): Promise<Map<string, SessionPayment[]>> {
    const map = emptyPaymentMap(sessionIds)
    if (sessionIds.length === 0) return map

    const { data, error } = await supabase
      .from('session_payments')
      .select('*')
      .in('session_id', sessionIds)
      .order('payment_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    throwOnError(error)

    for (const row of (data ?? []) as SessionPaymentRow[]) {
      const list = map.get(row.session_id) ?? []
      list.push(mapSessionPaymentRowToModel(row))
      map.set(row.session_id, list)
    }
    return map
  },

  async create(input: CreateSessionPaymentInput): Promise<SessionPayment> {
    const paid = input.paid ?? Boolean(input.paymentDate)
    const paymentDate = resolvePaymentDate(paid, input.paymentDate)

    const { data, error } = await supabase
      .from('session_payments')
      .insert({
        session_id: input.sessionId,
        type: input.type,
        amount: input.amount,
        payment_date: paymentDate,
        method: input.method ?? null,
        note: input.note?.trim() || null,
      })
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się zapisać wpłaty sesji.')
    }

    return mapSessionPaymentRowToModel(data as SessionPaymentRow)
  },

  async update(
    id: string,
    input: UpdateSessionPaymentInput,
  ): Promise<SessionPayment> {
    const patch: Record<string, unknown> = {}
    if (input.type !== undefined) patch.type = input.type
    if (input.amount !== undefined) patch.amount = input.amount
    if (input.method !== undefined) patch.method = input.method
    if (input.note !== undefined) patch.note = input.note?.trim() || null
    if (input.paid !== undefined || input.paymentDate !== undefined) {
      patch.payment_date = resolvePaymentDate(input.paid, input.paymentDate)
    }

    const { data, error } = await supabase
      .from('session_payments')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się zaktualizować wpłaty sesji.')
    }

    return mapSessionPaymentRowToModel(data as SessionPaymentRow)
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('session_payments')
      .delete()
      .eq('id', id)
    throwOnError(error)
  },
}
