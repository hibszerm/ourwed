/**
 * Load owned-wedding aggregates used by Brief generation and source hashing.
 * Ownership is enforced by weddingService.getById (RLS + user_id).
 * Does not load unused contract questionnaire dumps or wall-clock fields.
 */

import type { BuildWeddingBriefPdfDataInput } from '@/features/wedding-brief/buildWeddingBriefPdfData'
import {
  weddingQuestionnaireService,
} from '@/lib/api/preweddingQuestionnaireService'
import { sessionService } from '@/lib/api/sessionService'
import { weddingExtraServiceService } from '@/lib/api/weddingExtraServiceService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingOperationalTimesService } from '@/lib/api/weddingOperationalTimesService'
import { weddingService } from '@/lib/api/weddingService'
import { contactService } from '@/lib/api/contactService'
import { travelService } from '@/lib/api/travelService'

export async function loadWeddingBriefSourceSnapshot(
  weddingId: string,
): Promise<BuildWeddingBriefPdfDataInput> {
  const wedding = await weddingService.getById(weddingId)
  if (!wedding) {
    throw new Error('Nie znaleziono zlecenia lub brak dostępu.')
  }

  const [places, contacts, extras, sessions, preQ, operationalTimes, travelSegments] =
    await Promise.all([
      weddingPlaceService.listByWeddingId(weddingId),
      contactService.listByWeddingId(weddingId),
      weddingExtraServiceService.listByWeddingId(weddingId),
      sessionService.listByWeddingId(weddingId),
      weddingQuestionnaireService.getByWeddingId(weddingId),
      weddingOperationalTimesService.listByWeddingId(weddingId),
      travelService.listCachedSegments(weddingId),
    ])

  let preWedding: BuildWeddingBriefPdfDataInput['preWedding'] = null
  if (preQ) {
    const response = await weddingQuestionnaireService.getResponse(preQ.id)
    if (response?.answers && Object.keys(response.answers).length > 0) {
      preWedding = {
        schema: preQ.schema,
        answers: response.answers as Record<string, unknown>,
      }
    }
  }

  return {
    wedding,
    places,
    contacts,
    extras,
    sessions,
    preWedding,
    operationalTimes,
    travelSegments,
  }
}
