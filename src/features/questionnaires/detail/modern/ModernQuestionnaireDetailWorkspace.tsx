import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { IconArrowLeft } from '@/components/icons'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { invalidateFinanceQueries } from '@/features/finance/invalidateFinanceQueries'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import {
  isProAccessRequiredError,
  toProAccessUserMessage,
} from '@/features/billing/proAccessError'
import { ModernQuestionnaireResponseSections } from '@/features/questionnaires/detail/modern/ModernQuestionnaireResponseSections'
import {
  DETAIL_COPY_LINK,
  DETAIL_CREATED,
  DETAIL_CREATE_BUSY,
  DETAIL_CREATE_WEDDING,
  DETAIL_EMPTY_ANSWERS,
  DETAIL_ERROR_RETRY,
  DETAIL_FALLBACK_TITLE,
  DETAIL_LINKED_WEDDING,
  DETAIL_NO_ANSWERS,
  DETAIL_NOT_FOUND_COPY,
  DETAIL_NOT_FOUND_TITLE,
  DETAIL_OPEN_FORM,
  DETAIL_OPEN_WEDDING,
  DETAIL_SKELETON_SECTIONS,
  DETAIL_SUBMITTED,
  resolveQuestionnaireDetailBack,
} from '@/features/questionnaires/detail/modern/questionnaireDetailCopy'
import { formatPendingSubmittedAt } from '@/features/questionnaires/pending/modern/formatPendingSubmittedAt'
import {
  QUESTIONNAIRE_STATUS_LABELS,
  questionnaireService,
  type QuestionnaireSearchFields,
} from '@/lib/api/questionnaireService'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import styles from './ModernQuestionnaireDetailWorkspace.module.css'

function coupleTitle(search: QuestionnaireSearchFields): string {
  const bride = search.bride.trim()
  const groom = search.groom.trim()
  if (bride && groom) return `${bride} i ${groom}`
  return bride || groom
}

function contextLine(parts: Array<string | null | undefined>): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(' · ')
}

function DetailBackLink({
  to,
  label,
}: {
  to: string
  label: string
}) {
  return (
    <Link to={to} className={styles.back}>
      <IconArrowLeft width={16} height={16} aria-hidden />
      {label}
    </Link>
  )
}

