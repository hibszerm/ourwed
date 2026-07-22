import { supabase } from '@/lib/supabase'
import { nowIso, throwOnError, toNumber } from '@/lib/supabase/helpers'
import { requireStudioUserId } from '@/lib/api/ownership'
import { slugify, type ExtraService } from '@/types/package'

interface ExtraServiceRow {
  id: string
  name: string
  slug: string
  description: string | null
  price: number | string
  currency: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

function mapRow(row: ExtraServiceRow): ExtraService {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: toNumber(row.price, 0),
    currency: row.currency || 'PLN',
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface CreateExtraServiceInput {
  name: string
  slug?: string
  description?: string | null
  price: number
  currency?: string
  isActive?: boolean
}

export interface UpdateExtraServiceInput {
  name?: string
  slug?: string
  description?: string | null
  price?: number
  currency?: string
  isActive?: boolean
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const userId = await requireStudioUserId()
  let candidate = slugify(base)
  let n = 0
  for (;;) {
    const { data, error } = await supabase
      .from('extra_services')
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

export const extraServiceService = {
  async list(options?: { activeOnly?: boolean }): Promise<ExtraService[]> {
    const userId = await requireStudioUserId()
    let query = supabase
      .from('extra_services')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (options?.activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query
    throwOnError(error)
    return ((data ?? []) as ExtraServiceRow[]).map(mapRow)
  },

  async get(id: string): Promise<ExtraService | null> {
    const { data, error } = await supabase
      .from('extra_services')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    throwOnError(error)
    return data ? mapRow(data as ExtraServiceRow) : null
  },

  async create(input: CreateExtraServiceInput): Promise<ExtraService> {
    const userId = await requireStudioUserId()
    const { data: maxRow } = await supabase
      .from('extra_services')
      .select('sort_order')
      .eq('user_id', userId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const sortOrder = (maxRow?.sort_order ?? -1) + 1
    const slug = await uniqueSlug(input.slug?.trim() || input.name)

    const { data, error } = await supabase
      .from('extra_services')
      .insert({
        name: input.name.trim(),
        slug,
        description: input.description?.trim() || null,
        price: input.price,
        currency: input.currency ?? 'PLN',
        is_active: input.isActive ?? true,
        sort_order: sortOrder,
        user_id: userId,
      })
      .select('*')
      .single()

    throwOnError(error)
    return mapRow(data as ExtraServiceRow)
  },

  async update(id: string, input: UpdateExtraServiceInput): Promise<ExtraService> {
    const patch: Record<string, unknown> = { updated_at: nowIso() }
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) {
      patch.description = input.description?.trim() || null
    }
    if (input.price !== undefined) patch.price = input.price
    if (input.currency !== undefined) patch.currency = input.currency
    if (input.isActive !== undefined) patch.is_active = input.isActive
    if (input.slug !== undefined || input.name !== undefined) {
      patch.slug = await uniqueSlug(
        input.slug?.trim() || input.name || 'usluga',
        id,
      )
    }

    const { data, error } = await supabase
      .from('extra_services')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    throwOnError(error)
    return mapRow(data as ExtraServiceRow)
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('extra_services').delete().eq('id', id)
    throwOnError(error)
  },

  async reorder(orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase
        .from('extra_services')
        .update({ sort_order: i, updated_at: nowIso() })
        .eq('id', orderedIds[i])
      throwOnError(error)
    }
  },
}
