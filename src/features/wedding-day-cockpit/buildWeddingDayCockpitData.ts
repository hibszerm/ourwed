/**
 * Pure Cockpit DTO builder — projects canonical operational day + brief slices.
 */

import { timelineTimesByRole } from '@/features/prewedding/answerSummary'
import { buildWeddingBriefPdfData } from '@/features/wedding-brief/buildWeddingBriefPdfData'
import type { BriefNote } from '@/features/wedding-brief/types'
import { buildTravelFlow, type TravelFlowLeg } from '@/features/travel/travelUi'
import { getOperationalOrderedPlaces } from '@/features/travel/weddingDayRouteStops'
import {
  buildOperationalDayStops,
  STUDIO_STOP_KEY,
  type OperationalTimeMap,
} from '@/features/wedding-day/operationalDayPlan'
import type { OperationalCompletionMap } from '@/lib/api/weddingOperationalCompletionsService'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getWeddingDateLabel } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import { formatCurrency } from '@/lib/utils/currency'
import { formatTravelFeeDisplay } from '@/lib/utils/travelFeeCommercial'
import type { StudioTravelSettings, TravelPlan, WeddingPlace } from '@/types/travel'
import type { Wedding, WeddingContact } from '@/types/wedding'
import type { PreWeddingTemplateSchema } from '@/types/preweddingQuestionnaire'
import type {
  CockpitRouteLeg,
  CockpitStop,
  WeddingDayCockpitData,
} from '@/features/wedding-day-cockpit/types'

export type BuildWeddingDayCockpitInput = {
  wedding: Wedding
  places: WeddingPlace[]
  operationalTimes: OperationalTimeMap
  completions: OperationalCompletionMap
  plan: TravelPlan | null
  contacts: WeddingContact[]
  preWedding: {
    title: string
    submittedAt?: string
    schema: PreWeddingTemplateSchema
    answers: Record<string, unknown>
  } | null
}

function legToCockpit(leg: TravelFlowLeg | null, stale: boolean): CockpitRouteLeg {
  if (stale) {
    return { durationText: null, distanceText: null, status: 'stale' }
  }
  if (!leg) {
    return { durationText: null, distanceText: null, status: 'missing' }
  }
  const seg = leg.segment
  if (seg?.status === 'ok' && (seg.durationText || seg.distanceText)) {
    return {
      durationText: seg.durationText,
      distanceText: seg.distanceText,
      status: 'ok',
    }
  }
  if (seg?.status === 'error' || leg.failureReason === 'provider_error') {
    return { durationText: null, distanceText: null, status: 'error' }
  }
  return { durationText: null, distanceText: null, status: 'missing' }
}

function findIncomingLeg(
  flowLegs: TravelFlowLeg[],
  toKey: string,
): TravelFlowLeg | null {
  return flowLegs.find((l) => l.destination.key === toKey) ?? null
}

function phoneForRole(
  role: string,
  contacts: Array<{ role: string; phone?: string }>,
): string | null {
  const want =
    role === 'bride_preparation' || role === 'preparation'
      ? 'Panna Młoda'
      : role === 'groom_preparation'
        ? 'Pan Młody'
        : null
  if (!want) return null
  const hit = contacts.find(
    (c) => c.role === want && Boolean(c.phone?.trim()),
  )
  return hit?.phone?.trim() || null
}

/**
 * Next actionable stop = first incomplete wedding_place.
 * Studio appears on the full plan/route but is not the “next job” hero.
 */
export function selectHeroStopKey(
  stops: Array<Pick<CockpitStop, 'key' | 'actionable' | 'completed'>>,
): { heroStopKey: string | null; dayComplete: boolean } {
  const actionable = stops.filter((s) => s.actionable)
  if (actionable.length === 0) {
    return { heroStopKey: null, dayComplete: false }
  }
  const next = actionable.find((s) => !s.completed)
  if (!next) {
    return { heroStopKey: null, dayComplete: true }
  }
  return { heroStopKey: next.key, dayComplete: false }
}

export function buildWeddingDayCockpitData(
  input: BuildWeddingDayCockpitInput,
): WeddingDayCockpitData {
  const {
    wedding,
    places,
    operationalTimes,
    completions,
    plan,
    contacts,
    preWedding,
  } = input

  const questionnaireTimes = preWedding
    ? timelineTimesByRole(preWedding.schema, preWedding.answers)
    : {}

  const studio: StudioTravelSettings | null = plan?.studio ?? null
  const orderedPlaceIds = getOperationalOrderedPlaces(places).map((p) => p.id)
  const opsStops = buildOperationalDayStops({
    studio,
    places,
    operationalTimes,
    questionnaireTimes,
    weddingCeremonyTime: wedding.ceremonyTime,
  })

  const routeStale = Boolean(plan?.routeStale)

  const flow =
    plan && orderedPlaceIds.length > 0
      ? buildTravelFlow(
          {
            ...plan,
            places: [],
            routeStale,
          },
          { places, orderedPlaceIds },
        )
      : null

  const brief = buildWeddingBriefPdfData({
    wedding,
    places,
    contacts,
    extras: [],
    sessions: [],
    preWedding,
    contractAnswers: null,
    operationalTimes,
  })

  const briefContacts = brief.contacts
  const criticalNotes: BriefNote[] = brief.criticalNotes

  const commercial = getWeddingCommercialSummary(wedding)
  const travelStatus = wedding.travelFeeStatus ?? 'unresolved'
  const travelFeeLabel =
    travelStatus === 'unresolved'
      ? null
      : formatTravelFeeDisplay(wedding, formatCurrency)
  const settlement =
    commercial.contractValue > 0 || (wedding.payments?.length ?? 0) > 0
      ? {
          contractValue: commercial.contractValue,
          totalPaid: commercial.totalPaid,
          remainingToPay: commercial.remainingToPay,
          currency: commercial.currency || 'PLN',
          settled:
            commercial.remainingToPay <= 0 && commercial.contractValue > 0,
          travelFeeLabel,
        }
      : null

  const stops: CockpitStop[] = opsStops.map((stop) => {
    const actionable = stop.kind === 'wedding_place'
    const completed = Boolean(completions[stop.key])
    const incoming =
      stop.key === STUDIO_STOP_KEY
        ? null
        : legToCockpit(
            flow ? findIncomingLeg(flow.routeLegs, stop.key) : null,
            routeStale,
          )
    return {
      key: stop.key,
      kind: stop.kind,
      role: stop.role,
      title: stop.title,
      placeName: stop.placeName,
      address: stop.address,
      time: stop.time,
      latitude: stop.latitude,
      longitude: stop.longitude,
      placeId: stop.placeId,
      actionable,
      completed,
      incomingLeg: incoming,
      phone: phoneForRole(stop.role, briefContacts),
    }
  })

  const { heroStopKey, dayComplete } = selectHeroStopKey(stops)

  let routeStatus: WeddingDayCockpitData['routeStatus'] = 'idle'
  if (routeStale && places.length > 0) routeStatus = 'loading'
  else if (plan?.hasError) routeStatus = 'error'

  return {
    weddingId: wedding.id,
    displayName: getWeddingDisplayName(wedding),
    dateLabel: getWeddingDateLabel(wedding.date),
    packageName: wedding.packageName?.trim() || null,
    stops,
    heroStopKey,
    dayComplete,
    criticalNotes,
    contacts: briefContacts.filter((c) =>
      Boolean(c.phone?.trim() || c.name?.trim()),
    ),
    settlement,
    routeStatus,
    routeFingerprint: plan?.routeFingerprint ?? null,
  }
}
