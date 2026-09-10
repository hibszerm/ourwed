import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { LikelyDuplicateWedding } from '@/lib/weddings/findLikelyWeddingDuplicates'
import { formatDate } from '@/lib/utils/dates'
import styles from './LikelyDuplicateWarningModal.module.css'

type Props = {
  open: boolean
  candidates: LikelyDuplicateWedding[]
  busy?: boolean
  onClose: () => void
  onContinue: () => void
  onOpenExisting: (weddingId: string) => void
}

/**
 * Soft duplicate warning — never a hard block.
 * Manual create + Path B approve.
 */
export function LikelyDuplicateWarningModal({
  open,
  candidates,
  busy = false,
  onClose,
  onContinue,
  onOpenExisting,
}: Props) {
  return (
    <Modal
      open={open}
      title="Możliwe, że to zlecenie już istnieje"
      description="Znaleziono podobne zlecenie. Sprawdź je, zanim utworzysz kolejne."
      onClose={onClose}
      busy={busy}
      size="md"
      mobilePresentation="center"
      cancelLabel="Anuluj"
      primaryAction={
        <Button
          type="button"
          variant="primary"
          disabled={busy}
          onClick={onContinue}
        >
          Utwórz mimo to
        </Button>
      }
    >
      <ul className={styles.list} data-testid="likely-duplicate-list">
        {candidates.map((c) => (
          <li key={c.weddingId} className={styles.item}>
            <div className={styles.copy}>
              <p className={styles.name}>{c.displayName}</p>
              <p className={styles.meta}>
                {c.weddingDate ? formatDate(c.weddingDate) : 'Bez daty'}
                {c.reasons.length > 0 ? ` · ${c.reasons.join(', ')}` : ''}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => onOpenExisting(c.weddingId)}
            >
              Otwórz istniejące
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
