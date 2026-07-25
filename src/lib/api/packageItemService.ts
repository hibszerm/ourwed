import { supabase } from '@/lib/supabase'
import { asCatalogPackageId, throwOnError, toNumber } from '@/lib/supabase/helpers'
import type { PackageItem } from '@/types/package'

interface PackageItemRow {
  id: string
  package_id: string
  title: string
  description: string | null
  sort_order: number
  created_at: string
  is_enabled?: boolean | null
  quantity?: number | string | null
  unit?: string | null
  item_category?: string | null
}

function mapItem(row: PackageItemRow): PackageItem {
  return {
    id: row.id,
    packageId: row.package_id,
    title: row.title,
    description: row.description,
    sortOrder: row.sort_order,
    enabled: row.is_enabled !== false,
    quantity:
      row.quantity == null || row.quantity === ''
        ? null
        : toNumber(row.quantity, 0),
    unit: row.unit?.trim() || null,
    category: row.item_category?.trim() || null,
    createdAt: row.created_at,
  }
}

export interface CreatePackageItemInput {
  packageId: string
  title: string
  description?: string | null
  enabled?: boolean
  quantity?: number | null
  unit?: string | null
  category?: string | null
}

export interface UpdatePackageItemInput {
  title?: string
  description?: string | null
  enabled?: boolean
  quantity?: number | null
  unit?: string | null
  category?: string | null
}

export const packageItemService = {
  async list(packageId: string): Promise<PackageItem[]> {
    const id = asCatalogPackageId(packageId)
    if (!id) return []

    const { data, error } = await supabase
      .from('package_items')
      .select('*')
      .eq('package_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    throwOnError(error)
    return ((data ?? []) as PackageItemRow[]).map(mapItem)
  },

  async listByPackageIds(
    packageIds: string[],
  ): Promise<Map<string, PackageItem[]>> {
    const map = new Map<string, PackageItem[]>()
    const ids = packageIds
      .map((id) => asCatalogPackageId(id))
      .filter((id): id is string => Boolean(id))
    if (ids.length === 0) return map

    const { data, error } = await supabase
      .from('package_items')
      .select('*')
      .in('package_id', ids)
      .order('sort_order', { ascending: true })

    throwOnError(error)

    for (const id of ids) map.set(id, [])
    for (const row of (data ?? []) as PackageItemRow[]) {
      const list = map.get(row.package_id) ?? []
      list.push(mapItem(row))
      map.set(row.package_id, list)
    }
    return map
  },

  async create(input: CreatePackageItemInput): Promise<PackageItem> {
    const packageId = asCatalogPackageId(input.packageId)
    if (!packageId) {
      throw new Error('Nieprawidłowy identyfikator pakietu.')
    }

    const { data: maxRow } = await supabase
      .from('package_items')
      .select('sort_order')
      .eq('package_id', packageId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const sortOrder = (maxRow?.sort_order ?? -1) + 1

    const { data, error } = await supabase
      .from('package_items')
      .insert({
        package_id: packageId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        sort_order: sortOrder,
        is_enabled: input.enabled !== false,
        quantity: input.quantity ?? null,
        unit: input.unit?.trim() || null,
        item_category: input.category?.trim() || null,
      })
      .select('*')
      .single()

    throwOnError(error)
    return mapItem(data as PackageItemRow)
  },

  async update(id: string, input: UpdatePackageItemInput): Promise<PackageItem> {
    const patch: Record<string, unknown> = {}
    if (input.title !== undefined) patch.title = input.title.trim()
    if (input.description !== undefined) {
      patch.description = input.description?.trim() || null
    }
    if (input.enabled !== undefined) patch.is_enabled = input.enabled
    if (input.quantity !== undefined) patch.quantity = input.quantity
    if (input.unit !== undefined) patch.unit = input.unit?.trim() || null
    if (input.category !== undefined) {
      patch.item_category = input.category?.trim() || null
    }

    const { data, error } = await supabase
      .from('package_items')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    throwOnError(error)
    return mapItem(data as PackageItemRow)
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('package_items').delete().eq('id', id)
    throwOnError(error)
  },

  async reorder(packageId: string, orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase
        .from('package_items')
        .update({ sort_order: i })
        .eq('id', orderedIds[i])
        .eq('package_id', packageId)
      throwOnError(error)
    }
  },
}
