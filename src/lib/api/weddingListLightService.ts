/**
 * Lightweight Weddings list (/sluby) first-paint reads.
 * NEVER calls full wedding hydrate / form-answer merge / notes / timeline / gallery.
 */

import { resolveStudioUserId } from '@/lib/api/studioUser'
import { paymentService } from '@/lib/api/paymentService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import {
  mapWeddingRowToModel,
  type WeddingRow,
} from '@/lib/api/weddings/weddingMappers'
import { applyWeddingPlaces } from '@/lib/api/weddings/weddingHydrate'
import { withDevPerf } from '@/lib/performance/devPerf'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import type { Wedding } from '@/types/wedding'

/**
 * Pinned columns for list/grid cards.
 * Includes commercial + coverage scalars used by WeddingCard / WeddingList.
 * Extends dashboard light with coverage_end_time.
 */
export const WEDDING_LIST_LIGHT_SELECT =
  'id, user_id, bride_name, groom_name, display_name, email, phone, wedding_date, ceremony_time, venue, status, workflow_stage, package_name, package_id, contract_value, deposit_amount, currency, accent_color, coverage_end_time, bride_preparation_location, groom_preparation_location, created_at, updated_at'

/**
 * Attach only what /sluby cards need beyond wedding scalars:
 * - payments → remaining / deposit chips
 * - wedding_places → venue label
 */
async function enrichWeddingList(weddings: Wedding[]): Promise<Wedding[]> {
  if (weddings.length === 0) return []
  const ids = weddings.map((w) => w.id)
  const [paymentsMap, placesMap] = await Promise.all([
    paymentService.listByWeddingIds(ids),
    weddingPlaceService.listByWeddingIds(ids),
  ])
  return weddings.map((wedding) => {
    const withPlaces = applyWeddingPlaces(
      wedding,
      placesMap.get(wedding.id) ?? [],
    )
    return {
      ...withPlaces,
      payments: paymentsMap.get(wedding.id) ?? [],
    }
  })
}

export const weddingListLightService = {
  /**
   * Light list for /sluby. Empty account → [] with ZERO inserts.
   */
  async listWeddingsForList(): Promise<Wedding[]> {
    return withDevPerf('weddingService.listForList', async () => {
      const userId = await resolveStudioUserId()
      const { data, error } = await supabase
        .from('weddings')
        .select(WEDDING_LIST_LIGHT_SELECT)
        .eq('user_id', userId)
        .order('wedding_date', { ascending: true, nullsFirst: false })

      throwOnError(error)
      const light = ((data ?? []) as WeddingRow[]).map(mapWeddingRowToModel)
      return enrichWeddingList(light)
    })
  },
}
