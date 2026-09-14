/**
 * Shared operational day-plan load path — same SoT as V3 get_wedding_places / get_wedding_day_plan.
 */

import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { buildOperationalDayStops } from '@/features/wedding-day/operationalDayPlan'
import { weddingService } from '@/lib/api/weddingService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingOperationalTimesService } from '@/lib/api/weddingOperationalTimesService'
import { PLAN_DNIA_STAGE_LABELS } from '@/features/prewedding/answerSummary'

export type OperationalPlaceSlotRole =
  | 'bride_preparation'
  | 'groom_preparation'
  | 'ceremony'
  | 'reception'

export type OperationalPlaceSlot = {
  role: OperationalPlaceSlotRole
  label: string
  name: string | null
  address: string | null
  time: string | null
  participantKey: 'p1' | 'p2' | null
}

export type OperationalWeddingDayLoad =
  | {
      status: 'ok'
      weddingId: string
      displayName: string
      slots: OperationalPlaceSlot[]
    }
  | { status: 'not_found' }
  | { status: 'error'; safeCode: string }

const SLOT_ROLES: OperationalPlaceSlotRole[] = [
  'bride_preparation',
  'groom_preparation',
  'ceremony',
  'reception',
]

/**
 * Load one owned wedding’s operational place/time slots.
 * Ownership: weddingService.getById + RLS. Never accepts ownerId/userId.
 */
export async function loadOperationalWeddingDay(
  weddingIdRaw: string,
): Promise<OperationalWeddingDayLoad> {
  try {
    const weddingId = weddingIdRaw.trim()
    if (!weddingId) return { status: 'not_found' }

    const wedding = await weddingService.getById(weddingId)
    if (!wedding) return { status: 'not_found' }

    const places = await weddingPlaceService.listByWeddingId(weddingId)
    const times = await weddingOperationalTimesService.listByWeddingId(weddingId)
    const stops = buildOperationalDayStops({
      studio: null,
      places,
      operationalTimes: times,
      weddingCeremonyTime: wedding.ceremonyTime,
    })

    const byRole = new Map<string, (typeof stops)[number]>()
    for (const stop of stops) {
      if (stop.kind !== 'wedding_place') continue
      const role =
        stop.role === 'preparation' ? 'bride_preparation' : stop.role
      if (!(SLOT_ROLES as readonly string[]).includes(role)) continue
      if (!byRole.has(role)) byRole.set(role, stop)
    }

    const slots: OperationalPlaceSlot[] = SLOT_ROLES.map((role) => {
      const stop = byRole.get(role)
      const participantKey =
        role === 'bride_preparation'
          ? 'p1'
          : role === 'groom_preparation'
            ? 'p2'
            : null
      return {
        role,
        label:
          PLAN_DNIA_STAGE_LABELS[role] ??
          (role === 'ceremony'
            ? 'Ceremonia'
            : role === 'reception'
              ? 'Przyjęcie'
              : 'Przygotowania'),
        name: stop?.placeName ?? null,
        address: stop?.address ?? null,
        time: stop?.time ?? null,
        participantKey,
      }
    })

    return {
      status: 'ok',
      weddingId: wedding.id,
      displayName: getWeddingDisplayName(wedding),
      slots,
    }
  } catch {
    return { status: 'error', safeCode: 'operational_day_load_failed' }
  }
}
