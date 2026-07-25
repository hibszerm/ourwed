import { Button } from '@/components/ui/Button'
import { Backdrop } from '@/components/ui/Backdrop'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { useOverlay } from '@/components/ui/overlay/useOverlay'
import { useId, useRef } from 'react'
import styles from './DiscardChangesDialog.module.css'

interface DiscardChangesDialogProps {
  open: boolean
  onStay: () => void
  onDiscard: () => void
}

/** Unsaved-changes confirm for V2 (and shared) wedding editors. */
export function DiscardChangesDialog({
  open,
  onStay,
  onDiscard,
}: DiscardChangesDialogProps) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  useOverlay({ open, onClose: onStay, panelRef })

  if (!open) return null

  return (
    <ModalPortal>
      <div className={styles.root} role="presentation" data-testid="discard-changes-dialog">
        <Backdrop onClick={onStay} />
        <div
          ref={panelRef}
          className={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
        >
          <h2 id={titleId} className={styles.title}>
            Porzucić zmiany?
          </h2>
          <p id={descId} className={styles.description}>
            Niezapisane zmiany zostaną utracone.
          </p>
          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={onStay}>
              Wróć do edycji
            </Button>
            <Button type="button" variant="danger" onClick={onDiscard}>
              Porzuć zmiany
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
