import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
} from '@/features/account-deletion/accountDeletionTypes'
import { isConfirmationPhraseValid } from '@/features/account-deletion/accountDeletionMessages'
import { requestAccountDeletion } from '@/features/account-deletion/accountDeletionService'
import styles from '@/features/account-deletion/AccountDeletionDialog.module.css'

type AccountDeletionDialogProps = {
  open: boolean
  onClose: () => void
}

function clearSensitive(setPassword: (v: string) => void, setConfirm: (v: string) => void) {
  setPassword('')
  setConfirm('')
}

export function AccountDeletionDialog({ open, onClose }: AccountDeletionDialogProps) {
  const formId = useId()
  const errorId = `${formId}-error`
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (!open) {
      clearSensitive(setPassword, setConfirmation)
      setError(null)
      setSubmitting(false)
      submittingRef.current = false
    }
  }, [open])

  const canSubmit =
    password.length > 0 &&
    isConfirmationPhraseValid(confirmation) &&
    !submitting

  function handleClose() {
    if (submitting) return
    clearSensitive(setPassword, setConfirmation)
    setError(null)
    onClose()
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setError(null)

    const passwordSnapshot = password
    // Drop from React state as soon as the request starts.
    setPassword('')

    try {
      const result = await requestAccountDeletion(passwordSnapshot)
      if (result.status === 'completed') {
        // Hard navigation is performed inside the service.
        return
      }
      setError(result.error.message)
      setConfirmation('')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Usuń konto na zawsze"
      description="Tej operacji nie można cofnąć."
      onClose={handleClose}
      busy={submitting}
      showClose={!submitting}
      size="md"
      mobilePresentation="sheet"
      cancelLabel="Anuluj"
      onCancel={handleClose}
      primaryAction={
        <Button
          type="submit"
          form={formId}
          variant="danger"
          size="md"
          disabled={!canSubmit}
          aria-disabled={!canSubmit}
          data-testid="account-deletion-confirm"
        >
          {submitting ? 'Usuwanie konta…' : 'Usuń konto na zawsze'}
        </Button>
      }
    >
      <form
        id={formId}
        className={styles.form}
        onSubmit={(e) => {
          void onSubmit(e)
        }}
        noValidate
        data-testid="account-deletion-form"
      >
        <p className={styles.summary}>
          Usunięcie konta trwale usuwa dostęp do OurWed oraz dane zapisane w ramach
          tego konta.
        </p>
        <ul className={styles.list}>
          <li>Śluby, sesje i dane CRM powiązane z kontem zostaną usunięte.</li>
          <li>
            Ankiety oraz publiczne linki do ankiet i formularzy przestaną działać.
          </li>
          <li>
            Dokumenty wygenerowane i przechowywane w koncie zostaną usunięte.
          </li>
          <li>Utracisz dostęp do logowania i historii konta.</li>
        </ul>

        <div className={styles.fields}>
          <Input
            id={`${formId}-password`}
            label="Hasło"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            data-testid="account-deletion-password"
          />

          <div>
            <p className={styles.confirmHint} id={`${formId}-confirm-hint`}>
              Wpisz <strong>{ACCOUNT_DELETION_CONFIRMATION_PHRASE}</strong>, aby
              potwierdzić.
            </p>
            <Input
              id={`${formId}-confirm`}
              label="Potwierdzenie"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={submitting}
              aria-describedby={`${formId}-confirm-hint`}
              data-testid="account-deletion-confirmation"
            />
          </div>
        </div>

        {error ? (
          <p
            id={errorId}
            className={styles.error}
            role="alert"
            data-testid="account-deletion-error"
          >
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
