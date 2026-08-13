/**
 * Load Cockpit aggregates — parallel fetches, no forced route recalc, no PDF.
 */

import { buildWeddingDayCockpitData } from '@/features/wedding-day-cockpit/buildWeddingDayCockpitData'
import type { WeddingDayCockpitData } from '@/features/wedding-day-cockpit/types'
import { contactService } from '@/lib/api/contactService'
import { weddingQuestionnaireService } from '@/lib/api/preweddingQuestionnaireService'
import { travelService } from '@/lib/api/travelService'
import { weddingOperationalCompletionsService } from '@/lib/api/weddingOperationalCompletionsService'
import { weddingOperationalTimesService } from '@/lib/api/weddingOperationalTimesService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingService } from '@/lib/api/weddingService'
import type { TravelPlan } from '@/types/travel'

export async function loadWeddingDayCockpitData(
  weddingId: string,
): Promise<WeddingDayCockpitData> {
  const wedding = await weddingService.getById(weddingId)
  if (!wedding) {
    throw new Error('Nie znaleziono zlecenia lub brak dostępu.')
  }

  const [places, contacts, operationalTimes, completions, preQ, planRaw] =
    await Promise.all([
      weddingPlaceService.listByWeddingId(weddingId),
      contactService.listByWeddingId(weddingId),
      weddingOperationalTimesService.listByWeddingId(weddingId),
      weddingOperationalCompletionsService.listByWeddingId(weddingId),
      weddingQuestionnaireService.getByWeddingId(weddingId),
      travelService
        .getPlan(weddingId, {
          // Cache-first: do not force provider recalculation on Cockpit mount.
          forceRefresh: false,
        })
        .catch(
          (): TravelPlan => ({
            weddingId,
            studio: null,
            places: [],
            segments: [],
            hasError: true,
            errorMessage: 'Nie udało się wyliczyć trasy.',
            persistenceError: null,
          }),
        ),
    ])

  const plan: TravelPlan = {
    ...planRaw,
    places: [],
  }

  let preWedding: Parameters<typeof buildWeddingDayCockpitData>[0]['preWedding'] =
    null
  if (preQ) {
    const response = await weddingQuestionnaireService.getResponse(preQ.id)
    if (response?.answers && Object.keys(response.answers).length > 0) {
      preWedding = {
        title: preQ.title || 'Ankieta przedślubna',
        submittedAt: response.submittedAt ?? undefined,
        schema: preQ.schema,
        answers: response.answers as Record<string, unknown>,
      }
    }
  }

  return buildWeddingDayCockpitData({
    wedding,
    places,
    operationalTimes,
    completions,
    plan,
    contacts,
    preWedding,
  })
}
