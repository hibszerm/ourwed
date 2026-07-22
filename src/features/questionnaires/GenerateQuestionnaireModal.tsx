import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { listActiveFormTemplates } from '@/lib/api/forms'
import {
  questionnaireService,
  questionnaireTypeLabel,
  type QuestionnaireExpiration,
} from '@/lib/api/questionnaireService'
import { useAuth } from '@/features/auth/hooks/useAuth'
import styles from './Questionnaires.module.css'

interface GenerateQuestionnaireModalProps {
  open: boolean
  onClose: () => void
  onGenerated: () => void
  /** Prefer this form template when opening (e.g. package-linked). */
  preferredFormId?: string | null
}

export function GenerateQuestionnaireModal({
  open,
  onClose,
  onGenerated,
  preferredFormId = null,
}: GenerateQuestionnaireModalProps) {
  const { user } = useAuth()
  const [formId, setFormId] = useState<string>('')
  const [expiration, setExpiration] =
    useState<QuestionnaireExpiration>('14d')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    formUrl: string
    formName: string
  } | null>(null)

  const { data: forms = [], isLoading: formsLoading } = useQuery({
    queryKey: ['questionnaire-templates', user?.id],
    queryFn: () => listActiveFormTemplates('contract'),
    enabled: open && Boolean(user?.id),
  })

  const contractForms = forms.filter((f) => f.isActive)

  useEffect(() => {
    if (!open || contractForms.length === 0) return
    if (preferredFormId && contractForms.some((f) => f.id === preferredFormId)) {
      setFormId(preferredFormId)
      return
    }
    if (!formId || !contractForms.some((f) => f.id === formId)) {
      setFormId(contractForms[0]!.id)
    }
  }, [open, contractForms, preferredFormId, formId])

  async function handleGenerate() {
    if (!formId) {
      setError('Wybierz typ ankiety.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const generated = await questionnaireService.generate({
        type: 'contract',
        expiration,
        formId,
      })
      setResult({ formUrl: generated.formUrl, formName: generated.formName })
      onGenerated()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nie udało się wygenerować ankiety.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!result) return
    await navigator.clipboard.writeText(result.formUrl)
  }

  function handleClose() {
    if (busy) return
    setResult(null)
    setError(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      title={result ? 'Link do ankiety' : 'Wygeneruj ankietę'}
      description={
        result
          ? 'Skopiuj unikalny link i wyślij go do pary.'
          : 'Wybierz typ ankiety z biblioteki i utwórz nowy link (nowy token przy każdym generowaniu).'
      }
      onClose={handleClose}
      busy={busy}
      primaryAction={
        result ? (
          <Button type="button" variant="primary" onClick={handleClose}>
            Zamknij
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            disabled={busy || formsLoading || !formId}
            onClick={() => void handleGenerate()}
          >
            {busy ? 'Generowanie…' : 'Generuj link'}
          </Button>
        )
      }
    >
      {result ? (
        <div className={styles.field}>
          <p className={styles.name}>{result.formName}</p>
          <div className={styles.linkRow}>
            <input
              className={styles.linkInput}
              readOnly
              value={result.formUrl}
              aria-label="URL ankiety"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleCopy()}
            >
              Kopiuj
            </Button>
            <a href={result.formUrl} target="_blank" rel="noreferrer">
              <Button type="button" variant="ghost" size="sm">
                Otwórz
              </Button>
            </a>
          </div>
        </div>
      ) : (
        <div className={styles.field} style={{ gap: 16 }}>
          <label className={styles.field}>
            <span>Typ ankiety</span>
            <select
              value={formId}
              onChange={(e) => setFormId(e.target.value)}
              disabled={busy || formsLoading}
            >
              {formsLoading && <option value="">Ładowanie…</option>}
              {!formsLoading && contractForms.length === 0 && (
                <option value="">Brak typów ankiet</option>
              )}
              {contractForms.map((form) => (
                <option key={form.id} value={form.id}>
                  {questionnaireTypeLabel(form)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Ważność</span>
            <select
              value={expiration}
              onChange={(e) =>
                setExpiration(e.target.value as QuestionnaireExpiration)
              }
              disabled={busy}
            >
              <option value="7d">7 dni</option>
              <option value="14d">14 dni</option>
              <option value="30d">30 dni</option>
              <option value="never">Bezterminowo</option>
            </select>
          </label>
          {error ? <p className={styles.errorText} role="alert">{error}</p> : null}
        </div>
      )}
    </Modal>
  )
}
