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
      title="Usuń umowę"
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
          Usunięcie tej umowy usunie również przygotowaną ankietę i powiązane
          dane.
        </p>
        <p className={styles.deleteModalWarn}>Tej operacji nie można cofnąć.</p>
      </div>
    </Modal>
  )
}
