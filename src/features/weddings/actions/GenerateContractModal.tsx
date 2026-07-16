import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { weddingActionsService } from '@/lib/api/weddingActionsService'
import { useInvalidateWedding } from '@/features/weddings/hooks/useInvalidateWedding'
import type { Wedding } from '@/types/wedding'
import styles from './GenerateContractModal.module.css'

interface GenerateContractModalProps {
  open: boolean
  onClose: () => void
  wedding: Wedding
}

export function GenerateContractModal({
  open,
  onClose,
  wedding,
}: GenerateContractModalProps) {
  const invalidate = useInvalidateWedding()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missingFields, setMissingFields] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setBusy(false)
    setError(null)
    // Preview missing fields without mutating
    const missing: string[] = []
    if (wedding.questionnaires.contractData.status !== 'completed') {
      missing.push('ankieta do umowy nieukończona')
    }
    if (!wedding.couple.email?.trim() && !wedding.couple.partner1Email?.trim()) {
      missing.push('adres e-mail')
    }
    if (!wedding.ceremonyLocation?.trim()) missing.push('miejsce ceremonii')
    if (!wedding.receptionLocation?.trim()) missing.push('miejsce przyjęcia')
    setMissingFields(missing)
  }, [open, wedding])

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await weddingActionsService.generateContract(wedding.id)
      await invalidate(wedding.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wygenerować umowy.')
    } finally {
      setBusy(false)
    }
  }

  const alreadyGenerated =
    wedding.contract.status === 'generated' ||
    wedding.contract.status === 'sent' ||
    wedding.contract.status === 'signed'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generuj umowę"
      description={
        alreadyGenerated
          ? 'Umowa została już wygenerowana. Możesz wygenerować ją ponownie — status pozostanie „Wygenerowana”.'
          : 'Przygotujemy umowę na podstawie danych ślubu. PDF pojawi się w kolejnym sprincie.'
      }
      busy={busy}
      primaryAction={
        <Button
          type="button"
          variant="primary"
          disabled={busy}
          onClick={handleConfirm}
        >
          {busy ? 'Generowanie…' : 'Generuj umowę'}
        </Button>
      }
    >
      {missingFields.length > 0 && (
        <div className={styles.warning} role="status">
          <p className={styles.warningTitle}>Brakuje niektórych danych</p>
          <p className={styles.warningBody}>
            Możesz wygenerować umowę mimo to, ale uzupełnij później:
          </p>
          <ul className={styles.warningList}>
            {missingFields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
      )}
      {missingFields.length === 0 && (
        <p className={styles.ok}>Wszystkie kluczowe dane są uzupełnione.</p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </Modal>
  )
}
