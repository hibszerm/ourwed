import { supabase } from '@/lib/supabase'
import { nowIso, throwOnError, toNumber, asCatalogPackageId } from '@/lib/supabase/helpers'
import { requireStudioUserId } from '@/lib/api/ownership'
import {
  slugify,
  type PackageItem,
  type StudioPackage,
} from '@/types/package'
import { packageItemService } from '@/lib/api/packageItemService'
import {
  normalizeFinalPaymentTerms,
  parseFinalPaymentTerms,
  type FinalPaymentTerms,
} from '@/lib/utils/finalPaymentTerms'

interface PackageRow {
  id: string
  name: string
  slug: string
  description: string | null
  price: number | string
  deposit_amount: number | string
  currency: string
  color: string | null
  is_active: boolean
  sort_order: number
  questionnaire_form_id?: string | null
  active_contract_template_id?: string | null
  active_contract_template_version_id?: string | null
  coverage_hours?: number | string | null
  coverage_end_time?: string | null
  overtime_rate?: number | string | null
  delivery_months?: number | string | null
  delivery_days?: number | string | null
  final_payment_terms?: unknown
  created_at: string
  updated_at: string
}

function optionalNumber(
  value: number | string | null | undefined,
): number | null {
  if (value == null || value === '') return null
  const n = toNumber(value, Number.NaN)
  return Number.isFinite(n) ? n : null
}

function mapPackage(row: PackageRow, items: PackageItem[] = []): StudioPackage {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: toNumber(row.price, 0),
    depositAmount: toNumber(row.deposit_amount, 0),
    currency: row.currency || 'PLN',
    color: row.color,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    questionnaireFormId: row.questionnaire_form_id ?? null,
    activeContractTemplateId: row.active_contract_template_id ?? null,
    activeContractTemplateVersionId:
      row.active_contract_template_version_id ?? null,
    coverageHours: optionalNumber(row.coverage_hours),
    coverageEndTime: row.coverage_end_time?.trim() || null,
    overtimeRate: optionalNumber(row.overtime_rate),
    deliveryMonths: optionalNumber(row.delivery_months),
    deliveryDays: optionalNumber(row.delivery_days),
    finalPaymentTerms: parseFinalPaymentTerms(row.final_payment_terms),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  }
}

export interface CreatePackageInput {
  name: string
  slug?: string
  description?: string | null
  price: number
  depositAmount?: number
  currency?: string
  color?: string | null
  isActive?: boolean
  coverageHours?: number | null
  coverageEndTime?: string | null
  overtimeRate?: number | null
  deliveryMonths?: number | null
  deliveryDays?: number | null
  finalPaymentTerms?: FinalPaymentTerms | null
}

export interface UpdatePackageInput {
  name?: string
  slug?: string
  description?: string | null
  price?: number
  depositAmount?: number
  currency?: string
  color?: string | null
  isActive?: boolean
  questionnaireFormId?: string | null
  activeContractTemplateId?: string | null
  activeContractTemplateVersionId?: string | null
  coverageHours?: number | null
  coverageEndTime?: string | null
  overtimeRate?: number | null
  deliveryMonths?: number | null
  deliveryDays?: number | null
  finalPaymentTerms?: FinalPaymentTerms | null
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const userId = await requireStudioUserId()
  let candidate = slugify(base)
  let n = 0
  for (;;) {
    const { data, error } = await supabase
      .from('packages')
      .select('id')
      .eq('slug', candidate)
      .eq('user_id', userId)
      .maybeSingle()
    throwOnError(error)
    if (!data || (excludeId && data.id === excludeId)) return candidate
    n += 1
    candidate = `${slugify(base)}-${n}`
  }
}

function commercialPatch(
  input: CreatePackageInput | UpdatePackageInput,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if ('coverageHours' in input && input.coverageHours !== undefined) {
    patch.coverage_hours = input.coverageHours
  }
  if ('coverageEndTime' in input && input.coverageEndTime !== undefined) {
    patch.coverage_end_time = input.coverageEndTime?.trim() || null
  }
  if ('overtimeRate' in input && input.overtimeRate !== undefined) {
    patch.overtime_rate = input.overtimeRate
  }
  if ('deliveryMonths' in input && input.deliveryMonths !== undefined) {
    patch.delivery_months = input.deliveryMonths
  }
  if ('deliveryDays' in input && input.deliveryDays !== undefined) {
    patch.delivery_days = input.deliveryDays
  }
  if ('finalPaymentTerms' in input && input.finalPaymentTerms !== undefined) {
    patch.final_payment_terms = input.finalPaymentTerms
      ? normalizeFinalPaymentTerms(input.finalPaymentTerms)
      : null
  }
  return patch
}

