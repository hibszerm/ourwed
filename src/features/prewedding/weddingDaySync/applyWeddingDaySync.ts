/**
 * Apply approved Pre-Wedding sync candidates to canonical Wedding data.
 * Note-only / descriptive mappings are ignored (Brief / Day Plan only).
 */

import type { QueryClient } from '@tanstack/react-query'
import type { WeddingDaySyncCandidate } from '@/features/prewedding/weddingDaySync/buildCandidates'
import {
  CANONICAL_WEDDING_DAY_MAPPINGS,
  isLocationMappingKey,
  LOCATION_MAPPING_TO_ROLE,
} from '@/features/prewedding/weddingDaySync/mappingCatalog'
import {
  mergeLocationAnswerWithExisting,
  normalizeLocationAnswer,
} from '@/features/travel/weddingLocationModel'
import { persistWeddingContractAnswerFields } from '@/lib/forms/persistWeddingContractAnswers'
import { splitPersonName } from '@/lib/api/weddings/weddingMappers'
import { timelineEventService } from '@/lib/api/timelineEventService'
import { travelService } from '@/lib/api/travelService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingService } from '@/lib/api/weddingService'
import type { PreWeddingAnswerValue } from '@/types/preweddingQuestionnaire'
import type { Wedding } from '@/types/wedding'
import { devWarnArgs } from '@/lib/debug/devConsole'

export type ApplyWeddingDaySyncResult = {
  wedding: Wedding
  routeNeedsRecalculation: boolean
  appliedLabels: string[]
}

const COUPLE_DETAIL_MAPPINGS = new Set([
  'brideName',
  'groomName',
  'bridePhone',
  'groomPhone',
])

async function applyLocationCandidate(
  weddingId: string,
  candidate: WeddingDaySyncCandidate,
  answers: Record<string, PreWeddingAnswerValue>,
): Promise<boolean> {
  if (!isLocationMappingKey(candidate.mapping)) return false

  const role = LOCATION_MAPPING_TO_ROLE[candidate.mapping]
  const raw = answers[candidate.questionId] ?? candidate.rawAnswer
  const incoming = normalizeLocationAnswer(raw)
  if (!incoming.name && !incoming.formattedAddress) {
    throw new Error(`Brak poprawnego adresu dla: ${candidate.label}`)
  }

  // Explicit Apply is a full replacement from the questionnaire answer.
  // Never inherit placeId / coordinates / provider from the previous place —
  // that would create a corrupt hybrid (new text + old geo).
  // Pass null existing so merge uses only candidate-owned fields.
  const geo = mergeLocationAnswerWithExisting(incoming, null)
  if (!geo.formattedAddress?.trim() && !geo.label?.trim()) {
    throw new Error(`Brak poprawnego adresu dla: ${candidate.label}`)
  }

  // Match free-text location editor: persist as given, no geocode invent.
  // Manual / unverified answers stay manual until the studio verifies them.
  await weddingPlaceService.upsert({
    weddingId,
    role,
    addressText: geo.formattedAddress,
    place: geo,
    resolve: false,
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
    case 'brideName': {
      const split = splitPersonName(value)
      return {
        ...wedding,
        couple: {
          ...wedding.couple,
          partner1: value,
          partner1FirstName: split.first || undefined,
          partner1LastName: split.last || undefined,
        },
      }
    }
    case 'groomName': {
      const split = splitPersonName(value)
      return {
        ...wedding,
        couple: {
          ...wedding.couple,
          partner2: value,
          partner2FirstName: split.first || undefined,
          partner2LastName: split.last || undefined,
        },
      }
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

export async function applyWeddingDaySyncCandidates(input: {
  weddingId: string
  wedding: Wedding
  candidates: WeddingDaySyncCandidate[]
  answers: Record<string, PreWeddingAnswerValue>
  queryClient?: QueryClient
}): Promise<ApplyWeddingDaySyncResult> {
  const { weddingId, candidates, answers, queryClient } = input
  const canonical = candidates.filter((c) =>
    CANONICAL_WEDDING_DAY_MAPPINGS.has(c.mapping),
  )
  if (canonical.length === 0) {
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
  let coupleDetailsChanged = false
  const appliedLabels: string[] = []

  for (const candidate of canonical) {
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
      if (COUPLE_DETAIL_MAPPINGS.has(candidate.mapping)) {
        coupleDetailsChanged = true
      }
    }
    // Non-canonical mappings (notes-only legacy) are never applied here.
  }

  if (appliedLabels.length === 0) {
    return {
      wedding: owned,
      routeNeedsRecalculation: false,
      appliedLabels: [],
    }
  }

  // Persist couple detail from the post-Apply model BEFORE hydrate can mix in
  // partial/placeholder form_answers (e.g. lastName-only → "— nowakowski").
  const coupleSnapshot = next

  next = await weddingService.update(next, { hydrate: false })

  if (coupleDetailsChanged) {
    await persistWeddingContractAnswerFields(coupleSnapshot)
    next = (await weddingService.getById(weddingId)) ?? next
  } else {
    next = (await weddingService.getById(weddingId)) ?? next
  }

  if (routeNeedsRecalculation) {
    await travelService.invalidate(weddingId)
    try {
      await travelService.recalculate(weddingId, { forceRefresh: true })
    } catch (err) {
      devWarnArgs(
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
