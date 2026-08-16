import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import {
  isProAccessRequiredError,
  toProAccessUserMessage,
} from '@/features/billing/proAccessError'
import { questionnaireService } from '@/lib/api/questionnaireService'
import styles from './Questionnaires.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

interface GenerateQuestionnaireModalProps {
  open: boolean
  onClose: () => void
  onGenerated: () => void
}

/** Create an indefinite Contract Data Questionnaire public link. */
export function GenerateQuestionnaireModal({
  open,
  onClose,
  onGenerated,
}: GenerateQuestionnaireModalProps) {
  const { requirePro, openUpgradeDialog } = useProAccessGate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    formUrl: string
    formName: string
  } | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setResult(null)
      setError(null)
      setBusy(false)
    }
  }

  async function handleGenerate() {
    if (!requirePro(undefined, { actionKey: 'generate_questionnaire_link' })) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const generated = await questionnaireService.generate({
        type: 'contract',
      })
      setResult({ formUrl: generated.formUrl, formName: generated.formName })
      onGenerated()
    } catch (err) {
      if (isProAccessRequiredError(err)) {
        setError(toProAccessUserMessage())
        openUpgradeDialog('pro_required_action', 'generate_questionnaire_link')
        return
      }
      setError(
        getUserFacingErrorMessage(err, 'Nie udało się wygenerować ankiety.'),
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
          : 'Utwórz nowy link do ankiety „Dane do umowy” (bezterminowy).'
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
            disabled={busy}
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
        <div className={styles.field}>
          {error ? <p className={styles.errorText} role="alert">{error}</p> : null}
        </div>
      )}
    </Modal>
  )
}
