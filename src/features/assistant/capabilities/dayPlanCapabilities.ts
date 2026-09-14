/**
 * Next authoritative day-plan stage — uses operational order SoT only.
 * No wedding-custom inference.
 */

import { weddingOperationalTimesService } from '@/lib/api/weddingOperationalTimesService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingService } from '@/lib/api/weddingService'
import { PLAN_DNIA_STAGE_LABELS } from '@/features/prewedding/answerSummary'
import { buildOperationalDayStops } from '@/features/wedding-day/operationalDayPlan'
import { toWeddingCard } from '../tools/dto'
import { ASSISTANT_DAY_PLAN_SEQUENCE_END } from '../copy'

export type DayPlanStageRole =
  | 'bride_preparation'
  | 'groom_preparation'
  | 'ceremony'
  | 'reception'
  | 'preparations'

export type NextDayPlanStageResult =
  | {
      ok: true
      wedding: ReturnType<typeof toWeddingCard>
      fromRole: string
      next: {
        role: string
        title: string
        placeName: string | null
        address: string | null
        time: string | null
        placeId: string | null
      }
      provenance: ['get_next_day_plan_stage']
    }
  | {
      ok: false
      reason: 'wedding_not_found' | 'no_next' | 'stage_not_found'
      message: string
      provenance: ['get_next_day_plan_stage']
    }

function normalizeRole(role: string): string {
  return role === 'preparation' ? 'bride_preparation' : role
}

function matchesFromStage(
  stopRole: string,
  from: DayPlanStageRole,
  participantKey?: 'p1' | 'p2' | null,
): boolean {
  const role = normalizeRole(stopRole)
  if (from === 'ceremony') return role === 'ceremony'
  if (from === 'reception') return role === 'reception'
  if (from === 'bride_preparation') return role === 'bride_preparation'
  if (from === 'groom_preparation') return role === 'groom_preparation'
  if (from === 'preparations') {
    if (participantKey === 'p1') return role === 'bride_preparation'
    if (participantKey === 'p2') return role === 'groom_preparation'
    return role === 'bride_preparation' || role === 'groom_preparation'
  }
  return false
}

export async function getNextDayPlanStage(input: {
  weddingId: string
  fromStage: DayPlanStageRole
  participantKey?: 'p1' | 'p2' | null
}): Promise<NextDayPlanStageResult> {
  const wedding = await weddingService.getById(input.weddingId)
  if (!wedding) {
    return {
      ok: false,
      reason: 'wedding_not_found',
      message: 'Nie znalazłem takiego zlecenia na Twoim koncie.',
      provenance: ['get_next_day_plan_stage'],
    }
  }
  const places = await weddingPlaceService.listByWeddingId(input.weddingId)
  const times = await weddingOperationalTimesService.listByWeddingId(
    input.weddingId,
  )
  const stops = buildOperationalDayStops({
    studio: null,
    places,
    operationalTimes: times,
    weddingCeremonyTime: wedding.ceremonyTime,
  }).filter((s) => s.kind === 'wedding_place')

  if (stops.length === 0) {
    return {
      ok: false,
      reason: 'no_next',
      message: 'Plan dnia nie został jeszcze uzupełniony.',
      provenance: ['get_next_day_plan_stage'],
    }
  }

  let lastMatchIdx = -1
  for (let i = 0; i < stops.length; i++) {
    if (
      matchesFromStage(
        stops[i]!.role,
        input.fromStage,
        input.participantKey,
      )
    ) {
      lastMatchIdx = i
    }
  }

  if (lastMatchIdx < 0) {
    return {
      ok: false,
      reason: 'stage_not_found',
      message: 'Nie mam jeszcze tego etapu w planie dnia.',
      provenance: ['get_next_day_plan_stage'],
    }
  }

  const next = stops[lastMatchIdx + 1]
  if (!next) {
    return {
      ok: false,
      reason: 'no_next',
      message: ASSISTANT_DAY_PLAN_SEQUENCE_END,
      provenance: ['get_next_day_plan_stage'],
    }
  }

  const role = normalizeRole(next.role)
  return {
    ok: true,
    wedding: toWeddingCard(wedding),
    fromRole: input.fromStage,
    next: {
      role,
      title: PLAN_DNIA_STAGE_LABELS[role] ?? next.title,
      placeName: next.placeName ?? null,
      address: next.address ?? null,
      time: next.time,
      placeId: next.placeId ?? null,
    },
    provenance: ['get_next_day_plan_stage'],
  }
}