export function ModernQuestionnaireDetailWorkspace() {
  const { id = '' } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const { requirePro, openUpgradeDialog } = useProAccessGate()
  const [approving, setApproving] = useState(false)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['questionnaires', userId, id],
    queryFn: () => questionnaireService.getById(id),
    enabled: Boolean(userId && id),
  })

  const answersQuery = useQuery({
    queryKey: ['questionnaires', userId, id, 'answers'],
    queryFn: () => questionnaireService.getAnswers(id),
    enabled: Boolean(userId && id) && Boolean(data),
  })

  async function handleApprove() {
    if (!data) return
    if (!requirePro(undefined, { actionKey: 'apply_questionnaire_responses' })) {
      return
    }
    if (approving) return
    setApproving(true)
    try {
      const { wedding } = await questionnaireService.approve(data.instance.id)
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pending-questionnaires'] }),
        queryClient.invalidateQueries({ queryKey: ['questionnaires'] }),
        queryClient.invalidateQueries({ queryKey: ['weddings'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        invalidateFinanceQueries(queryClient),
      ]).catch(() => {
        /* non-blocking */
      })
      navigate(`/sluby/${wedding.id}`)
    } catch (err) {
      if (isProAccessRequiredError(err)) {
        openUpgradeDialog('pro_required_action', 'apply_questionnaire_responses')
        window.alert(toProAccessUserMessage())
        return
      }
      window.alert(getUserFacingErrorMessage(err, 'Nie udało się zatwierdzić.'))
    } finally {
      setApproving(false)
    }
  }

  async function copyLink() {
    if (!data) return
    await navigator.clipboard.writeText(data.formUrl)
  }

  const back = resolveQuestionnaireDetailBack(
    (location.state as { from?: unknown } | null)?.from,
  )

  const waitingForResponseRecord =
    data != null &&
    answersQuery.isPending &&
    (data.instance.status === 'submitted' || data.instance.status === 'approved')

  if (isLoading || waitingForResponseRecord) {
    return (
      <div
        className={styles.page}
        data-testid="questionnaire-detail-modern"
        aria-busy="true"
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            <DetailBackLink to={back.to} label={back.label} />
            <span className={styles.skeletonTitle} />
            <span className={styles.skeletonMeta} />
          </div>
        </header>
        <div
          className={styles.recordWrap}
          aria-hidden
          data-testid="questionnaire-detail-loading"
        >
          <div className={styles.surface}>
            {Array.from({ length: DETAIL_SKELETON_SECTIONS }, (_, index) => (
              <div key={index} className={styles.skeletonSection}>
                <span className={styles.skeletonSectionTitle} />
                <span className={styles.skeletonFact} />
                <span className={styles.skeletonFactWide} />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className={styles.page} data-testid="questionnaire-detail-modern">
        <header className={styles.header}>
          <div className={styles.heading}>
            <DetailBackLink to={back.to} label={back.label} />
            <h1 className={styles.pageTitle}>{DETAIL_FALLBACK_TITLE}</h1>
          </div>
        </header>
        <div className={styles.recordWrap} data-testid="questionnaire-detail-error">
          <div className={styles.surface}>
            <div className={styles.empty}>
              <h2 className={styles.emptyTitle}>{DETAIL_NOT_FOUND_TITLE}</h2>
              <p className={styles.emptyDesc}>
                {getUserFacingErrorMessage(error, DETAIL_NOT_FOUND_COPY)}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void refetch()}
              >
                {DETAIL_ERROR_RETRY}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const { instance, formName, formUrl, search } = data
  const answers = answersQuery.data
  const title = coupleTitle(search) || DETAIL_FALLBACK_TITLE
  const statusLabel = QUESTIONNAIRE_STATUS_LABELS[instance.status]
  const submitted = formatPendingSubmittedAt(instance.submittedAt)
  const created = formatPendingSubmittedAt(instance.createdAt)
  const when = instance.submittedAt
    ? `${DETAIL_SUBMITTED} ${submitted}`
    : created
      ? `${DETAIL_CREATED} ${created}`
      : ''
  const context = contextLine([
    formName && formName !== title ? formName : null,
    statusLabel,
    when,
  ])
  const showAnswers =
    instance.status === 'submitted' ||
    instance.status === 'approved' ||
    Boolean(answers)
  const showCreateWedding =
    instance.status === 'submitted' && !instance.weddingId
  const showOpenWedding =
    instance.status === 'approved' && Boolean(instance.weddingId)
  const showPublicLinkActions =
    instance.status === 'pending' || instance.status === 'opened'
  const hasHeaderActions =
    showCreateWedding || showOpenWedding || showPublicLinkActions

  return (
    <div className={styles.page} data-testid="questionnaire-detail-modern">
      <header className={styles.header}>
        <div className={styles.heading}>
          <DetailBackLink to={back.to} label={back.label} />
          <h1 className={styles.pageTitle}>{title}</h1>
          <p className={styles.lead}>
            {context}
            {instance.weddingId && !showOpenWedding ? (
              <>
                {context ? ' · ' : ''}
                <Link
                  className={styles.inlineLink}
                  to={`/sluby/${instance.weddingId}`}
                >
                  {DETAIL_LINKED_WEDDING}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {hasHeaderActions ? (
          <div className={styles.actions}>
            {showPublicLinkActions ? (
              <>
                <button
                  type="button"
                  className={styles.secondaryAction}
                  onClick={() => void copyLink()}
                >
                  {DETAIL_COPY_LINK}
                </button>
                <a
                  className={styles.secondaryAction}
                  href={formUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {DETAIL_OPEN_FORM}
                </a>
              </>
            ) : null}
            {showCreateWedding ? (
              <button
                type="button"
                className={styles.primaryAction}
                disabled={approving}
                onClick={() => void handleApprove()}
              >
                {approving ? DETAIL_CREATE_BUSY : DETAIL_CREATE_WEDDING}
              </button>
            ) : null}
            {showOpenWedding && instance.weddingId ? (
              <Link
                className={styles.primaryAction}
                to={`/sluby/${instance.weddingId}`}
              >
                {DETAIL_OPEN_WEDDING}
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className={styles.recordWrap}>
        <div className={styles.surface}>
          {showAnswers && answers?.answerJson ? (
            <ModernQuestionnaireResponseSections
              answerJson={answers.answerJson}
              optionsSnapshot={instance.optionsSnapshot ?? null}
            />
          ) : showAnswers && !answers?.answerJson ? (
            <div className={styles.empty}>
              <p className={styles.emptyDesc}>{DETAIL_EMPTY_ANSWERS}</p>
            </div>
          ) : (
            <div className={styles.empty}>
              <p className={styles.emptyDesc}>{DETAIL_NO_ANSWERS}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
