/**
 * Drawer-scoped Next Action enrichment for Calendar.
 * Loads ONE wedding's detail + shared Overview query keys — never on first paint.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { buildWeddingDaySyncCandidates } from '@/features/prewedding/weddingDaySync'
import { operationalTimesQueryKey } from '@/features/wedding-day/queryKeys'
import { weddingService } from '@/lib/api/weddingService'
import { weddingOperationalTimesService } from '@/lib/api/weddingOperationalTimesService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingQuestionnaireService } from '@/lib/api/preweddingQuestionnaireService'
import {
  resolveWeddingNextAction,
  type WeddingNextAction,
} from '@/lib/workflow/resolveWeddingNextAction'
import {
  isPreWeddingSubmittedStatus,
  type PreWeddingAnswerValue,
  type WeddingQuestionnaire,
} from '@/types/preweddingQuestionnaire'
import type { QuestionnaireStatus } from '@/types/wedding'

const PREWEDDING_QUERY_KEY = 'prewedding-questionnaire'

function mapPreweddingStatus(
  q: WeddingQuestionnaire | null | undefined,
): QuestionnaireStatus | null | undefined {
  if (q === undefined) return undefined
  if (!q) return null
  if (isPreWeddingSubmittedStatus(q.status)) return 'completed'
  if (
    q.status === 'sent' ||
    q.status === 'opened' ||
    q.status === 'in_progress'
  ) {
    return 'sent'
  }
  return 'not_sent'
}

function ceremonyTimeFromAnswers(
  questionnaire: WeddingQuestionnaire,
  answers: Record<string, PreWeddingAnswerValue>,
): string | null {
  for (const section of questionnaire.schema.sections) {
    for (const question of section.questions) {
      if (question.weddingDayMapping !== 'ceremonyTime') continue
      const raw = answers[question.id]
      if (typeof raw === 'string' && raw.trim()) return raw.trim()
    }
  }
  return null
}

export type CalendarWeddingNextActionState = {
  /** Resolved only after hydrated wedding is ready — never from light list stub. */
  action: WeddingNextAction | null
  /** True while enrichment queries are in flight. */
  isLoading: boolean
  /** Quiet failure — drawer stays usable without CTA. */
  failed: boolean
}

/**
 * Enrich Next Action for a single open Calendar wedding drawer.
 * Reuses `['weddings', userId, id]`, places, prewedding, and operational-times keys.
 */
export function useCalendarWeddingNextAction(
  weddingId: string | null,
  enabled: boolean,
): CalendarWeddingNextActionState {
  const userId = useStudioAuthId()
  const active = Boolean(enabled && userId && weddingId)

  const weddingQuery = useQuery({
    queryKey: ['weddings', userId, weddingId],
    queryFn: () => weddingService.getById(weddingId!),
    enabled: active,
  })

  const placesQuery = useQuery({
    queryKey: ['wedding-places', userId, weddingId],
    queryFn: () => weddingPlaceService.listByWeddingId(weddingId!),
    enabled: active,
  })

  const questionnaireQuery = useQuery({
    queryKey: [PREWEDDING_QUERY_KEY, weddingId],
    queryFn: () => weddingQuestionnaireService.getByWeddingId(weddingId!),
    enabled: active,
  })

  const responseQuery = useQuery({
    queryKey: ['prewedding-response', questionnaireQuery.data?.id],
    queryFn: () =>
      questionnaireQuery.data
        ? weddingQuestionnaireService.getResponse(questionnaireQuery.data.id)
        : null,
    enabled: Boolean(
      active &&
        questionnaireQuery.data &&
        ['submitted', 'reopened', 'in_progress', 'opened'].includes(
          questionnaireQuery.data.status,
        ),
    ),
  })

  const operationalTimesQuery = useQuery({
    queryKey: operationalTimesQueryKey(userId, weddingId ?? ''),
    queryFn: () => weddingOperationalTimesService.listByWeddingId(weddingId!),
    enabled: active,
  })

  const answers = useMemo(
    () =>
      (responseQuery.data?.answers ?? {}) as Record<
        string,
        PreWeddingAnswerValue
      >,
    [responseQuery.data?.answers],
  )

  const wedding = weddingQuery.data ?? null
  const places = useMemo(
    () => placesQuery.data ?? [],
    [placesQuery.data],
  )
  const questionnaire = questionnaireQuery.data

  const applyCount = useMemo(() => {
    if (!wedding || !questionnaire || Object.keys(answers).length === 0) return 0
    if (!isPreWeddingSubmittedStatus(questionnaire.status)) return 0
    return buildWeddingDaySyncCandidates({
      questionnaire,
      answers,
      wedding,
      places,
      notes: [],
    }).length
  }, [questionnaire, answers, wedding, places])

  const enrichmentFailed =
    active &&
    (weddingQuery.isError ||
      placesQuery.isError ||
      questionnaireQuery.isError ||
      operationalTimesQuery.isError ||
      responseQuery.isError)

  const coreReady =
    Boolean(weddingQuery.isSuccess) &&
    Boolean(placesQuery.isSuccess) &&
    Boolean(questionnaireQuery.isSuccess) &&
    Boolean(operationalTimesQuery.isSuccess)

  const responseReady =
    !responseQuery.isEnabled ||
    responseQuery.isSuccess ||
    responseQuery.isFetched

  const enrichmentPending = active && !enrichmentFailed && !(coreReady && responseReady)

  // Correctness: do not resolve against light calendar stub (empty payments/contract/Q).
  const action =
    wedding && coreReady && responseReady && !enrichmentFailed
      ? resolveWeddingNextAction(wedding, {
          places,
          preweddingStatus: mapPreweddingStatus(questionnaire),
          canonicalApplyCandidateCount: applyCount,
          questionnaireCeremonyTime:
            questionnaire && Object.keys(answers).length > 0
              ? ceremonyTimeFromAnswers(questionnaire, answers)
              : null,
          operationalTimes: operationalTimesQuery.data ?? {},
        })
      : null

  return {
    action,
    isLoading: enrichmentPending,
    failed: Boolean(enrichmentFailed),
  }
}
