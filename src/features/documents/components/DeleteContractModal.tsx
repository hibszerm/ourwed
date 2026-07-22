import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import styles from '../DocumentsTemplates.module.css'

interface DeleteContractModalProps {
  open: boolean
  contractName: string
  busy?: boolean
  onClose: () => void
  onConfirm: () => void
}

export function DeleteContractModal({
  open,
  contractName,
  busy = false,
  onClose,
  onConfirm,
}: DeleteContractModalProps) {
  return (
    <Modal
      open={open}
      title="Usuń kontrakt"
      description={`Usunąć „${contractName}”?`}
      onClose={onClose}
      busy={busy}
      showClose
      primaryAction={
        <Button
          type="button"
          variant="primary"
          disabled={busy}
          onClick={onConfirm}
          className={styles.deleteConfirmBtn}
        >
          {busy ? 'Usuwanie…' : 'Usuń'}
        </Button>
      }
    >
      <div className={styles.deleteModalBody}>
        <p className={styles.deleteModalLead}>
          Usunięcie tego kontraktu usunie również:
        </p>
        <ul className={styles.deleteModalList}>
          <li>analizę AI</li>
          <li>wygenerowany typ ankiety</li>
          <li>mapowania</li>
          <li>dane AI w pamięci podręcznej</li>
        </ul>
        <p className={styles.deleteModalWarn}>Tej operacji nie można cofnąć.</p>
      </div>
    </Modal>
  )
}
