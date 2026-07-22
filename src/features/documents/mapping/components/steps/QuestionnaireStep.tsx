import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  CONTRACT_VALUE_SOURCE_LABELS,
  QUESTION_TYPE_LABELS,
  type DraftQuestion,
} from '@/features/documents/questionnaire'
import { useMappingWizard } from '../../state/useMappingWizard'
import { ReviewStep } from './ReviewStep'
import styles from '../../MappingWizard.module.css'

function QuestionPreviewRow({
  question,
  onToggle,
  onPatch,
}: {
  question: DraftQuestion
  onToggle: (enabled: boolean) => void
  onPatch: (patch: Partial<DraftQuestion>) => void
}) {
  const [open, setOpen] = useState(false)
  const typeLabel = QUESTION_TYPE_LABELS[question.type] ?? question.type
  const sourceLabel = CONTRACT_VALUE_SOURCE_LABELS[question.source]

  return (
    <article
      className={`${styles.infoCard} ${!question.enabled ? styles.questionDisabled : ''}`}
    >
      <div className={styles.questionRowHead}>
        <label className={styles.questionEnable}>
          <input
            type="checkbox"
            checked={question.enabled}
            onChange={(e) => onToggle(e.target.checked)}
            aria-label={
              question.enabled ? 'Wyłącz pytanie' : 'Włącz pytanie'
            }
          />
          <span className={styles.questionEnableMark} aria-hidden>
            {question.enabled ? '✓' : ''}
          </span>
        </label>
        <button
          type="button"
          className={styles.questionRowMain}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={styles.infoCardTitle}>{question.title}</span>
          <span className={styles.questionMeta}>
            {typeLabel}
            {' · '}
            {question.required ? 'Wymagane' : 'Opcjonalne'}
            {' · '}
            Źródło: {sourceLabel}
          </span>
          {question.type === 'select' &&
            question.options &&
            question.options.length > 0 && (
              <span className={styles.questionOptionsPreview}>
                Wartości: {question.options.map((o) => o.label).join(', ')}
              </span>
            )}
        </button>
      </div>

      {open && question.enabled && (
        <div className={styles.infoCardBody}>
          <label className={styles.mappingFieldLabel}>
            Tytuł pytania
            <input
              className={styles.variableSelect}
              value={question.title}
              onChange={(e) => onPatch({ title: e.target.value })}
            />
          </label>
          <label className={styles.mappingFieldLabel}>
            Opis
            <input
              className={styles.variableSelect}
              value={question.description}
              onChange={(e) => onPatch({ description: e.target.value })}
            />
          </label>
          <label className={styles.mappingFieldLabel}>
            Placeholder
            <input
              className={styles.variableSelect}
              value={question.placeholder}
              onChange={(e) => onPatch({ placeholder: e.target.value })}
            />
          </label>
          <label className={styles.questionRequired}>
            <input
              type="checkbox"
              checked={question.required}
              onChange={(e) => onPatch({ required: e.target.checked })}
            />
            Wymagane
          </label>
          <label className={styles.mappingFieldLabel}>
            Kolejność
            <input
              className={styles.variableSelect}
              type="number"
              min={0}
              value={question.order}
              onChange={(e) =>
                onPatch({ order: Number(e.target.value) || 0 })
              }
            />
          </label>
          <p className={styles.helperText}>
            Podgląd dla pary: <strong>{typeLabel}</strong>
            {question.type === 'select' && question.options?.length
              ? ` · ${question.options.length} opcji z konfiguracji studia`
              : ''}
          </p>
        </div>
      )}
    </article>
  )
}

/**
 * Review the questionnaire exactly as the couple will see it.
 */
export function QuestionnaireStep() {
  const {
    state,
    updateDraftQuestion,
    toggleDraftQuestion,
    setQuestionnaireName,
    regenerateQuestionnaire,
  } = useMappingWizard()
  const draft = state.draft.questionnaireDraft
  const [showSources, setShowSources] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  async function handleRegenerate() {
    setRegenerating(true)
    try {
      await regenerateQuestionnaire()
    } finally {
      setRegenerating(false)
    }
  }

  if (!draft) {
    return (
      <section className={styles.stepPanel}>
        <p className={styles.helperText}>
          Brak wygenerowanej ankiety. Wróć do analizy i uruchom ją ponownie.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={regenerating}
          onClick={() => void handleRegenerate()}
        >
          Wygeneruj ankietę
        </Button>
      </section>
    )
  }

  const enabledCount = draft.questions.filter((q) => q.enabled).length
  const sorted = [...draft.questions].sort((a, b) => a.order - b.order)

  return (
    <section
      className={styles.stepPanel}
      aria-labelledby="questionnaire-step-title"
    >
      <div className={styles.stepIntro}>
        <h2 id="questionnaire-step-title" className={styles.stepTitle}>
          Ankieta dla pary
        </h2>
        <p className={styles.stepBody}>
          Tak zobaczy ankietę para. Włącz lub wyłącz pytania, popraw tytuły —
          bez technicznych zmiennych.
        </p>
      </div>

      <div className={styles.questionnaireSummary}>
        <p>
          Ta umowa wymaga:{' '}
          <strong>{draft.counts.couple}</strong> odpowiedzi od pary,{' '}
          <strong>{draft.counts.studio}</strong> wartości ze studia,{' '}
          <strong>{draft.counts.system}</strong> wartości systemowych,{' '}
          <strong>{draft.counts.ourwedConfiguration}</strong> z konfiguracji
          OurWed.
        </p>
        <p className={styles.helperText}>
          Ankieta została wygenerowana automatycznie
          {draft.suggestedPackageLabel
            ? ` · sugerowany pakiet: ${draft.suggestedPackageLabel}`
            : ''}
          .
        </p>
      </div>

      <label className={styles.mappingFieldLabel}>
        Nazwa ankiety
        <input
          className={styles.variableSelect}
          value={draft.name}
          onChange={(e) => setQuestionnaireName(e.target.value)}
        />
      </label>

      <header className={styles.paneHeader}>
        <h3 className={styles.paneTitle}>Pytania (podgląd dla pary)</h3>
        <p className={styles.paneMeta}>
          {enabledCount} włączonych z {draft.questions.length}
        </p>
      </header>

      <div className={styles.infoGroupList}>
        {sorted.map((q) => (
          <QuestionPreviewRow
            key={q.id}
            question={q}
            onToggle={(enabled) => toggleDraftQuestion(q.id, enabled)}
            onPatch={(patch) => updateDraftQuestion(q.id, patch)}
          />
        ))}
      </div>

      {draft.questions.length === 0 && (
        <p className={styles.helperText}>
          AI nie wykryło pytań dla pary. Wróć do analizy lub dodaj informacje w
          trybie zaawansowanym.
        </p>
      )}

      <div className={styles.stepActions}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowSources((v) => !v)}
        >
          {showSources
            ? 'Ukryj źródła danych'
            : 'Pokaż źródła danych (zaawansowane)'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={regenerating}
          onClick={() => void handleRegenerate()}
        >
          {regenerating ? 'Przeliczam…' : 'Przelicz ankietę'}
        </Button>
      </div>

      {showSources && (
        <div className={styles.embeddedAdvanced}>
          <ReviewStep />
        </div>
      )}
    </section>
  )
}
