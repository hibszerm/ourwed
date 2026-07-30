import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { IconCheck } from '@/components/icons'
import { contractService } from '@/lib/api/contractService'
import { timelineEventService } from '@/lib/api/timelineEventService'
import { formatDate } from '@/lib/utils/dates'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingContractsModule.module.css'

interface Props {
  wedding: Wedding
  onStatusChanged?: () => void
}

/**
 * Manual business fact: contract signed outside OurWed.
 * Does not regenerate documents or touch calendars/payments.
 */
export function WeddingContractSignedControls({
  wedding,
  onStatusChanged,
}: Props) {
  const { showToast } = useToast()
  const [confirmSign, setConfirmSign] = useState(false)
  const [confirmUnsign, setConfirmUnsign] = useState(false)
  const [busy, setBusy] = useState(false)

  const status = wedding.contract?.status ?? 'none'
  const canSign = status === 'generated' || status === 'sent'
  const isSigned = status === 'signed'

  if (status === 'none') return null

  async function markSigned() {
    setBusy(true)
    try {
      await contractService.updateStatus(wedding.id, 'signed')
      await timelineEventService.create({
        weddingId: wedding.id,
        type: 'contract_signed',
        title: 'Oznaczono umowę jako podpisaną',
        description:
          'Status podpisania zapisany ręcznie w OurWed (podpis poza systemem).',
        systemGenerated: true,
      })
      showToast('Umowa oznaczona jako podpisana.', 'success')
      setConfirmSign(false)
      onStatusChanged?.()
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Nie udało się oznaczyć podpisu.',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  async function unmarkSigned() {
    setBusy(true)
    try {
      const next =
        wedding.contract?.generatedAt || wedding.contract?.status === 'signed'
          ? 'generated'
          : 'none'
      await contractService.updateStatus(wedding.id, next === 'none' ? 'none' : 'generated')
      await timelineEventService.create({
        weddingId: wedding.id,
        type: 'contract_signed',
        title: 'Cofnięto oznaczenie podpisu umowy',
        description:
          'Zmiana dotyczy tylko statusu w OurWed — nie zmienia pliku umowy.',
        systemGenerated: true,
      })
      showToast('Cofnięto oznaczenie podpisu.', 'success')
      setConfirmUnsign(false)
      onStatusChanged?.()
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Nie udało się cofnąć oznaczenia.',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={styles.signedControls}
      data-testid="wedding-contract-signed-controls"
    >
      {isSigned ? (
        <>
          <p className={styles.signedStatus} data-testid="contract-signed-status">
            <IconCheck width={16} height={16} aria-hidden />
            <span>
              Umowa podpisana
              {wedding.contract?.signedAt
                ? ` · podpis oznaczono ${formatDate(wedding.contract.signedAt)}`
                : ''}
            </span>
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="contract-unsign"
            onClick={() => setConfirmUnsign(true)}
          >
            Cofnij oznaczenie
          </Button>
        </>
      ) : canSign ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="contract-mark-signed"
          onClick={() => setConfirmSign(true)}
        >
          Oznacz umowę jako podpisaną
        </Button>
      ) : null}

      <Modal
        open={confirmSign}
        title="Oznacz umowę jako podpisaną"
        description="To zapisuje fakt biznesowy w OurWed. Nie generuje podpisu elektronicznego ani nie zmienia pliku umowy."
        onClose={() => setConfirmSign(false)}
        busy={busy}
        primaryAction={
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={busy}
            data-testid="contract-mark-signed-confirm"
            onClick={() => void markSigned()}
          >
            {busy ? 'Zapisywanie…' : 'Oznacz jako podpisaną'}
          </Button>
        }
      >
        <p>
          Potwierdź, że umowa została podpisana poza OurWed (np. papierowo lub
          innym narzędziem).
        </p>
      </Modal>

      <Modal
        open={confirmUnsign}
        title="Cofnij oznaczenie podpisu"
        description="Zmiana dotyczy tylko statusu w OurWed. Plik umowy pozostaje bez zmian."
        onClose={() => setConfirmUnsign(false)}
        busy={busy}
        primaryAction={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            data-testid="contract-unsign-confirm"
            onClick={() => void unmarkSigned()}
          >
            {busy ? 'Zapisywanie…' : 'Cofnij oznaczenie'}
          </Button>
        }
      >
        <p>Umowa wróci do statusu wygenerowanej.</p>
      </Modal>
    </div>
  )
}
