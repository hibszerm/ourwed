import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import styles from '@/features/weddings/edit/WeddingEdit.module.css'

interface WeddingDangerZoneProps {
  busy?: boolean
  onArchive: () => Promise<void> | void
  onDelete: () => Promise<void> | void
}

export function WeddingDangerZone({
  busy = false,
  onArchive,
  onDelete,
}: WeddingDangerZoneProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const canConfirmDelete = confirmText === 'DELETE'

  async function handleDelete() {
    if (!canConfirmDelete) return
    setDeleting(true)
    try {
      await onDelete()
    } finally {
      setDeleting(false)
    }
  }

  async function handleArchive() {
    setArchiving(true)
    try {
      await onArchive()
    } finally {
      setArchiving(false)
    }
  }

  return (
    <>
      <section className={styles.dangerZone}>
        <h2 className={styles.dangerTitle}>Strefa zagrożenia</h2>
        <p className={styles.dangerText}>
          Archiwizacja zachowuje wszystkie dane. Usunięcie jest nieodwracalne i
          usuwa ślub wraz z powiązanymi rekordami.
        </p>
        <div className={styles.dangerActions}>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || archiving}
            onClick={() => void handleArchive()}
          >
            {archiving ? 'Archiwizowanie…' : 'Archiwizuj ślub'}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={busy || deleting}
            onClick={() => {
              setConfirmText('')
              setDeleteOpen(true)
            }}
          >
            Usuń ślub
          </Button>
        </div>
      </section>

      <Modal
        open={deleteOpen}
        title="Usuń ślub"
        description="Ta operacja jest trwała. Wszystkie powiązane dane zostaną usunięte zgodnie z relacjami w bazie."
        onClose={() => {
          if (!deleting) setDeleteOpen(false)
        }}
        busy={deleting}
        primaryAction={
          <Button
            type="button"
            variant="primary"
            disabled={!canConfirmDelete || deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? 'Usuwanie…' : 'Potwierdź usunięcie'}
          </Button>
        }
      >
        <p className={styles.dangerText}>
          Aby potwierdzić, wpisz dokładnie: <strong>DELETE</strong>
        </p>
        <Input
          className={styles.confirmInput}
          label="Potwierdzenie"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
          disabled={deleting}
        />
      </Modal>
    </>
  )
}
