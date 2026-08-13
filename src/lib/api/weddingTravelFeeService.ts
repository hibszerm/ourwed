import { mapWeddingRowToModel, type WeddingRow } from '@/lib/api/weddings/weddingMappers'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import {
  getEffectiveTravelFeeAmount,
  isValidTravelFeeDraft,
  normalizeTravelFeeDecision,
  previewTravelFeeContractValue,
  type TravelFeeStatus,
} from '@/lib/utils/travelFeeCommercial'
import type { Wedding } from '@/types/wedding'

export interface ResolveWeddingTravelFeeInput {
  weddingId: string
  status: TravelFeeStatus
  amount: number
  freeKmSnapshot?: number | null
  routeDistanceMSnapshot?: number | null
  note?: string | null
}

/**
 * Canonical atomic travel-fee mutation.
 * Server recomputes contract_value from DB extras + previous travel.
 */
export const weddingTravelFeeService = {
  async resolve(input: ResolveWeddingTravelFeeInput): Promise<Wedding> {
    const normalized = normalizeTravelFeeDecision({
      status: input.status,
      amount: input.amount,
    })

    const { data, error } = await supabase.rpc('resolve_wedding_travel_fee', {
      p_wedding_id: input.weddingId,
      p_status: normalized.status,
      p_amount: normalized.amount,
      p_free_km_snapshot:
        input.freeKmSnapshot != null && Number.isFinite(input.freeKmSnapshot)
          ? input.freeKmSnapshot
          : null,
      p_route_distance_m_snapshot:
        input.routeDistanceMSnapshot != null &&
        Number.isFinite(input.routeDistanceMSnapshot)
          ? Math.round(input.routeDistanceMSnapshot)
          : null,
      p_note: input.note?.trim() || null,
    })
    throwOnError(error)
    if (!data) throw new Error('Nie udało się zapisać kosztu dojazdu.')
    return mapWeddingRowToModel(data as WeddingRow)
  },

  /**
   * Preview next contract value for UI drafts.
   * Returns null when charged amount is incomplete (does not throw).
   * Persist still goes through normalizeTravelFeeDecision in resolve().
   */
  previewContractValue(input: {
    wedding: Pick<
      Wedding,
      'price' | 'travelFeeStatus' | 'travelFeeAmount'
    >
    extrasTotal: number
    nextStatus: TravelFeeStatus
    nextAmount: number
  }): number | null {
    return previewTravelFeeContractValue({
      currentContractValue: input.wedding.price,
      extrasTotal: input.extrasTotal,
      previousEffectiveTravel: getEffectiveTravelFeeAmount(input.wedding),
      nextStatus: input.nextStatus,
      nextAmount: input.nextAmount,
    })
  },

  isDraftValid(input: {
    nextStatus: TravelFeeStatus
    nextAmount: number
  }): boolean {
    return isValidTravelFeeDraft({
      status: input.nextStatus,
      amount: input.nextAmount,
    })
  },
}
