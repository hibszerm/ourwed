import { Link, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { IconArrowLeft } from '@/components/icons'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { QuestionnaireAnswersReadOnly } from '@/features/questionnaires/QuestionnaireAnswersReadOnly'
import {
  QUESTIONNAIRE_STATUS_LABELS,
  questionnaireService,
  questionnaireStatusVariant,
} from '@/lib/api/questionnaireService'
import styles from '@/features/questionnaires/Questionnaires.module.css'

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function QuestionnaireDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const userId = useStudioAuthId()
  const [approving, setApproving] = useState(false)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['questionnaires', userId, id],
    queryFn: () => questionnaireService.getById(id),
    enabled: Boolean(userId && id),
  })

  const { data: answers } = useQuery({
    queryKey: ['questionnaires', userId, id, 'answers'],
    queryFn: () => questionnaireService.getAnswers(id),
    enabled: Boolean(userId && id) && Boolean(data),
  })

  if (isLoading) {
    return (
      <AppLayout>
        <PageContainer>
          <div className={styles.loading}>Ładowanie ankiety…</div>
        </PageContainer>
      </AppLayout>
    )
  }

  if (isError || !data) {
    return (
      <AppLayout title="Ankieta">
        <PageContainer>
          <EmptyState
            title="Nie znaleziono ankiety"
            description={
              error instanceof Error ? error.message : 'Sprawdź link lub wróć do listy.'
            }
          />
          <Button type="button" variant="secondary" onClick={() => void refetch()}>
            Spróbuj ponownie
          </Button>
        </PageContainer>
      </AppLayout>
    )
  }

  const { instance, formName, formUrl } = data
  const timeline = questionnaireService.buildTimeline(instance)
  const showAnswers =
    instance.status === 'submitted' ||
    instance.status === 'approved' ||
    Boolean(answers)

  async function copyLink() {
    await navigator.clipboard.writeText(formUrl)
  }

  async function handleApprove() {
    if (approving) return
    setApproving(true)
    try {
      const { wedding } = await questionnaireService.approve(instance.id)
      await queryClient.invalidateQueries({ queryKey: ['questionnaires'] })
      await queryClient.invalidateQueries({ queryKey: ['weddings'] })
      navigate(`/sluby/${wedding.id}`)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Nie udało się zatwierdzić.')
    } finally {
      setApproving(false)
    }
  }

  return (
    <AppLayout
      title={formName}
      subtitle="Szczegóły ankiety"
      action={
        <Link to="/ankiety">
          <Button type="button" variant="ghost" size="sm">
            <IconArrowLeft width={16} height={16} /> Lista
          </Button>
        </Link>
      }
    >
      <PageContainer width="wide">
        <div className={styles.actions} style={{ marginBottom: 24 }}>
          <Badge variant={questionnaireStatusVariant(instance.status)}>
            {QUESTIONNAIRE_STATUS_LABELS[instance.status]}
          </Badge>
          {(instance.status === 'pending' || instance.status === 'opened') && (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={() => void copyLink()}>
                Kopiuj link
              </Button>
              <a href={formUrl} target="_blank" rel="noreferrer">
                <Button type="button" variant="ghost" size="sm">
                  Otwórz
                </Button>
              </a>
            </>
          )}
          {instance.status === 'submitted' && !instance.weddingId && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={approving}
              onClick={() => void handleApprove()}
            >
              {approving ? 'Zapisywanie…' : 'Utwórz ślub'}
            </Button>
          )}
          {instance.status === 'approved' && instance.weddingId && (
            <Link to={`/sluby/${instance.weddingId}`}>
              <Button type="button" variant="primary" size="sm">
                Otwórz ślub
              </Button>
            </Link>
          )}
        </div>

        <div className={styles.detailGrid}>
          <Card>
            <CardHeader title="Metadane" />
            <dl className={styles.metaList}>
              <div>
                <dt>Typ</dt>
                <dd>{formName}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{QUESTIONNAIRE_STATUS_LABELS[instance.status]}</dd>
              </div>
              <div>
                <dt>Token</dt>
                <dd>{instance.token}</dd>
              </div>
              <div>
                <dt>Link</dt>
                <dd>{formUrl}</dd>
              </div>
              <div>
                <dt>Utworzono</dt>
                <dd>{formatDateTime(instance.createdAt)}</dd>
              </div>
              <div>
                <dt>Otwarto</dt>
                <dd>{formatDateTime(instance.openedAt)}</dd>
              </div>
              <div>
                <dt>Wysłano</dt>
                <dd>{formatDateTime(instance.submittedAt)}</dd>
              </div>
              <div>
                <dt>Wygaśnięcie</dt>
                <dd>
                  {instance.expiresAt
                    ? formatDateTime(instance.expiresAt)
                    : 'Bezterminowo'}
                </dd>
              </div>
              <div>
                <dt>Ślub</dt>
                <dd>
                  {instance.weddingId ? (
                    <Link to={`/sluby/${instance.weddingId}`}>{instance.weddingId}</Link>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Historia" subtitle="Chronologiczny dziennik aktywności" />
            <ol className={styles.timeline}>
              {timeline.map((event) => (
                <li key={event.id} className={styles.timelineItem}>
                  <p className={styles.timelineTitle}>{event.title}</p>
                  <time className={styles.timelineAt}>{formatDateTime(event.at)}</time>
                  {event.description ? (
                    <p className={styles.timelineDesc}>{event.description}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {showAnswers && answers?.answerJson ? (
          <div className={styles.answersShell}>
            <QuestionnaireAnswersReadOnly answerJson={answers.answerJson} />
          </div>
        ) : null}
      </PageContainer>
    </AppLayout>
  )
}
