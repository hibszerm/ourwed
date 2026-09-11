import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import styles from '../DocumentsTemplates.module.css'

interface DeleteContractModalProps {
  open: boolean
  contractName: string
  busy?: boolean
  onClose: () => void
  onConfirm: () => void
}

export const TEMPLATE_DELETE_PHRASE = 'USUŃ'

/**
 * Typed confirmation for permanent document-template deletion.
 * Used by DocumentTemplateDetailPage and DocumentTemplatesPage.
 * Mutation stays in the caller — this modal only gates confirmation.
 */
export function DeleteContractModal({
  open,
  contractName,
  busy = false,
  onClose,
  onConfirm,
}: DeleteContractModalProps) {
  const [confirmText, setConfirmText] = useState('')
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setConfirmText('')
  }
  const canConfirm = confirmText === TEMPLATE_DELETE_PHRASE

  function handleClose() {
    if (busy) return
    setConfirmText('')
    onClose()
  }

  function handleConfirm() {
    if (busy || confirmText !== TEMPLATE_DELETE_PHRASE) return
    onConfirm()
  }

  return (
    <Modal
      open={open}
      title="Usuń szablon dokumentu?"
      description={
        contractName.trim()
          ? `Szablon „${contractName.trim()}” zostanie usunięty na zawsze.`
          : 'Szablon zostanie usunięty na zawsze.'
      }
      onClose={handleClose}
      busy={busy}
      showClose
      primaryAction={
        <Button
          type="button"
          variant="danger"
          disabled={busy || !canConfirm}
          onClick={handleConfirm}
          className={styles.deleteConfirmBtn}
          data-testid="template-delete-confirm"
        >
          {busy ? 'Usuwanie…' : 'Usuń na zawsze'}
        </Button>
      }
    >
      <div className={styles.deleteModalBody}>
        <p className={styles.deleteModalLead}>
          Usunięcie jest trwałe. Powiązana ankieta i jej dane zostaną usunięte.
          Pakiety przestaną wskazywać ten szablon. Jeśli szablon jest używany
          przez istniejące szkice umów, usunięcie może się nie udać.
        </p>
        <Input
          label="Aby potwierdzić trwałe usunięcie, wpisz USUŃ."
          value={confirmText}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          onChange={(e) => setConfirmText(e.target.value)}
          data-testid="template-delete-confirm-input"
        />
      </div>
    </Modal>
  )
}
