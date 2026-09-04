import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { resolvePackageContractForWedding } from '@/features/documents/template/packageContractAssignment'
import { buildWeddingDaySyncCandidates } from '@/features/prewedding/weddingDaySync'
import { operationalTimesQueryKey } from '@/features/wedding-day/queryKeys'
import { weddingOperationalTimesService } from '@/lib/api/weddingOperationalTimesService'
import { weddingQuestionnaireService } from '@/lib/api/preweddingQuestionnaireService'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import {
  isPreWeddingSubmittedStatus,
  type PreWeddingAnswerValue,
  type WeddingQuestionnaire,
} from '@/types/preweddingQuestionnaire'
import type { WeddingPlace } from '@/types/travel'
import type { QuestionnaireStatus, Wedding } from '@/types/wedding'
import { resolveWeddingNextAction } from '@/lib/workflow/resolveWeddingNextAction'

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

/**
 * Reuses the same React Query keys as Classic Next Action / Plan dnia / contracts.
 * No new fetch architecture.
 */
export function useModernWeddingDetailContext(wedding: Wedding) {
  const userId = useStudioAuthId()

  const { data: places = [] } = useQuery({
    queryKey: ['wedding-places', userId, wedding.id],
    queryFn: () => weddingPlaceService.listByWeddingId(wedding.id),
    enabled: Boolean(userId && wedding.id),
  })

  const { data: questionnaire } = useQuery({
    queryKey: [PREWEDDING_QUERY_KEY, wedding.id],
    queryFn: () => weddingQuestionnaireService.getByWeddingId(wedding.id),
  })

  const { data: response } = useQuery({
    queryKey: ['prewedding-response', questionnaire?.id],
    queryFn: () =>
      questionnaire
        ? weddingQuestionnaireService.getResponse(questionnaire.id)
        : null,
    enabled: Boolean(
      questionnaire &&
        ['submitted', 'reopened', 'in_progress', 'opened'].includes(
          questionnaire.status,
        ),
    ),
  })

  const { data: operationalTimes = {} } = useQuery({
    queryKey: operationalTimesQueryKey(userId, wedding.id),
    queryFn: () => weddingOperationalTimesService.listByWeddingId(wedding.id),
    enabled: Boolean(userId && wedding.id),
  })

  const contractStatus = wedding.contract?.status ?? 'none'
  const { data: packageContract } = useQuery({
    queryKey: [
      'package-contract-for-wedding',
      wedding.id,
      wedding.packageId ?? null,
    ],
    queryFn: () =>
      resolvePackageContractForWedding({
        packageId: wedding.packageId,
        packageName: wedding.packageName,
      }),
    enabled: contractStatus === 'none',
    staleTime: 30_000,
  })

  const answers = useMemo(
    () => (response?.answers ?? {}) as Record<string, PreWeddingAnswerValue>,
    [response?.answers],
  )

  const applyCount = useMemo(() => {
    if (!questionnaire || Object.keys(answers).length === 0) return 0
    if (!isPreWeddingSubmittedStatus(questionnaire.status)) return 0
    return buildWeddingDaySyncCandidates({
      questionnaire,
      answers,
      wedding,
      places,
      notes: [],
    }).length
  }, [questionnaire, answers, wedding, places])

  const preStatus = mapPreweddingStatus(questionnaire)
  const questionnaireCeremonyTime =
    questionnaire && Object.keys(answers).length > 0
      ? ceremonyTimeFromAnswers(questionnaire, answers)
      : null

  const action = resolveWeddingNextAction(wedding, {
    places,
    preweddingStatus: preStatus,
    canonicalApplyCandidateCount: applyCount,
    questionnaireCeremonyTime,
    operationalTimes,
  })

  const missingTemplate =
    contractStatus === 'none' &&
    packageContract != null &&
    packageContract.status !== 'ok'

  return {
    places: places as WeddingPlace[],
    applyCount,
    preStatus,
    action,
    missingTemplate,
  }
}
