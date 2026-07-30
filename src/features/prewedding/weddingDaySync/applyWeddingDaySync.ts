/**
 * Apply approved Pre-Wedding sync candidates to canonical Wedding data.
 */

import type { QueryClient } from '@tanstack/react-query'
import type { WeddingDaySyncCandidate } from '@/features/prewedding/weddingDaySync/buildCandidates'
import {
  isLocationMappingKey,
  LOCATION_MAPPING_TO_ROLE,
} from '@/features/prewedding/weddingDaySync/mappingCatalog'
import {
  mergeLocationAnswerWithExisting,
  normalizeLocationAnswer,
} from '@/features/travel/weddingLocationModel'
import { noteService } from '@/lib/api/noteService'
import { timelineEventService } from '@/lib/api/timelineEventService'
import { travelService } from '@/lib/api/travelService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingService } from '@/lib/api/weddingService'
import type { PreWeddingAnswerValue } from '@/types/preweddingQuestionnaire'
import type { Wedding } from '@/types/wedding'

export type ApplyWeddingDaySyncResult = {
  wedding: Wedding
  routeNeedsRecalculation: boolean
  appliedLabels: string[]
}

function noteTitleForMapping(_mapping: string, label: string): string {
  return `Ankieta: ${label}`
}

async function applyLocationCandidate(
  weddingId: string,
  candidate: WeddingDaySyncCandidate,
  answers: Record<string, PreWeddingAnswerValue>,
): Promise<boolean> {
  if (!isLocationMappingKey(candidate.mapping)) return false
  if (candidate.incomingPoorer) {
    throw new Error(
      `Nie można zastąpić zweryfikowanej lokalizacji („${candidate.label}”) uboższymi danymi z ankiety.`,
    )
  }

  const role = LOCATION_MAPPING_TO_ROLE[candidate.mapping]
  const raw = answers[candidate.questionId] ?? candidate.rawAnswer
  const incoming = normalizeLocationAnswer(raw)
  if (!incoming.name && !incoming.formattedAddress) {
    throw new Error(`Brak poprawnego adresu dla: ${candidate.label}`)
  }

  const existing = await weddingPlaceService.getByRole(weddingId, role)
  const geo = mergeLocationAnswerWithExisting(incoming, existing)
  if (!geo.formattedAddress?.trim() && !geo.label?.trim()) {
    throw new Error(`Brak poprawnego adresu dla: ${candidate.label}`)
  }

  await weddingPlaceService.upsert({
    weddingId,
    role,
    addressText: geo.formattedAddress,
    place: geo,
    resolve: Boolean(
      geo.formattedAddress?.trim() &&
        (geo.latitude == null || geo.longitude == null) &&
        !geo.placeId,
    ),
  })
  return true
}

function applyScalarToWedding(
  wedding: Wedding,
  candidate: WeddingDaySyncCandidate,
): Wedding {
  const value = candidate.proposedDisplay.trim()
  switch (candidate.mapping) {
    case 'weddingDate':
      return { ...wedding, date: value.slice(0, 10) }
    case 'brideName':
      return {
        ...wedding,
        couple: { ...wedding.couple, partner1: value },
      }
    case 'groomName':
      return {
        ...wedding,
        couple: { ...wedding.couple, partner2: value },
      }
    case 'bridePhone':
      return {
        ...wedding,
        couple: {
          ...wedding.couple,
          partner1Phone: value,
          phone: value,
        },
      }
    case 'groomPhone':
      return {
        ...wedding,
        couple: { ...wedding.couple, partner2Phone: value },
      }
    case 'ceremonyTime':
      return { ...wedding, ceremonyTime: value }
    case 'bridePreparationLocation':
      return {
        ...wedding,
        bridePreparationLocation: value,
        preparationLocation: value,
      }
    case 'groomPreparationLocation':
      return { ...wedding, groomPreparationLocation: value }
    case 'ceremonyLocation':
      return { ...wedding, ceremonyLocation: value }
    case 'receptionVenue':
      return { ...wedding, receptionLocation: value }
    default:
      return wedding
  }
}

