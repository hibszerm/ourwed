import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import {
  CONTRACT_VALUE_SOURCE_LABELS,
  QUESTION_TYPE_LABELS,
  type DraftQuestion,
} from '@/features/documents/questionnaire'
import { QuestionField } from '@/features/forms/QuestionField'
import { packageService } from '@/lib/api/packageService'
import { getLivePackageQuestion } from '@/lib/forms/resolvePublicFormTemplate'
import { useMappingWizard } from '../../state/useMappingWizard'
import { ReviewStep } from './ReviewStep'
import styles from '../../MappingWizard.module.css'

function isPackageDraftQuestion(question: DraftQuestion): boolean {
  return (
    question.id === 'q-package' ||
    question.id === 'q-q-package' ||
    question.fieldKey === 'packageId' ||
    question.registryKey === 'package.name'
  )
}

function QuestionPreviewRow({
  question,
  livePackageOptions,
  onToggle,
  onPatch,
}: {
  question: DraftQuestion
  /** Live Studio package options — same source as /form/:token. */
  livePackageOptions: Array<{ value: string; label: string }>
  onToggle: (enabled: boolean) => void
  onPatch: (patch: Partial<DraftQuestion>) => void
}) {
  const [open, setOpen] = useState(false)
  const isPackage = isPackageDraftQuestion(question)
  const typeLabel = QUESTION_TYPE_LABELS[question.type] ?? question.type
  const sourceLabel = CONTRACT_VALUE_SOURCE_LABELS[question.source]
  const options = isPackage ? livePackageOptions : (question.options ?? [])

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
          {question.type === 'select' && options.length > 0 && (
            <span className={styles.questionOptionsPreview}>
              Wartości: {options.map((o) => o.label).join(', ')}
            </span>
          )}
        </button>
      </div>

      {open && question.enabled && (
        <div className={styles.infoCardBody}>
          {isPackage ? (
            <>
              <p className={styles.helperText}>
                Podgląd dla pary — ten sam selektor i te same pakiety co w
                ankiecie publicznej (Studio → Pakiety):
              </p>
              <QuestionField
                question={{
                  id: 'q-package',
                  type: 'select',
                  label: 'Pakiet',
                  required: true,
                  fieldKey: 'packageId',
                  options: livePackageOptions,
                }}
                value=""
                onChange={() => undefined}
                readOnly
              />
            </>
          ) : (
            <>
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
                {question.type === 'select' && options.length
                  ? ` · ${options.length} opcji z konfiguracji studia`
                  : ''}
              </p>
            </>
          )}
        </div>
      )}
    </article>
  )
}

/**
 * Review the questionnaire exactly as the couple will see it.
 * Package options come from Studio Packages at render time (never from draft).
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

  const userId = useStudioAuthId()
  const {
    data: studioPackages,
    isPending: packagesPending,
    isSuccess: packagesSuccess,
    isError: packagesError,
    refetch: refetchPackages,
  } = useQuery({
    queryKey: ['studio-packages', userId, 'active'],
    queryFn: async () => {
      const list = await packageService.list({ activeOnly: true })
      if (import.meta.env.DEV) {
        console.info('[QuestionnaireStep] packageService.list', {
          packagesLength: list.length,
          packageIds: list.map((p) => p.id),
          packageNames: list.map((p) => p.name),
        })
      }
      return list
    },
    enabled: Boolean(userId),
    staleTime: 0,
    refetchOnMount: 'always',
    retry: 1,
  })

  // Live options are built only after isSuccess (see early returns below).
  // Never use [] as a stand-in for "still loading".

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

  if (packagesPending || (!packagesSuccess && !packagesError)) {
    return (
      <section className={styles.stepPanel}>
        <p className={styles.helperText}>Ładowanie pakietów ze Studio…</p>
      </section>
    )
  }

  if (packagesError || !studioPackages) {
    return (
      <section className={styles.stepPanel}>
        <p className={styles.helperText}>
          Nie udało się załadować pakietów ze Studio → Pakiety.
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void refetchPackages()}
        >
          Spróbuj ponownie
        </Button>
      </section>
    )
  }

  const livePackageOptions =
    getLivePackageQuestion(
      studioPackages.map((p) => ({ id: p.id, name: p.name })),
    ).options ?? []

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
          {livePackageOptions.length > 0
            ? ` Pakiet: ${livePackageOptions.length} aktywnych ze Studio → Pakiety.`
            : ''}
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
            livePackageOptions={livePackageOptions}
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
