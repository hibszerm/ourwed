import {
  asCatalogPackageId,
  toDateString,
  toNumber,
} from '@/lib/supabase/helpers'
import { createDefaultQuestionnaires } from '@/lib/utils/questionnaires'
import type {
  Wedding,
  WeddingPackageItemSnapshot,
  WeddingStatus,
  WorkflowStage,
} from '@/types/wedding'

export const DEFAULT_WEDDING_ACCENT = '#0a0a0a'
export const DEFAULT_WEDDING_CURRENCY = 'PLN'

/**
 * Columns that exist on `public.weddings`.
 * Partner address / first-last split / location detail live in
 * contract `form_answers.answer_json` and are merged at hydrate time.
 */
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
  package_id: string | null
  contract_value: number | string | null
  deposit_amount: number | string | null
  currency: string
  accent_color: string | null
  package_items_snapshot?: unknown
  coverage_hours?: number | string | null
  coverage_end_time?: string | null
  overtime_rate?: number | string | null
  delivery_months?: number | string | null
  delivery_days?: number | string | null
  final_payment_due_date?: string | null
  bride_preparation_location?: string | null
  groom_preparation_location?: string | null
  selected_package_ids?: string[] | null
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

function isWeddingStatus(value: string): value is WeddingStatus {
  return value === 'active' || value === 'archived' || value === 'cancelled'
}

function fullName(first?: string | null, last?: string | null, fallback = ''): string {
  const joined = [first, last].map((p) => p?.trim()).filter(Boolean).join(' ')
  return joined || fallback
}

export function splitPersonName(full: string): { first: string; last: string } {
  const trimmed = full.trim()
  if (!trimmed) return { first: '', last: '' }
  const space = trimmed.indexOf(' ')
  if (space < 0) return { first: trimmed, last: '' }
  return {
    first: trimmed.slice(0, space).trim(),
    last: trimmed.slice(space + 1).trim(),
  }
}

function ceremonyTimeToInput(value: string | null): string | undefined {
  if (!value) return undefined
  return value.slice(0, 5)
}

export function parsePackageItemsSnapshot(
  raw: unknown,
): WeddingPackageItemSnapshot[] {
  if (!Array.isArray(raw)) return []
  const items: WeddingPackageItemSnapshot[] = []
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const title = typeof rec.title === 'string' ? rec.title.trim() : ''
    if (!title) continue
    const quantityRaw = rec.quantity
    items.push({
      sourceItemId:
        typeof rec.sourceItemId === 'string'
          ? rec.sourceItemId
          : typeof rec.source_item_id === 'string'
            ? rec.source_item_id
            : null,
      title,
      description:
        typeof rec.description === 'string' ? rec.description : null,
      sortOrder:
        typeof rec.sortOrder === 'number'
          ? rec.sortOrder
          : typeof rec.sort_order === 'number'
            ? rec.sort_order
            : i,
      enabled: rec.enabled === false || rec.is_enabled === false ? false : true,
      quantity:
        typeof quantityRaw === 'number'
          ? quantityRaw
          : typeof quantityRaw === 'string' && quantityRaw.trim()
            ? Number(quantityRaw)
            : null,
      unit: typeof rec.unit === 'string' ? rec.unit : null,
      category:
        typeof rec.category === 'string'
          ? rec.category
          : typeof rec.item_category === 'string'
            ? rec.item_category
            : null,
    })
  }
  return items.sort((a, b) => a.sortOrder - b.sortOrder)
}

function optionalRowNumber(
  value: number | string | null | undefined,
): number | null {
  if (value == null || value === '') return null
  const n = toNumber(value, Number.NaN)
  return Number.isFinite(n) ? n : null
}

