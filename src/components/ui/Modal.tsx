import { useId, useRef, type ReactNode } from 'react'
import { IconClose } from '@/components/icons'
import { Backdrop } from '@/components/ui/Backdrop'
import { Button } from '@/components/ui/Button'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { useOverlay } from '@/components/ui/overlay/useOverlay'
import styles from './Modal.module.css'

interface ModalProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  /** Footer primary action (right). */
  primaryAction?: ReactNode
  /** Footer cancel / secondary (left). Defaults to Anuluj. */
  cancelLabel?: string
  /** Hide the default footer (cancel + primary). */
  hideFooter?: boolean
  /** Optional header close button. */
  showClose?: boolean
  /** Disable close + cancel while saving. */
  busy?: boolean
  /** Wider content for richer forms. */
  size?: 'md' | 'lg' | 'auth'
  /** Mobile presentation: bottom sheet (default) or centered. */
  mobilePresentation?: 'sheet' | 'center'
}

/**
 * Application modal — portal + frosted backdrop + focus trap.
 * Used for studio actions and landing auth overlays.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  primaryAction,
  cancelLabel = 'Anuluj',
  hideFooter = false,
  showClose = false,
  busy = false,
  size = 'md',
  mobilePresentation = 'sheet',
}: ModalProps) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useOverlay({ open, onClose, busy, panelRef })

  if (!open) return null

  return (
    <ModalPortal>
      <div
        className={`${styles.root} ${mobilePresentation === 'center' ? styles.centerMobile : ''}`.trim()}
        role="presentation"
      >
        <Backdrop
          disabled={busy}
          onClick={() => {
            if (!busy) onClose()
          }}
        />
        <div
          ref={panelRef}
          className={`${styles.panel} ${styles[size]}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
        >
          <div className={styles.handle} aria-hidden />
          <header className={styles.header}>
            <div className={styles.headerText}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {description ? (
                <p id={descId} className={styles.description}>
                  {description}
                </p>
              ) : null}
            </div>
            {showClose ? (
              <button
                type="button"
                className={styles.close}
                aria-label="Zamknij"
                disabled={busy}
                onClick={onClose}
              >
                <IconClose width={18} height={18} />
              </button>
            ) : null}
          </header>

          <div className={styles.body}>{children}</div>

          {!hideFooter ? (
            <footer className={styles.footer}>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={busy}
              >
                {cancelLabel}
              </Button>
              <div className={styles.primary}>{primaryAction}</div>
            </footer>
          ) : null}
        </div>
      </div>
    </ModalPortal>
  )
}
