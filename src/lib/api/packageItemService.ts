import { supabase } from '@/lib/supabase'
import { asCatalogPackageId, throwOnError } from '@/lib/supabase/helpers'
import type { PackageItem } from '@/types/package'

interface PackageItemRow {
  id: string
  package_id: string
  title: string
  description: string | null
  sort_order: number
  created_at: string
}

function mapItem(row: PackageItemRow): PackageItem {
  return {
    id: row.id,
    packageId: row.package_id,
    title: row.title,
    description: row.description,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }
}

export interface CreatePackageItemInput {
  packageId: string
  title: string
  description?: string | null
}

export interface UpdatePackageItemInput {
  title?: string
  description?: string | null
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
