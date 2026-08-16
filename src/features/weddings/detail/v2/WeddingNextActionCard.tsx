/**
 * Overview "Następny krok" — shared resolveWeddingNextAction surface.
 * Progress checklist stays separate; Attention stays separate.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { buildWeddingDaySyncCandidates } from '@/features/prewedding/weddingDaySync'
import {
  dispatchWeddingNextAction,
  type WeddingNextActionHandlers,
} from '@/features/weddings/detail/v2/dispatchWeddingNextAction'
import { operationalTimesQueryKey } from '@/features/wedding-day/queryKeys'
import { resolveWeddingNextAction } from '@/lib/workflow/resolveWeddingNextAction'
import { weddingOperationalTimesService } from '@/lib/api/weddingOperationalTimesService'
import { weddingQuestionnaireService } from '@/lib/api/preweddingQuestionnaireService'
import {
  isPreWeddingSubmittedStatus,
  type PreWeddingAnswerValue,
  type WeddingQuestionnaire,
} from '@/types/preweddingQuestionnaire'
import type { WeddingPlace } from '@/types/travel'
import type { QuestionnaireStatus, Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

const PREWEDDING_QUERY_KEY = 'prewedding-questionnaire'

interface Props {
  wedding: Wedding
  places: WeddingPlace[]
  handlers: WeddingNextActionHandlers
}

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
 * Primary Next Action for Overview.
 * Reuses Ankieta / Plan dnia React Query keys — no separate fetch architecture.
 */
export function WeddingNextActionCard({ wedding, places, handlers }: Props) {
  const userId = useStudioAuthId()

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

  /** Same key as Plan dnia / Cockpit — picks up manual ops ceremony time saves. */
  const { data: operationalTimes = {} } = useQuery({
    queryKey: operationalTimesQueryKey(userId, wedding.id),
    queryFn: () => weddingOperationalTimesService.listByWeddingId(wedding.id),
    enabled: Boolean(userId && wedding.id),
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

  if (!action) return null

  return (
    <section
      className={styles.nextActionCard}
      aria-labelledby="wedding-next-action-title"
      data-testid="wedding-next-action"
    >
      <div className={styles.nextActionHeader}>
        <h2 id="wedding-next-action-title" className={styles.sectionHeading}>
          Następny krok
        </h2>
      </div>
      <p className={styles.nextActionTitle} data-testid="wedding-next-action-title-text">
        {action.title}
      </p>
      {action.description ? (
        <p className={styles.nextActionDescription}>{action.description}</p>
      ) : null}
      <div className={styles.nextActionCta}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          data-testid="wedding-next-action-cta"
          data-action-id={action.id}
          onClick={() => dispatchWeddingNextAction(action, handlers)}
        >
          {action.title}
        </Button>
      </div>
    </section>
  )
}
