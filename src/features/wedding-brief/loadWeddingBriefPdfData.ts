/**
 * Load aggregates needed to build Wedding Brief PDF for an owned wedding.
 * Ownership is enforced by weddingService.getById (RLS + user_id).
 */

import { buildWeddingBriefPdfData } from '@/features/wedding-brief/buildWeddingBriefPdfData'
import type { WeddingBriefPdfData } from '@/features/wedding-brief/types'
import { getLatestSubmittedFormAnswerRecord } from '@/lib/api/forms'
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

export async function loadWeddingBriefPdfData(
  weddingId: string,
): Promise<WeddingBriefPdfData> {
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

  let preWedding: Parameters<typeof buildWeddingBriefPdfData>[0]['preWedding'] =
    null
  if (preQ) {
    const response = await weddingQuestionnaireService.getResponse(preQ.id)
    if (response?.answers && Object.keys(response.answers).length > 0) {
      preWedding = {
        title: preQ.title || 'Ankieta przedślubna',
        submittedAt: response.submittedAt,
        schema: preQ.schema,
        answers: response.answers as Record<string, unknown>,
      }
    }
  }

  const contractRecord = await getLatestSubmittedFormAnswerRecord(
    weddingId,
    'contract',
  )
  const contractAnswers = contractRecord
    ? {
        answerJson: contractRecord.answerJson,
        optionsSnapshot: contractRecord.optionsSnapshot ?? null,
      }
    : null

  return buildWeddingBriefPdfData({
    wedding,
    places,
    contacts,
    extras,
    sessions,
    preWedding,
    contractAnswers,
    operationalTimes,
    travelSegments,
  })
}