export const packageService = {
  async list(options?: { activeOnly?: boolean }): Promise<StudioPackage[]> {
    const userId = await requireStudioUserId()
    let query = supabase
      .from('packages')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (options?.activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query
    throwOnError(error)
    const rows = (data ?? []) as PackageRow[]
    if (rows.length === 0) return []

    const ids = rows.map((r) => r.id)
    const itemsByPackage = await packageItemService.listByPackageIds(ids)

    return rows.map((row) => mapPackage(row, itemsByPackage.get(row.id) ?? []))
  },

  async get(id: string): Promise<StudioPackage | null> {
    const packageId = asCatalogPackageId(id)
    if (!packageId) return null

    const { data, error } = await supabase
      .from('packages')
      .select('*')
      .eq('id', packageId)
      .maybeSingle()
    throwOnError(error)
    if (!data) return null
    const items = await packageItemService.list(packageId)
    return mapPackage(data as PackageRow, items)
  },

  async create(input: CreatePackageInput): Promise<StudioPackage> {
    const userId = await requireStudioUserId()
    const { data: maxRow } = await supabase
      .from('packages')
      .select('sort_order')
      .eq('user_id', userId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const sortOrder = (maxRow?.sort_order ?? -1) + 1
    const slug = await uniqueSlug(input.slug?.trim() || input.name)

    const { data, error } = await supabase
      .from('packages')
      .insert({
        name: input.name.trim(),
        slug,
        description: input.description?.trim() || null,
        price: input.price,
        deposit_amount: input.depositAmount ?? 0,
        currency: input.currency ?? 'PLN',
        color: input.color ?? null,
        is_active: input.isActive ?? true,
        sort_order: sortOrder,
        user_id: userId,
        ...commercialPatch(input),
      })
      .select('*')
      .single()

    throwOnError(error)
    return mapPackage(data as PackageRow, [])
  },

  async update(id: string, input: UpdatePackageInput): Promise<StudioPackage> {
    const patch: Record<string, unknown> = {
      updated_at: nowIso(),
      ...commercialPatch(input),
    }
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) {
      patch.description = input.description?.trim() || null
    }
    if (input.price !== undefined) patch.price = input.price
    if (input.depositAmount !== undefined) patch.deposit_amount = input.depositAmount
    if (input.currency !== undefined) patch.currency = input.currency
    if (input.color !== undefined) patch.color = input.color
    if (input.isActive !== undefined) patch.is_active = input.isActive
    if (input.questionnaireFormId !== undefined) {
      patch.questionnaire_form_id = input.questionnaireFormId
    }
    if (input.activeContractTemplateId !== undefined) {
      patch.active_contract_template_id = input.activeContractTemplateId
    }
    if (input.activeContractTemplateVersionId !== undefined) {
      patch.active_contract_template_version_id =
        input.activeContractTemplateVersionId
    }
    if (input.slug !== undefined || input.name !== undefined) {
      patch.slug = await uniqueSlug(
        input.slug?.trim() || input.name || 'pakiet',
        id,
      )
    }

    const { data, error } = await supabase
      .from('packages')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    throwOnError(error)
    const items = await packageItemService.list(id)
    return mapPackage(data as PackageRow, items)
  },

  async archive(id: string): Promise<StudioPackage> {
    return packageService.update(id, { isActive: false })
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('packages').delete().eq('id', id)
    throwOnError(error)
  },

  async duplicate(id: string): Promise<StudioPackage> {
    const source = await packageService.get(id)
    if (!source) throw new Error('Nie znaleziono pakietu.')

    const copy = await packageService.create({
      name: `${source.name} (kopia)`,
      description: source.description,
      price: source.price,
      depositAmount: source.depositAmount,
      currency: source.currency,
      color: source.color,
      isActive: source.isActive,
      coverageHours: source.coverageHours,
      coverageEndTime: source.coverageEndTime,
      overtimeRate: source.overtimeRate,
      deliveryMonths: source.deliveryMonths,
      deliveryDays: source.deliveryDays,
      finalPaymentTerms: source.finalPaymentTerms,
    })

    for (const item of source.items) {
      await packageItemService.create({
        packageId: copy.id,
        title: item.title,
        description: item.description,
        enabled: item.enabled,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
      })
    }

    return (await packageService.get(copy.id))!
  },

  async reorder(orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase
        .from('packages')
        .update({ sort_order: i, updated_at: nowIso() })
        .eq('id', orderedIds[i])
      throwOnError(error)
    }
  },

  /** Associate a questionnaire form with a catalog package. */
  async linkQuestionnaireForm(
    packageId: string,
    formId: string | null,
  ): Promise<StudioPackage> {
    return packageService.update(packageId, {
      questionnaireFormId: formId,
    })
  },

  /** Assign the active package contract template (+ optional version pin). */
  async linkContractTemplate(
    packageId: string,
    templateId: string | null,
    templateVersionId: string | null = null,
  ): Promise<StudioPackage> {
    return packageService.update(packageId, {
      activeContractTemplateId: templateId,
      activeContractTemplateVersionId: templateVersionId,
    })
  },
}
