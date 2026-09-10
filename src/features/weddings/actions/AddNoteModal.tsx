import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { weddingActionsService } from '@/lib/api/weddingActionsService'
import { useInvalidateWedding } from '@/features/weddings/hooks/useInvalidateWedding'
import type { Wedding } from '@/types/wedding'
import styles from './AddNoteModal.module.css'
import formStyles from './actionForm.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

interface AddNoteModalProps {
  open: boolean
  onClose: () => void
  wedding: Wedding
}

export function AddNoteModal({ open, onClose, wedding }: AddNoteModalProps) {
  const invalidate = useInvalidateWedding()
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Dodaj notatkę"
      description="Notatka pojawi się na górze listy — widoczna tylko dla Ciebie."
      busy={busy}
      size="md"
      showClose
      mobilePresentation="center"
      primaryAction={
        <Button
          type="submit"
          form="add-note-form"
          variant="primary"
          disabled={busy}
        >
          {busy ? 'Zapisywanie…' : 'Dodaj notatkę'}
        </Button>
      }
    >
      {open ? (
        <AddNoteForm
          key={wedding.id}
          wedding={wedding}
          busy={busy}
          setBusy={setBusy}
          onClose={onClose}
          invalidate={invalidate}
        />
      ) : null}
    </Modal>
  )
}

function AddNoteForm({
  wedding,
  busy,
  setBusy,
  onClose,
  invalidate,
}: {
  wedding: Wedding
  busy: boolean
  setBusy: (v: boolean) => void
  onClose: () => void
  invalidate: (weddingId: string) => Promise<unknown>
}) {
  const [content, setContent] = useState('')
  const [pinned, setPinned] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!content.trim()) {
      setError('Wpisz treść notatki.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await weddingActionsService.addNote({
        weddingId: wedding.id,
        content,
        pinned,
      })
      await invalidate(wedding.id)
      onClose()
    } catch (err) {
      setError(getUserFacingErrorMessage(err, 'Nie udało się dodać notatki.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form id="add-note-form" className={formStyles.form} onSubmit={handleSubmit}>
      <Textarea
        id="note-content"
        label="Notatka"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        required
        disabled={busy}
        placeholder="Np. Ujęcia rodzinne tylko po ceremonii…"
      />
      <label className={styles.pin}>
        <input
          type="checkbox"
          checked={pinned}
          onChange={(e) => setPinned(e.target.checked)}
          disabled={busy}
        />
        <span>Przypnij notatkę</span>
      </label>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </form>
  )
}
