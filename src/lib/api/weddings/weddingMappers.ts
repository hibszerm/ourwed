import {
  toDateString,
  toNumber,
} from '@/lib/supabase/helpers'
import { createDefaultQuestionnaires } from '@/lib/utils/questionnaires'
import type { Wedding, WorkflowStage } from '@/types/wedding'

export const DEFAULT_WEDDING_ACCENT = '#7c5cbf'
export const DEFAULT_WEDDING_CURRENCY = 'PLN'

export interface WeddingRow {
  id: string
  user_id: string
  bride_name: string
  groom_name: string
  email: string | null
  phone: string | null
  wedding_date: string | null
  ceremony_time: string | null
  venue: string | null
  status: string
  workflow_stage: string
  package_name: string | null
  contract_value: number | string | null
  deposit_amount: number | string | null
  currency: string
  created_at: string
  updated_at: string
}

function isWorkflowStage(value: string): value is WorkflowStage {
  return (
    value === 'reservation' ||
    value === 'contract' ||
    value === 'deposit' ||
    value === 'preparation' ||
    value === 'pre_wedding_questionnaire' ||
    value === 'wedding_day' ||
    value === 'post_production' ||
    value === 'completed'
  )
}

/** Map a `public.weddings` row → app `Wedding` view model. */
export function mapWeddingRowToModel(row: WeddingRow): Wedding {
  const venue = row.venue ?? ''
  const email = row.email ?? ''
  const phone = row.phone ?? ''

  return {
    id: row.id,
    couple: {
      partner1: row.bride_name,
      partner2: row.groom_name,
      email,
      phone,
      venue,
      city: '',
      partner1Email: email || undefined,
      partner1Phone: phone || undefined,
    },
    date: toDateString(row.wedding_date),
    workflowStage: isWorkflowStage(row.workflow_stage)
      ? row.workflow_stage
      : 'reservation',
    packageName: row.package_name ?? '',
    price: toNumber(row.contract_value, 0),
    ceremonyLocation: undefined,
    receptionLocation: undefined,
    accentColor: DEFAULT_WEDDING_ACCENT,
    createdAt: toDateString(row.created_at) || row.created_at,
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: createDefaultQuestionnaires(),
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
  }
}

/** Map app `Wedding` → columns writable on `public.weddings`. */
export function mapWeddingModelToRow(
  wedding: Wedding,
): Omit<WeddingRow, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'status'> & {
  status?: string
} {
  const venue =
    wedding.couple.venue ||
    wedding.receptionLocation ||
    wedding.ceremonyLocation ||
    null

  return {
    bride_name: wedding.couple.partner1,
    groom_name: wedding.couple.partner2,
    email: wedding.couple.email || wedding.couple.partner1Email || null,
    phone: wedding.couple.phone || wedding.couple.partner1Phone || null,
    wedding_date: wedding.date || null,
    ceremony_time: null,
    venue,
    workflow_stage: wedding.workflowStage,
    package_name: wedding.packageName || null,
    contract_value: wedding.price,
    deposit_amount: null,
    currency: DEFAULT_WEDDING_CURRENCY,
  }
}
