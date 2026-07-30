import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { formatShortDate } from '@/lib/utils/dates'
import { weddingQuestionnaireService } from '@/lib/api/preweddingQuestionnaireService'
import { WeddingContractQuestionnaireAnswers } from '@/features/weddings/detail/v2/WeddingContractQuestionnaireAnswers'
import { isPreWeddingSubmittedStatus } from '@/types/preweddingQuestionnaire'
import type { Task, Wedding, WeddingNote } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface Props {
  wedding: Wedding
  notes: WeddingNote[]
  tasks: Task[]
  onAddNote?: () => void
  onEditNotes?: () => void
  onEditTasks?: () => void
  onSendQuestionnaire?: () => void
  onOpenPreWeddingTab?: () => void
}

function questionnaireStatusLabel(wedding: Wedding): string {
  const q = wedding.questionnaires.contractData
  if (q.status === 'completed') {
    return q.completedAt
      ? `Wypełniona · ${formatShortDate(q.completedAt)}`
      : 'Wypełniona'
  }
  if (q.status === 'not_sent') return 'Oczekuje na wysłanie'
  return 'Wysłana'
}

function tasksSummary(tasks: Task[]): string {
  if (tasks.length === 0) return 'Brak otwartych zadań'
  const open = tasks.filter((t) => !t.completed)
  if (open.length === 0) return 'Brak otwartych zadań'
  const nearest = [...open].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const completed = tasks.length - open.length
  const base = `${open.length} otwarte · najbliższe do ${formatShortDate(nearest.dueDate)}`
  return completed > 0 ? `${base} · ${completed} wykonane` : base
}

/**
 * Current-state operational panels for Overview (not History).
 * Questionnaire, tasks, and notes actions live here.
 */
export function WeddingOverviewCurrentState({
  wedding,
  notes,
  tasks,
  onAddNote,
  onEditNotes,
  onEditTasks,
  onSendQuestionnaire,
  onOpenPreWeddingTab,
}: Props) {
  const q = wedding.questionnaires.contractData

  const { data: preWeddingQ } = useQuery({
    queryKey: ['prewedding-questionnaire', wedding.id],
    queryFn: () => weddingQuestionnaireService.getByWeddingId(wedding.id),
  })
  const sortedNotes = [...notes].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
  const latestNote = sortedNotes[0]

  return (
    <div
      className={styles.overviewCurrentState}
      data-testid="wedding-overview-current-state"
    >
      <section
        className={styles.overviewStateCard}
        aria-labelledby="overview-questionnaire-title"
        data-testid="overview-questionnaire"
      >
        <div className={styles.overviewStateHeader}>
          <div>
            <h2 id="overview-questionnaire-title" className={styles.sectionHeading}>
              Ankieta do umowy
            </h2>
            <p className={styles.contextStrong}>{questionnaireStatusLabel(wedding)}</p>
          </div>
          {onSendQuestionnaire && q.status === 'not_sent' ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="overview-send-questionnaire"
              onClick={onSendQuestionnaire}
            >
              Wyślij ankietę
            </Button>
          ) : null}
        </div>
        {q.status === 'completed' ? (
          <WeddingContractQuestionnaireAnswers
            weddingId={wedding.id}
            enabled
          />
        ) : null}
      </section>

      {/* Compact pre-wedding questionnaire status card */}
      <section
        className={styles.overviewStateCard}
        aria-labelledby="overview-prewedding-title"
        data-testid="overview-prewedding-questionnaire"
      >
        <div className={styles.overviewStateHeader}>
          <div>
            <h2 id="overview-prewedding-title" className={styles.sectionHeading}>
              Ankieta przedślubna
            </h2>
            <p className={styles.contextStrong}>
              {!preWeddingQ
                ? 'Nieprzygotowana'
                : isPreWeddingSubmittedStatus(preWeddingQ.status)
                  ? preWeddingQ.submittedAt
                    ? `Wypełniona · ${formatShortDate(preWeddingQ.submittedAt)}`
                    : 'Wypełniona'
                  : preWeddingQ.status === 'in_progress'
                    ? 'W trakcie uzupełniania'
                    : preWeddingQ.status === 'opened'
                      ? 'Otwarta przez parę'
                      : preWeddingQ.status === 'sent'
                        ? 'Wysłana · para nie otworzyła'
                        : preWeddingQ.status === 'draft'
                          ? 'Szkic gotowy do wysłania'
                          : 'Nieprzygotowana'}
            </p>
          </div>
          {onOpenPreWeddingTab ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="overview-prewedding-action"
              onClick={onOpenPreWeddingTab}
            >
              {!preWeddingQ
                ? 'Przygotuj'
                : isPreWeddingSubmittedStatus(preWeddingQ.status)
                  ? 'Zobacz odpowiedzi'
                  : 'Otwórz'}
            </Button>
          ) : null}
        </div>
      </section>

      <section
        className={styles.overviewStateCard}
        aria-labelledby="overview-tasks-title"
        data-testid="overview-tasks"
      >
        <div className={styles.overviewStateHeader}>
          <div>
            <h2 id="overview-tasks-title" className={styles.sectionHeading}>
              Zadania
            </h2>
            <p className={styles.contextStrong}>{tasksSummary(tasks)}</p>
          </div>
          {onEditTasks ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="overview-edit-tasks"
              onClick={onEditTasks}
            >
              Edytuj zadania
            </Button>
          ) : null}
        </div>
      </section>

      <section
        className={styles.overviewStateCard}
        aria-labelledby="overview-notes-title"
        data-testid="overview-notes"
      >
        <div className={styles.overviewStateHeader}>
          <h2 id="overview-notes-title" className={styles.sectionHeading}>
            Notatki
          </h2>
          <div className={styles.overviewStateActions}>
            {onAddNote ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="overview-add-note"
                onClick={onAddNote}
              >
                Dodaj notatkę
              </Button>
            ) : null}
            {onEditNotes ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="overview-edit-notes"
                onClick={onEditNotes}
              >
                Edytuj notatki
              </Button>
            ) : null}
          </div>
        </div>
        {latestNote ? (
          <p className={styles.overviewNotePreview}>{latestNote.content}</p>
        ) : (
          <p className={styles.contextMuted}>Brak notatek</p>
        )}
        {sortedNotes.length > 1 ? (
          <p className={styles.contextMuted}>
            +{sortedNotes.length - 1}{' '}
            {sortedNotes.length - 1 === 1 ? 'wcześniejsza' : 'wcześniejsze'}
          </p>
        ) : null}
      </section>
    </div>
  )
}