const NOTE_MAPPINGS = new Set([
  'ceremonyNotes',
  'sensitiveFamilyNotes',
  'photoVideoPriorities',
  'blessingPlan',
  'groupPhotoPlan',
  'guestWishesPlan',
  'groomDepartureNote',
  'smallGroupPhotosPlan',
  'djBandProvider',
  'guestCount',
  'departureToCeremonyTime',
  'receptionArrivalTime',
])

export async function applyWeddingDaySyncCandidates(input: {
  weddingId: string
  wedding: Wedding
  candidates: WeddingDaySyncCandidate[]
  answers: Record<string, PreWeddingAnswerValue>
  queryClient?: QueryClient
}): Promise<ApplyWeddingDaySyncResult> {
  const { weddingId, candidates, answers, queryClient } = input
  if (candidates.length === 0) {
    return {
      wedding: input.wedding,
      routeNeedsRecalculation: false,
      appliedLabels: [],
    }
  }

  const owned = await weddingService.getById(weddingId)
  if (!owned) {
    throw new Error('Nie znaleziono zlecenia lub brak dostępu.')
  }

  let next = { ...owned }
  let routeNeedsRecalculation = false
  const appliedLabels: string[] = []

  for (const candidate of candidates) {
    if (isLocationMappingKey(candidate.mapping)) {
      await applyLocationCandidate(weddingId, candidate, answers)
      next = applyScalarToWedding(next, candidate)
      routeNeedsRecalculation = true
      appliedLabels.push(candidate.label)
      continue
    }

    if (
      candidate.mapping === 'weddingDate' ||
      candidate.mapping === 'brideName' ||
      candidate.mapping === 'groomName' ||
      candidate.mapping === 'bridePhone' ||
      candidate.mapping === 'groomPhone' ||
      candidate.mapping === 'ceremonyTime'
    ) {
      next = applyScalarToWedding(next, candidate)
      appliedLabels.push(candidate.label)
      continue
    }

    if (NOTE_MAPPINGS.has(candidate.mapping)) {
      const content = `${noteTitleForMapping(candidate.mapping, candidate.label)}\n${candidate.proposedDisplay}`
      const existing = await noteService.listByWeddingId(weddingId)
      const already = existing.some(
        (n) =>
          n.content.includes(noteTitleForMapping(candidate.mapping, candidate.label)) &&
          n.content.includes(candidate.proposedDisplay),
      )
      if (!already) {
        await noteService.create({
          weddingId,
          content,
          author: 'Studio',
          pinned: candidate.mapping === 'sensitiveFamilyNotes',
        })
      }
      appliedLabels.push(candidate.label)
    }
  }

  next = await weddingService.update(next)

  if (routeNeedsRecalculation) {
    await travelService.invalidate(weddingId)
    try {
      await travelService.recalculate(weddingId, { forceRefresh: true })
    } catch (err) {
      console.warn(
        '[weddingDaySync] route recalculation failed:',
        err instanceof Error ? err.message : err,
      )
      // Leave invalidated — UI can show “Przelicz trasę”.
    }
  }

  await timelineEventService.create({
    weddingId,
    type: 'questionnaire_completed',
    title: 'Zastosowano dane z ankiety przedślubnej.',
    description:
      appliedLabels.length === 1
        ? `Zaktualizowano: ${appliedLabels[0]}.`
        : `Zaktualizowano ${appliedLabels.length} pól: ${appliedLabels.join(', ')}.`,
    systemGenerated: true,
  })

  if (queryClient) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['wedding-places'] }),
      queryClient.invalidateQueries({ queryKey: ['travel-plan'] }),
      queryClient.invalidateQueries({ queryKey: ['weddings'] }),
      queryClient.invalidateQueries({ queryKey: ['wedding', weddingId] }),
      queryClient.invalidateQueries({ queryKey: ['timeline', weddingId] }),
      queryClient.invalidateQueries({ queryKey: ['notes'] }),
      queryClient.invalidateQueries({ queryKey: ['prewedding-questionnaire', weddingId] }),
    ])
  }

  const refreshed = (await weddingService.getById(weddingId)) ?? next
  return {
    wedding: refreshed,
    routeNeedsRecalculation,
    appliedLabels,
  }
}