/** Map a `public.weddings` row → app `Wedding` view model (scalars only). */
export function mapWeddingRowToModel(row: WeddingRow): Wedding {
  const venue = row.venue ?? ''
  const email = row.email ?? ''
  const phone = row.phone ?? ''
  const brideSplit = splitPersonName(row.bride_name)
  const groomSplit = splitPersonName(row.groom_name)

  return {
    id: row.id,
    couple: {
      partner1: row.bride_name,
      partner2: row.groom_name,
      partner1FirstName: brideSplit.first || undefined,
      partner1LastName: brideSplit.last || undefined,
      partner2FirstName: groomSplit.first || undefined,
      partner2LastName: groomSplit.last || undefined,
      partner1Phone: phone || undefined,
      partner1Email: email || undefined,
      email,
      phone,
      venue,
      city: '',
    },
    date: toDateString(row.wedding_date),
    ceremonyTime: ceremonyTimeToInput(row.ceremony_time),
    status: isWeddingStatus(row.status) ? row.status : 'active',
    workflowStage: isWorkflowStage(row.workflow_stage)
      ? row.workflow_stage
      : 'reservation',
    packageName: row.package_name ?? '',
    packageId: asCatalogPackageId(row.package_id),
    price: toNumber(row.contract_value, 0),
    depositAmount: toNumber(row.deposit_amount, 0),
    currency: row.currency || DEFAULT_WEDDING_CURRENCY,
    packageItems: parsePackageItemsSnapshot(row.package_items_snapshot),
    coverageHours: optionalRowNumber(row.coverage_hours),
    coverageEndTime: row.coverage_end_time?.trim() || null,
    overtimeRate: optionalRowNumber(row.overtime_rate),
    deliveryMonths: optionalRowNumber(row.delivery_months),
    deliveryDays: optionalRowNumber(row.delivery_days),
    finalPaymentDueDate: row.final_payment_due_date
      ? toDateString(row.final_payment_due_date) || row.final_payment_due_date
      : null,
    ceremonyLocation: undefined,
    receptionLocation: undefined,
    preparationLocation: undefined,
    bridePreparationLocation: row.bride_preparation_location?.trim() || undefined,
    groomPreparationLocation: row.groom_preparation_location?.trim() || undefined,
    selectedPackageIds: Array.isArray(row.selected_package_ids)
      ? row.selected_package_ids.filter((id): id is string => typeof id === 'string')
      : undefined,
    accentColor: row.accent_color || DEFAULT_WEDDING_ACCENT,
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

/** Map app `Wedding` → real writable columns on `public.weddings` only. */
export function mapWeddingModelToRow(
  wedding: Wedding,
): Omit<WeddingRow, 'id' | 'user_id' | 'created_at' | 'updated_at'> {
  const c = wedding.couple
  const brideName =
    fullName(c.partner1FirstName, c.partner1LastName, c.partner1) || c.partner1
  const groomName =
    fullName(c.partner2FirstName, c.partner2LastName, c.partner2) || c.partner2
  const email = c.partner1Email?.trim() || c.email?.trim() || null
  const phone = c.partner1Phone?.trim() || c.phone?.trim() || null
  const venue =
    wedding.receptionLocation?.trim() ||
    c.venue?.trim() ||
    wedding.ceremonyLocation?.trim() ||
    null

  let ceremonyTime: string | null = null
  if (wedding.ceremonyTime?.trim()) {
    const t = wedding.ceremonyTime.trim()
    ceremonyTime = t.length === 5 ? `${t}:00` : t.slice(0, 8)
  }

  return {
    bride_name: brideName,
    groom_name: groomName,
    email,
    phone,
    wedding_date: wedding.date || null,
    ceremony_time: ceremonyTime,
    venue,
    status: wedding.status || 'active',
    workflow_stage: wedding.workflowStage,
    package_name: wedding.packageName || null,
    package_id: asCatalogPackageId(wedding.packageId),
    contract_value: wedding.price,
    deposit_amount: wedding.depositAmount ?? null,
    currency: wedding.currency || DEFAULT_WEDDING_CURRENCY,
    accent_color: wedding.accentColor || null,
    package_items_snapshot: wedding.packageItems ?? [],
    coverage_hours: wedding.coverageHours ?? null,
    coverage_end_time: wedding.coverageEndTime?.trim() || null,
    overtime_rate: wedding.overtimeRate ?? null,
    delivery_months: wedding.deliveryMonths ?? null,
    delivery_days: wedding.deliveryDays ?? null,
    final_payment_due_date: wedding.finalPaymentDueDate?.trim() || null,
    bride_preparation_location:
      wedding.bridePreparationLocation?.trim() ||
      wedding.preparationLocation?.trim() ||
      null,
    groom_preparation_location:
      wedding.groomPreparationLocation?.trim() || null,
    selected_package_ids:
      wedding.selectedPackageIds && wedding.selectedPackageIds.length > 0
        ? wedding.selectedPackageIds
        : null,
  }
}
