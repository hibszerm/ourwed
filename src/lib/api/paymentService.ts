import { supabase } from '@/lib/supabase'
import { throwOnError, toNumber } from '@/lib/supabase/helpers'
import type { Payment, PaymentMethod, PaymentType } from '@/types/wedding'

interface PaymentRow {
  id: string
  wedding_id: string
  type: string
  amount: number | string
  payment_date: string | null
  method: string | null
  note: string | null
  created_at: string
  received_by_user_id: string | null
  receiver_relationship_id: string | null
  receiver_label_snapshot: string | null
  receiver_kind: 'owner' | 'collaborator' | null
  compensation_revision: number | string
}

const TYPE_LABELS: Record<PaymentType, string> = {
  deposit: 'Zadatek',
  installment: 'Wpłata',
  final: 'Płatność końcowa',
  other: 'Inne',
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

export function mapPaymentRowToModel(row: PaymentRow): Payment {
  const type: PaymentType = isPaymentType(row.type) ? row.type : 'other'
  const paymentDate = row.payment_date
    ? row.payment_date.slice(0, 10)
    : undefined

  return {
    id: row.id,
    label: TYPE_LABELS[type],
    amount: toNumber(row.amount),
    type,
    paid: Boolean(paymentDate),
    paidAt: paymentDate,
    // No due_date column — unpaid payments have null payment_date.
    dueDate: undefined,
    method: isPaymentMethod(row.method) ? row.method : undefined,
    note: row.note ?? undefined,
    receivedByUserId: row.received_by_user_id ?? undefined,
    receiverRelationshipId: row.receiver_relationship_id ?? undefined,
    receiverLabel: row.receiver_label_snapshot ?? undefined,
    receiverKind: row.receiver_kind ?? undefined,
    receiverRevision: String(row.compensation_revision ?? 1),
  }
}

export interface CreatePaymentInput {
  weddingId: string
  type: PaymentType
  amount: number | string
  paymentDate?: string | null
  method?: PaymentMethod | null
  note?: string
  paid?: boolean
  receivedByUserId?: string
  receiverRelationshipId?: string | null
}

export interface UpdatePaymentInput {
  expectedRevision: string
  type?: PaymentType
  amount?: number | string
  paymentDate?: string | null
  method?: PaymentMethod | null
  note?: string | null
  paid?: boolean
  receivedByUserId?: string
  receiverRelationshipId?: string | null
}

export interface PaymentReceiverOption {
  userId: string
  relationshipId: string | null
  label: string
  kind: 'owner' | 'collaborator'
}

export function paymentReceiverOptionKey(option: PaymentReceiverOption): string {
  return option.kind === 'owner'
    ? `owner:${option.userId}`
    : `collaborator:${option.relationshipId}`
}

export function defaultPaymentReceiverKey(options: PaymentReceiverOption[]): string {
  const owner = options.find((option) => option.kind === 'owner')
  return owner ? paymentReceiverOptionKey(owner) : ''
}

export function resolvePaymentReceiverOption(
  options: PaymentReceiverOption[],
  selectedKey: string,
): PaymentReceiverOption | undefined {
  return options.find((option) => paymentReceiverOptionKey(option) === selectedKey)
}

export function paymentReceiverFields(option: PaymentReceiverOption): Pick<
  UpdatePaymentInput,
  'receivedByUserId' | 'receiverRelationshipId'
> {
  return {
    receivedByUserId: option.userId,
    receiverRelationshipId: option.relationshipId,
  }
}

function emptyPaymentMap(ids: string[]): Map<string, Payment[]> {
  const map = new Map<string, Payment[]>()
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
  return paymentDate === null ? null : paymentDate?.slice(0, 10) ?? null
}

export const paymentService = {
  async listReceivers(weddingId: string): Promise<PaymentReceiverOption[]> {
    const { data, error } = await supabase.rpc('list_wedding_payment_receivers_v3', {
      p_wedding_id: weddingId,
    })
    throwOnError(error)
    const value = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    const ownerId = typeof value.owner_user_id === 'string' ? value.owner_user_id : null
    const ownerLabel = typeof value.owner_label === 'string' ? value.owner_label : 'Ja / studio'
    const result: PaymentReceiverOption[] = ownerId
      ? [{ userId: ownerId, relationshipId: null, label: `Ja / ${ownerLabel}`, kind: 'owner' }]
      : []
    if (Array.isArray(value.collaborators)) {
      for (const raw of value.collaborators) {
        if (!raw || typeof raw !== 'object') continue
        const row = raw as Record<string, unknown>
        if (typeof row.user_id !== 'string' || typeof row.relationship_id !== 'string') continue
        result.push({
          userId: row.user_id,
          relationshipId: row.relationship_id,
          label: typeof row.label === 'string' ? row.label : 'Współpracownik',
          kind: 'collaborator',
        })
      }
    }
    return result
  },
  async listByWeddingId(weddingId: string): Promise<Payment[]> {
    const map = await this.listByWeddingIds([weddingId])
    return map.get(weddingId) ?? []
  },

  async listByWeddingIds(weddingIds: string[]): Promise<Map<string, Payment[]>> {
    const map = emptyPaymentMap(weddingIds)
    if (weddingIds.length === 0) return map

    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .in('wedding_id', weddingIds)
      .order('payment_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    throwOnError(error)

    for (const row of (data ?? []) as PaymentRow[]) {
      const list = map.get(row.wedding_id) ?? []
      list.push(mapPaymentRowToModel(row))
      map.set(row.wedding_id, list)
    }
    return map
  },

  async create(input: CreatePaymentInput): Promise<Payment> {
    const paid = input.paid ?? Boolean(input.paymentDate)
    const paymentDate = resolvePaymentDate(paid, input.paymentDate)

    const { data, error } = await supabase
      .from('payments')
      .insert({
        wedding_id: input.weddingId,
        type: input.type,
        amount: input.amount,
        payment_date: paymentDate,
        method: input.method ?? null,
        note: input.note?.trim() || null,
        received_by_user_id: input.receivedByUserId ?? null,
        receiver_relationship_id: input.receiverRelationshipId ?? null,
      })
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się zapisać wpłaty.')
    }

    return mapPaymentRowToModel(data as PaymentRow)
  },

  async update(id: string, input: UpdatePaymentInput): Promise<Payment> {
    const patch: Record<string, unknown> = {}
    if (input.type !== undefined) patch.type = input.type
    if (input.amount !== undefined) patch.amount = input.amount
    if (input.method !== undefined) patch.method = input.method
    if (input.note !== undefined) patch.note = input.note?.trim() || null
    if (input.receivedByUserId !== undefined) patch.received_by_user_id = input.receivedByUserId
    if (input.receiverRelationshipId !== undefined) patch.receiver_relationship_id = input.receiverRelationshipId
    if (input.paid !== undefined || input.paymentDate !== undefined) {
      patch.payment_date = resolvePaymentDate(input.paid, input.paymentDate)
    }

    const { data, error } = await supabase
      .from('payments')
      .update(patch)
      .eq('id', id)
      .eq('compensation_revision', input.expectedRevision)
      .select('*')
      .single()

    if (error?.code === 'PGRST116') throw new Error('CONFLICT')
    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się zaktualizować wpłaty.')
    }

    return mapPaymentRowToModel(data as PaymentRow)
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('payments').delete().eq('id', id)
    throwOnError(error)
  },
}
