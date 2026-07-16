import { supabase } from '@/lib/supabase'
import { throwOnError, toNumber } from '@/lib/supabase/helpers'
import type { WeddingExtraService } from '@/types/package'
import { extraServiceService } from '@/lib/api/extraServiceService'

interface WeddingExtraServiceRow {
  id: string
  wedding_id: string
  extra_service_id: string
  price_snapshot: number | string
  quantity: number
  created_at: string
}

function mapRow(
  row: WeddingExtraServiceRow,
  name?: string,
): WeddingExtraService {
  return {
    id: row.id,
    weddingId: row.wedding_id,
    extraServiceId: row.extra_service_id,
    priceSnapshot: toNumber(row.price_snapshot, 0),
    quantity: row.quantity,
    createdAt: row.created_at,
    name,
  }
}

export interface AddWeddingExtraServiceInput {
  weddingId: string
  extraServiceId: string
  quantity?: number
  /** Optional override; defaults to live catalog price at selection time. */
  priceSnapshot?: number
}

export const weddingExtraServiceService = {
  async listByWeddingId(weddingId: string): Promise<WeddingExtraService[]> {
    const { data, error } = await supabase
      .from('wedding_extra_services')
      .select('*')
      .eq('wedding_id', weddingId)
      .order('created_at', { ascending: true })

    throwOnError(error)
    const rows = (data ?? []) as WeddingExtraServiceRow[]
    if (rows.length === 0) return []

    const services = await extraServiceService.list()
    const byId = new Map(services.map((s) => [s.id, s]))

    return rows.map((row) =>
      mapRow(row, byId.get(row.extra_service_id)?.name),
    )
  },

  async add(input: AddWeddingExtraServiceInput): Promise<WeddingExtraService> {
    const service = await extraServiceService.get(input.extraServiceId)
    if (!service) throw new Error('Nie znaleziono usługi dodatkowej.')

    const priceSnapshot = input.priceSnapshot ?? service.price
    const quantity = input.quantity ?? 1

    const { data, error } = await supabase
      .from('wedding_extra_services')
      .insert({
        wedding_id: input.weddingId,
        extra_service_id: input.extraServiceId,
        price_snapshot: priceSnapshot,
        quantity,
      })
      .select('*')
      .single()

    throwOnError(error)
    return mapRow(data as WeddingExtraServiceRow, service.name)
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('wedding_extra_services')
      .delete()
      .eq('id', id)
    throwOnError(error)
  },

  async update(
    id: string,
    input: { quantity?: number; priceSnapshot?: number },
  ): Promise<WeddingExtraService> {
    const patch: Record<string, unknown> = {}
    if (input.quantity !== undefined) {
      if (input.quantity < 1) throw new Error('Ilość musi być co najmniej 1.')
      patch.quantity = input.quantity
    }
    if (input.priceSnapshot !== undefined) {
      if (input.priceSnapshot < 0) throw new Error('Cena nie może być ujemna.')
      patch.price_snapshot = input.priceSnapshot
    }

    const { data, error } = await supabase
      .from('wedding_extra_services')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    throwOnError(error)
    const row = data as WeddingExtraServiceRow
    const service = await extraServiceService.get(row.extra_service_id)
    return mapRow(row, service?.name)
  },

  /** Package snapshot + sum of extra snapshots. */
  totalFromSnapshots(
    packagePrice: number,
    extras: WeddingExtraService[],
  ): number {
    const extrasTotal = extras.reduce(
      (sum, e) => sum + e.priceSnapshot * e.quantity,
      0,
    )
    return packagePrice + extrasTotal
  },
}
