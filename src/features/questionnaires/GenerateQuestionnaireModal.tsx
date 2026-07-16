import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  questionnaireService,
  type QuestionnaireExpiration,
  type QuestionnaireType,
} from '@/lib/api/questionnaireService'
import styles from './Questionnaires.module.css'

interface GenerateQuestionnaireModalProps {
  open: boolean
  onClose: () => void
  onGenerated: () => void
}

export function GenerateQuestionnaireModal({
  open,
  onClose,
  onGenerated,
}: GenerateQuestionnaireModalProps) {
  const [type, setType] = useState<QuestionnaireType>('contract')
  const [expiration, setExpiration] =
    useState<QuestionnaireExpiration>('14d')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    formUrl: string
    formName: string
  } | null>(null)

  async function handleGenerate() {
    setBusy(true)
    setError(null)
    try {
      const generated = await questionnaireService.generate({ type, expiration })
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
          : 'Utwórz nowy link ankiety (nowy token przy każdym wygenerowaniu).'
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
            <Button type="button" variant="secondary" size="sm" onClick={() => void handleCopy()}>
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
              value={type}
              onChange={(e) => setType(e.target.value as QuestionnaireType)}
              disabled={busy}
            >
              <option value="contract">Dane do umowy</option>
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
