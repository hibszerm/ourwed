import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'

export interface CompensationV3Receipt {
  id: string
  amount: string
  receivedOn: string
  description: string | null
  revision: string
}

export interface CompensationV3ReceiptSource {
  paymentId: string
  amount: string
  receivedOn: string
  label: string
  source: 'client_payment'
}

export interface OwnerCompensationRelationshipV3 {
  relationshipId: string
  recipientUserId: string | null
  recipientLabel: string
  activeMembership: boolean
  amount: string | null
  currency: string
  dueDate: string | null
  active: boolean
  termsRevision: string
  amountRevision: string
}

export interface CompensationV3Model {
  relationshipId: string
  weddingId: string
  weddingLabel: string
  weddingDate: string | null
  currency: string
  compensationLevel: 0 | 1 | 2
  accessVersion: string | null
  personalValueKnown: boolean
  personalValue: string | null
  valueSource: 'official_compensation' | 'private_fallback' | 'unknown'
  dueDate: string | null
  clientReceivedTotal: string
  privateReceivedTotal: string
  receivedTotal: string
  balanceKnown: boolean
  balance: string | null
  fallbackAmount: string | null
  fallbackDueDate: string | null
  privateRevision: string
  termsRevision: string | null
  activeMembership: boolean
  privateReceipts: CompensationV3Receipt[]
  clientReceipts: CompensationV3ReceiptSource[]
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function string(value: unknown): string | null {
  return typeof value === 'string' ? value : value == null ? null : String(value)
}

function receipt(value: unknown): CompensationV3Receipt | null {
  const row = object(value)
  const id = string(row.id)
  const amount = string(row.amount)
  const receivedOn = string(row.received_on)
  if (!id || amount == null || !receivedOn) return null
  return {
    id,
    amount,
    receivedOn,
    description: string(row.description),
    revision: string(row.revision) ?? '1',
  }
}

export const compensationV3QueryKeys = {
  shared: (userId: string | undefined, weddingId: string, accessVersion: string) =>
    ['collaboration-compensation-v3', 'shared', userId, weddingId, accessVersion] as const,
  private: (userId: string | undefined, relationshipId: string, accessVersion: string) =>
    ['collaboration-compensation-v3', 'private', userId, relationshipId, accessVersion] as const,
  owner: (userId: string | undefined, weddingId: string) =>
    ['collaboration-compensation-v3', 'owner', userId, weddingId] as const,
  personalFinance: (userId: string | undefined, year?: number) =>
    ['personal-finance-v3', userId, year] as const,
}

export const compensationV3Service = {
  async getOwnerRelationships(weddingId: string): Promise<OwnerCompensationRelationshipV3[]> {
    const { data, error } = await supabase.rpc('get_owner_compensation_relationships_v3', {
      p_wedding_id: weddingId,
    })
    throwOnError(error)
    if (!Array.isArray(data)) return []
    return data.map((item): OwnerCompensationRelationshipV3 | null => {
      const row = object(item)
      const relationshipId = string(row.relationship_id)
      if (!relationshipId) return null
      return {
        relationshipId,
        recipientUserId: string(row.recipient_user_id),
        recipientLabel: string(row.recipient_label) ?? 'Współpracownik',
        activeMembership: row.active_membership === true,
        amount: string(row.amount),
        currency: string(row.currency) ?? 'PLN',
        dueDate: string(row.due_date),
        active: row.active === true,
        termsRevision: string(row.terms_revision) ?? '0',
        amountRevision: string(row.amount_revision) ?? '0',
      }
    }).filter((row): row is OwnerCompensationRelationshipV3 => row !== null)
  },

  async mutateOwnerTerms(input: {
    relationshipId: string
    expectedTermsRevision: string
    amount: string
    dueDate: string | null
    active: boolean
  }): Promise<void> {
    const { error } = await supabase.rpc('mutate_owner_compensation_terms_v3', {
      p_relationship_id: input.relationshipId,
      p_expected_terms_revision: input.expectedTermsRevision,
      p_amount: input.amount,
      p_due_date: input.dueDate,
      p_active: input.active,
    })
    throwOnError(error)
  },

  async getShared(weddingId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase.rpc('get_my_collaborative_compensation_v3', {
      p_wedding_id: weddingId,
    })
    throwOnError(error)
    return data ? object(data) : null
  },

  async getPrivate(
    relationshipId: string,
    shared: Record<string, unknown> = {},
  ): Promise<CompensationV3Model> {
    const { data, error } = await supabase.rpc('get_my_private_compensation_v3', {
      p_relationship_id: relationshipId,
    })
    throwOnError(error)
    const row = object(data)
    const level = Number(shared.compensation_level)
    const privateReceipts = Array.isArray(row.private_receipts)
      ? row.private_receipts.map(receipt).filter((item): item is CompensationV3Receipt => item !== null)
      : []
    const clientReceipts = Array.isArray(row.client_receipts)
      ? row.client_receipts.map((value): CompensationV3ReceiptSource | null => {
          const item = object(value)
          const paymentId = string(item.payment_id)
          const amount = string(item.amount)
          const receivedOn = string(item.received_on)
          if (!paymentId || amount == null || !receivedOn) return null
          return {
            paymentId,
            amount,
            receivedOn,
            label: string(item.label) ?? 'Wpłata od klienta',
            source: 'client_payment',
          }
        }).filter((item): item is CompensationV3ReceiptSource => item !== null)
      : []
    const personalValue = string(row.personal_value)
    return {
      relationshipId: string(row.relationship_id) ?? '',
      weddingId: string(row.wedding_snapshot) ?? '',
      weddingLabel: string(row.wedding_label) ?? 'Wesele',
      weddingDate: string(row.wedding_date),
      currency: string(row.currency) ?? 'PLN',
      compensationLevel: level === 2 ? 2 : level === 1 ? 1 : 0,
      accessVersion: string(shared.access_version),
      personalValueKnown: row.personal_value_known === true,
      personalValue,
      valueSource: row.value_source === 'official_compensation'
        ? 'official_compensation'
        : row.value_source === 'private_fallback' ? 'private_fallback' : 'unknown',
      dueDate: string(row.due_date),
      clientReceivedTotal: string(row.client_received_total) ?? '0',
      privateReceivedTotal: string(row.private_received_total) ?? '0',
      receivedTotal: string(row.received_total) ?? '0',
      balanceKnown: row.balance_known === true,
      balance: string(row.balance),
      fallbackAmount: string(row.fallback_amount),
      fallbackDueDate: string(row.fallback_due_date),
      privateRevision: string(row.private_revision) ?? '1',
      termsRevision: string(row.terms_revision),
      activeMembership: row.active_membership === true,
      privateReceipts,
      clientReceipts,
    }
  },

  async loadForWedding(weddingId: string): Promise<CompensationV3Model> {
    const shared = await this.getShared(weddingId)
    const relationshipId = string(shared?.relationship_id)
    if (!relationshipId) throw new Error('UNAVAILABLE')
    return this.getPrivate(relationshipId, shared ?? {})
  },

  async updateFallback(input: {
    relationshipId: string
    expectedRevision: string
    amount: string | null
    dueDate: string | null
  }): Promise<void> {
    const { error } = await supabase.rpc('mutate_my_private_compensation_settings_v3', {
      p_relationship_id: input.relationshipId,
      p_expected_revision: input.expectedRevision,
      p_fallback_amount: input.amount,
      p_fallback_due_date: input.dueDate,
    })
    throwOnError(error)
  },

  async createPrivateReceipt(input: {
    relationshipId: string
    amount: string
    receivedOn: string
    description: string | null
    expectedRevision: string
  }): Promise<void> {
    const { error } = await supabase.rpc('create_my_private_compensation_receipt_v3', {
      p_relationship_id: input.relationshipId,
      p_amount: input.amount,
      p_received_on: input.receivedOn,
      p_description: input.description,
      p_expected_revision: input.expectedRevision,
    })
    throwOnError(error)
  },

  async deletePrivateReceipt(input: {
    receiptId: string
    expectedReceiptRevision: string
    expectedPrivateRevision: string
  }): Promise<void> {
    const { error } = await supabase.rpc('delete_my_private_compensation_receipt_v3', {
      p_receipt_id: input.receiptId,
      p_expected_receipt_revision: input.expectedReceiptRevision,
      p_expected_private_revision: input.expectedPrivateRevision,
    })
    throwOnError(error)
  },

  async updateOfficialTerms(input: {
    relationshipId: string
    weddingId: string
    accessVersion: string
    expectedTermsRevision: string
    amount: string
    dueDate: string | null
    active: boolean
  }): Promise<void> {
    const { error } = await supabase.rpc('mutate_my_shared_compensation_terms_v3', {
      p_wedding_id: input.weddingId,
      p_expected_access_version: input.accessVersion,
      p_expected_terms_revision: input.expectedTermsRevision,
      p_amount: input.amount,
      p_due_date: input.dueDate,
      p_active: input.active,
    })
    throwOnError(error)
  },
}
