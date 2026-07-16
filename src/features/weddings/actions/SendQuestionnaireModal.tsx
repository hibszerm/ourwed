import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import {
  weddingActionsService,
  type QuestionnaireKind,
} from '@/lib/api/weddingActionsService'
import { formService } from '@/lib/api/formService'
import { useInvalidateWedding } from '@/features/weddings/hooks/useInvalidateWedding'
import type { Wedding } from '@/types/wedding'
import formStyles from './actionForm.module.css'

interface SendQuestionnaireModalProps {
  open: boolean
  onClose: () => void
  wedding: Wedding
  kind: QuestionnaireKind
}

function defaultEmail(wedding: Wedding): string {
  return (
    wedding.couple.email ||
    wedding.couple.partner1Email ||
    wedding.couple.partner2Email ||
    ''
  )
}

export function SendQuestionnaireModal({
  open,
  onClose,
  wedding,
  kind,
}: SendQuestionnaireModalProps) {
  const invalidate = useInvalidateWedding()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isContract = kind === 'contractData'
  const title = isContract ? 'Wyślij ankietę do umowy' : 'Wyślij ankietę przedślubną'
  const description = isContract
    ? 'Para otrzyma link do formularza z danymi potrzebnymi do przygotowania umowy.'
    : 'Para otrzyma link do ankiety z detalami dotyczącymi dnia ślubu.'

  useEffect(() => {
    if (!open) return

    setEmail(defaultEmail(wedding))
    setError(null)
    setBusy(false)

    let cancelled = false
    formService.getSettings().then((settings) => {
      if (cancelled) return
      setMessage(
        isContract
          ? settings.contractQuestionnaireMessage ?? settings.welcomeDescription
          : settings.weddingQuestionnaireMessage ?? settings.welcomeDescription,
      )
    })

    return () => {
      cancelled = true
    }
  }, [open, wedding, isContract])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!email.trim()) {
      setError('Podaj adres e-mail odbiorcy.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await weddingActionsService.sendQuestionnaire({
        weddingId: wedding.id,
        kind,
        recipientEmail: email.trim(),
        message: message.trim() || undefined,
      })
      await invalidate(wedding.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wysłać ankiety.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      busy={busy}
      primaryAction={
        <Button
          type="submit"
          form="send-questionnaire-form"
          variant="primary"
          disabled={busy}
        >
          {busy ? 'Wysyłanie…' : 'Wyślij'}
        </Button>
      }
    >
      <form
        id="send-questionnaire-form"
        className={formStyles.form}
        onSubmit={handleSubmit}
      >
        <Input
          id="questionnaire-email"
          label="Adres e-mail odbiorcy"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={busy}
        />
        <Textarea
          id="questionnaire-message"
          label="Wiadomość (opcjonalnie)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          disabled={busy}
          hint="Treść pochodzi z ustawień fotografa — możesz ją dostosować."
        />
        {error && (
          <p
            role="alert"
            style={{ color: 'var(--color-error)', fontSize: '0.875rem', margin: 0 }}
          >
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
