/**
 * Studio Attention V1 — bounded batch data path (derived, not persisted).
 *
 * Topology (constant request count; does not grow per wedding):
 *  1. weddings — active operational candidates (semantic scope)
 *  2. contracts listByWeddingIds
 *  3. payments listByWeddingIds
 *  4. places listByWeddingIds
 *  5. pre-wedding statuses listStatusByWeddingIds
 *  6–7. contract questionnaire statuses (forms + form_instances)
 *
 * No getWeddingDetail × N, no per-wedding payment/questionnaire loops,
 * no Apply counts.
 */

import {
  buildStudioAttentionItems,
  type StudioAttentionWeddingInput,
} from '@/features/dashboard/attention/buildStudioAttention'
import type { StudioAttentionItem } from '@/features/dashboard/attention/studioAttentionTypes'
import { contractService } from '@/lib/api/contractService'
import { listContractQuestionnaireStatusByWeddingIds } from '@/lib/api/forms'
import { paymentService } from '@/lib/api/paymentService'
import { weddingQuestionnaireService } from '@/lib/api/preweddingQuestionnaireService'
import { resolveStudioUserId } from '@/lib/api/studioUser'
import {
  mapWeddingRowToModel,
  type WeddingRow,
} from '@/lib/api/weddings/weddingMappers'
import { applyWeddingPlaces } from '@/lib/api/weddings/weddingHydrate'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { withDevPerf } from '@/lib/performance/devPerf'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'

/**
 * Minimum wedding columns for canonical Next Action + overdue helpers.
 * Not a full detail hydrate — no notes/timeline/gallery/form answers.
 */
export const STUDIO_ATTENTION_WEDDING_SELECT = [
  'id',
  'user_id',
  'bride_name',
  'groom_name',
  'display_name',
  'email',
  'phone',
  'groom_phone',
  'contract_address',
  'contract_postal_code',
  'contract_city',
  'wedding_date',
  'ceremony_time',
  'venue',
  'status',
  'workflow_stage',
  'package_name',
  'package_id',
  'contract_value',
  'deposit_amount',
  'currency',
  'accent_color',
  'bride_preparation_location',
  'groom_preparation_location',
  'travel_fee_status',
  'travel_fee_amount',
  'travel_fee_resolved_at',
  'travel_fee_free_km_snapshot',
  'travel_fee_route_distance_m_snapshot',
  'travel_fee_note',
  'final_payment_due_date',
  'final_payment_terms',
  'delivery_due_date',
  'delivery_due_source',
  'delivery_completed_at',
  'created_at',
  'updated_at',
].join(', ')

export type StudioAttentionTopology = {
  /** Semantic candidate wedding count after SQL scope. */
  candidateCount: number
  /** Ordered labels of logical batch steps (not per-wedding). */
  batchSteps: string[]
  /** Always 0 for V1 — guarded in acceptance tests. */
  perWeddingServiceCalls: number
}

export type StudioAttentionResult = {
  items: StudioAttentionItem[]
  topology: StudioAttentionTopology
}

/**
 * Operational candidate scope (documented for D2):
 * - status = active only (archived/cancelled history excluded)
 * - includes upcoming, undated, past-active commercial, overdue delivery/payment
 * - does not load archived completed history
 */
async function listAttentionCandidateRows(
  userId: string,
  _todayKey: string,
): Promise<{ rows: WeddingRow[]; batchSteps: string[] }> {
  void _todayKey
  const batchSteps: string[] = []

  const primary = await supabase
    .from('weddings')
    .select(STUDIO_ATTENTION_WEDDING_SELECT)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('wedding_date', { ascending: true, nullsFirst: false })

  throwOnError(primary.error)
  batchSteps.push('weddings.attention_candidates')

  const rows = ((primary.data ?? []) as unknown as WeddingRow[]).filter(
    (row) => Boolean(row?.id),
  )
  return { rows, batchSteps }
}

async function enrichAttentionInputs(
  rows: WeddingRow[],
  batchSteps: string[],
): Promise<StudioAttentionWeddingInput[]> {
  if (rows.length === 0) return []

  const light = rows.map(mapWeddingRowToModel)
  const ids = light.map((w) => w.id)

  const [
    contractsMap,
    paymentsMap,
    placesMap,
    preweddingMap,
    contractQMap,
  ] = await Promise.all([
    contractService.listByWeddingIds(ids),
    paymentService.listByWeddingIds(ids),
    weddingPlaceService.listByWeddingIds(ids),
    weddingQuestionnaireService.listStatusByWeddingIds(ids),
    listContractQuestionnaireStatusByWeddingIds(ids),
  ])

  batchSteps.push(
    'contracts.listByWeddingIds',
    'payments.listByWeddingIds',
    'places.listByWeddingIds',
    'prewedding.listStatusByWeddingIds',
    'forms.listContractQuestionnaireStatusByWeddingIds',
  )

  return light.map((wedding) => {
    const places = placesMap.get(wedding.id) ?? []
    const withPlaces = applyWeddingPlaces(wedding, places)
    return {
      wedding: {
        ...withPlaces,
        contract: contractsMap.get(wedding.id) ?? { status: 'none' },
        payments: paymentsMap.get(wedding.id) ?? [],
      },
      preweddingStatus: preweddingMap.get(wedding.id) ?? null,
      contractQuestionnaireStatus:
        contractQMap.get(wedding.id) ?? 'not_sent',
    }
  })
}

export const studioAttentionService = {
  /**
   * Derived Studio Attention V1 items (max 6 ranked). Never persists Attention.
   * Phone presentation shows at most 5 from the same result set.
   */
  async listStudioAttention(
    todayKey: string = localCalendarDateKey(),
  ): Promise<StudioAttentionResult> {
    return withDevPerf('dashboard.studioAttention', async () => {
      const userId = await resolveStudioUserId()
      const { rows, batchSteps } = await listAttentionCandidateRows(
        userId,
        todayKey,
      )
      const inputs = await enrichAttentionInputs(rows, batchSteps)
      const items = buildStudioAttentionItems(inputs, todayKey)
      return {
        items,
        topology: {
          candidateCount: rows.length,
          batchSteps,
          perWeddingServiceCalls: 0,
        },
      }
    })
  },
}
