import { supabase } from '@/lib/supabase'
import { nowIso, throwOnError, toNumber, asCatalogPackageId } from '@/lib/supabase/helpers'
import {
  slugify,
  type PackageItem,
  type StudioPackage,
} from '@/types/package'
import { packageItemService } from '@/lib/api/packageItemService'

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
  created_at: string
  updated_at: string
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
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = slugify(base)
  let n = 0
  for (;;) {
    let query = supabase.from('packages').select('id').eq('slug', candidate).maybeSingle()
    const { data, error } = await query
    throwOnError(error)
    if (!data || (excludeId && data.id === excludeId)) return candidate
    n += 1
    candidate = `${slugify(base)}-${n}`
  }
}

export const packageService = {
  async list(options?: { activeOnly?: boolean }): Promise<StudioPackage[]> {
    let query = supabase
      .from('packages')
      .select('*')
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
    const { data: maxRow } = await supabase
      .from('packages')
      .select('sort_order')
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
      })
      .select('*')
      .single()

    throwOnError(error)
    return mapPackage(data as PackageRow, [])
  },

  async update(id: string, input: UpdatePackageInput): Promise<StudioPackage> {
    const patch: Record<string, unknown> = {
      updated_at: nowIso(),
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
    })

    for (const item of source.items) {
      await packageItemService.create({
        packageId: copy.id,
        title: item.title,
        description: item.description,
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
}
