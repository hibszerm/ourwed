import { useNavigate } from 'react-router-dom'
import { Modal } from '@/components/ui/Modal'
import styles from './AddAssignmentDialog.module.css'

export interface AddAssignmentDialogProps {
  open: boolean
  onClose: () => void
  /** Optional YYYY-MM-DD prefill for create routes. */
  dateKey?: string | null
}

export function AddAssignmentDialog({
  open,
  onClose,
  dateKey,
}: AddAssignmentDialogProps) {
  const navigate = useNavigate()

  function go(path: string) {
    onClose()
    navigate(path)
  }

  const weddingPath = dateKey
    ? `/sluby/nowy?date=${encodeURIComponent(dateKey)}`
    : '/sluby/nowy'
  const sessionPath = dateKey
    ? `/sesje/nowa?date=${encodeURIComponent(dateKey)}`
    : '/sesje/nowa'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Dodaj zlecenie"
      description="Wybierz rodzaj zlecenia, które chcesz dodać."
      showClose
      size="md"
      mobilePresentation="center"
      hideFooter
    >
      <div className={styles.choices} role="list">
        <button
          type="button"
          className={styles.choice}
          role="listitem"
          onClick={() => go(weddingPath)}
        >
          <span className={styles.choiceTitle}>Ślub</span>
          <span className={styles.choiceDesc}>
            Pełna obsługa z umową, płatnościami i przygotowaniami.
          </span>
        </button>
        <button
          type="button"
          className={styles.choice}
          role="listitem"
          onClick={() => go(sessionPath)}
        >
          <span className={styles.choiceTitle}>Sesja</span>
          <span className={styles.choiceDesc}>
            Szybkie zlecenie z terminem, lokalizacją i rozliczeniem.
          </span>
        </button>
      </div>
    </Modal>
  )
}
