import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import {
  weddingActionsService,
  type QuestionnaireKind,
} from '@/lib/api/weddingActionsService'
import { useInvalidateWedding } from '@/features/weddings/hooks/useInvalidateWedding'
import type { Wedding } from '@/types/wedding'
import formStyles from './actionForm.module.css'

interface SendQuestionnaireModalProps {
  open: boolean
  onClose: () => void
  wedding: Wedding
  kind: QuestionnaireKind
}

export function SendQuestionnaireModal({
  open,
  onClose,
  wedding,
  kind,
}: SendQuestionnaireModalProps) {
  const invalidate = useInvalidateWedding()
  const [questionnaireUrl, setQuestionnaireUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isContract = kind === 'contractData'
  const title = isContract ? 'Link: Dane do umowy' : 'Link do ankiety przedślubnej'
  const description =
    'Skopiuj link i wyślij go parze przez Messengera, WhatsApp lub e-mail.'

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setQuestionnaireUrl('')
    setError(null)
    setCopied(false)
    setBusy(true)

    void (async () => {
      try {
        const { formUrl } = await weddingActionsService.sendQuestionnaire({
          weddingId: wedding.id,
          kind,
        })
        if (cancelled) return

        setQuestionnaireUrl(formUrl)
        await invalidate(wedding.id)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : 'Nie udało się wygenerować linku.',
        )
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // Omit `invalidate` from deps so success refresh does not create another token.
  }, [open, wedding.id, kind])

  async function handleCopy() {
    if (!questionnaireUrl) return
    try {
      await navigator.clipboard.writeText(questionnaireUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Nie udało się skopiować linku.')
    }
  }

  function handleOpen() {
    if (!questionnaireUrl) return
    window.open(questionnaireUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      busy={busy}
      cancelLabel="Zamknij"
      primaryAction={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={handleOpen}
            disabled={busy || !questionnaireUrl}
          >
            Otwórz formularz
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              void handleCopy()
            }}
            disabled={busy || !questionnaireUrl}
          >
            {copied ? 'Skopiowano' : 'Kopiuj link'}
          </Button>
        </>
      }
    >
      <div className={formStyles.form}>
        <Input
          id="questionnaire-url"
          label="Link do ankiety"
          type="text"
          value={busy ? 'Generowanie linku…' : questionnaireUrl}
          readOnly
          disabled={busy || !questionnaireUrl}
          onFocus={(event) => event.currentTarget.select()}
        />
        {error && (
          <p
            role="alert"
            style={{ color: 'var(--color-error)', fontSize: '0.875rem', margin: 0 }}
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
