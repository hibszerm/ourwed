import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import {
  QuestionnaireValidationError,
  saveQuestionnaireDraft,
} from '@/features/documents/questionnaire'
import { useMappingWizard } from '../../state/useMappingWizard'
import styles from '../../MappingWizard.module.css'

/**
 * Save step — creates a reusable questionnaire template (FormDefinition only).
 * No form_instances / submissions / dashboard entries.
 */
export function SaveStep({ templateId }: { templateId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { state, markClean, markQuestionnaireSaved } = useMappingWizard()
  const { draft } = state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    formId: string
    name: string
  } | null>(null)

  const q = draft.questionnaireDraft
  const enabledQuestions = q?.questions.filter((x) => x.enabled).length ?? 0

  async function handleSave() {
    if (!q) {
      setError('Brak wygenerowanej ankiety.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await saveQuestionnaireDraft(q)
      markQuestionnaireSaved(result.form.id)
      markClean()

      await queryClient.invalidateQueries({ queryKey: ['form-definitions'] })
      await queryClient.invalidateQueries({ queryKey: ['questionnaire-templates'] })

      showToast('Typ ankiety został utworzony.', 'success')
      setSuccess({
        formId: result.form.id,
        name: result.draft.name,
      })
    } catch (err) {
      const message =
        err instanceof QuestionnaireValidationError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Nie udało się utworzyć typu ankiety.'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  if (success) {
    return (
      <section className={styles.stepPanel} aria-labelledby="save-success-title">
        <div className={styles.saveHero}>
          <CheckCircle2 size={28} strokeWidth={1.5} aria-hidden />
          <h2 id="save-success-title" className={styles.stepTitle}>
            Typ ankiety został utworzony
          </h2>
          <p className={styles.stepBody}>
            „{success.name}” jest już w bibliotece typów ankiet. Wybierzesz go
            przy „Generuj ankietę” w module Ankiety — bez różnicy względem typów
            utworzonych ręcznie.
          </p>
        </div>

        <div className={styles.stepActions}>
          <Button
            type="button"
            variant="primary"
            onClick={() => navigate('/ankiety')}
          >
            Przejdź do ankiet
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              navigate(`/ustawienia/dokumenty/szablony/${templateId}`)
            }
          >
            Wróć do szablonu umowy
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.stepPanel} aria-labelledby="save-step-title">
      <div className={styles.saveHero}>
        <CheckCircle2 size={28} strokeWidth={1.5} aria-hidden />
        <h2 id="save-step-title" className={styles.stepTitle}>
          Dodaj do biblioteki ankiet
        </h2>
        <p className={styles.stepBody}>
          Utworzysz typ ankiety (szablon). Nie wysyła linku i nie pojawia się na
          liście wysłanych ankiet — będzie dostępny przy generowaniu nowej
          ankiety.
        </p>
      </div>

      <ul className={styles.saveSummary}>
        <li>
          <span>Nazwa typu</span>
          <strong>{q?.name ?? '—'}</strong>
        </li>
        <li>
          <span>Pytania</span>
          <strong>{enabledQuestions}</strong>
        </li>
        <li>
          <span>Studio / system</span>
          <strong>
            {(q?.counts.studio ?? 0) + (q?.counts.system ?? 0)}
          </strong>
        </li>
        <li>
          <span>Konfiguracja OurWed</span>
          <strong>{q?.counts.ourwedConfiguration ?? 0}</strong>
        </li>
      </ul>

      {q?.suggestedPackageLabel && (
        <p className={styles.helperText}>
          Sugerowany pakiet: <strong>{q.suggestedPackageLabel}</strong>
          {q.linkedPackageId ? ' (powiązanie przy zapisie)' : ''}.
        </p>
      )}

      {error && <p className={styles.errorText}>{error}</p>}

      <div className={styles.stepActions}>
        <Button
          type="button"
          variant="primary"
          disabled={saving || enabledQuestions === 0 || !q?.name?.trim()}
          onClick={() => void handleSave()}
        >
          {saving ? 'Tworzenie…' : 'Utwórz typ ankiety'}
        </Button>
      </div>
    </section>
  )
}
