import { useId, useRef, type ReactNode } from 'react'
import { IconClose } from '@/components/icons'
import { Backdrop } from '@/components/ui/Backdrop'
import { Button } from '@/components/ui/Button'
import { ModalPortal } from '@/components/ui/ModalPortal'
import {
  useOverlay,
  type OverlayInitialFocus,
} from '@/components/ui/overlay/useOverlay'
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
  /** Override cancel button handler (defaults to onClose). */
  onCancel?: () => void
  /** Hide the default footer (cancel + primary). */
  hideFooter?: boolean
  /** Optional header close button. */
  showClose?: boolean
  /** Disable close + cancel while saving. */
  busy?: boolean
  /** Wider content for richer forms. `document` = large contract preview shell. */
  size?: 'md' | 'lg' | 'auth' | 'document'
  /** Mobile presentation: bottom sheet (default) or centered. */
  mobilePresentation?: 'sheet' | 'center'
  /** Extra footer actions between cancel and primary (e.g. secondary save). */
  secondaryAction?: ReactNode
  /** Optional status chip under the title. */
  statusBadge?: ReactNode
  /** Optional actions in the header (right of title, left of close). */
  headerActions?: ReactNode
  /**
   * Initial focus when the dialog opens.
   * Default `first` preserves existing modal behavior.
   * Use `panel` for calm mobile sheets (no keyboard on open).
   */
  initialFocus?: OverlayInitialFocus
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
  onCancel,
  hideFooter = false,
  showClose = false,
  busy = false,
  size = 'md',
  mobilePresentation = 'sheet',
  secondaryAction,
  statusBadge,
  headerActions,
  initialFocus = 'first',
}: ModalProps) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const isDocument = size === 'document'

  useOverlay({ open, onClose, busy, panelRef, initialFocus })

  if (!open) return null

  return (
    <ModalPortal>
      <div
        className={`${styles.root} ${mobilePresentation === 'center' || isDocument ? styles.centerMobile : ''} ${isDocument ? styles.documentRoot : ''}`.trim()}
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
          tabIndex={-1}
        >
          <div className={styles.handle} aria-hidden />
          <header className={`${styles.header} ${isDocument ? styles.documentHeader : ''}`.trim()}>
            <div className={styles.headerText}>
              <div className={styles.titleRow}>
                <h2 id={titleId} className={styles.title}>
                  {title}
                </h2>
                {statusBadge}
              </div>
              {description ? (
                <p id={descId} className={styles.description}>
                  {description}
                </p>
              ) : null}
            </div>
            <div className={styles.headerAside}>
              {headerActions}
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
            </div>
          </header>

          <div
            className={`${styles.body} ${isDocument ? styles.documentBody : ''}`.trim()}
          >
            {children}
          </div>

          {!hideFooter ? (
            <footer
              className={`${styles.footer} ${isDocument ? styles.documentFooter : ''}`.trim()}
            >
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel ?? onClose}
                disabled={busy}
              >
                {cancelLabel}
              </Button>
              <div className={styles.primary}>
                {secondaryAction}
                {primaryAction}
              </div>
            </footer>
          ) : null}
        </div>
      </div>
    </ModalPortal>
  )
}
