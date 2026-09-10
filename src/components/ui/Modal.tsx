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
  /** Cancel button variant. Default `ghost` preserves existing modals. */
  cancelVariant?: 'ghost' | 'secondary'
  /** Override cancel button handler (defaults to onClose). */
  onCancel?: () => void
  /** Hide the default footer (cancel + primary). */
  hideFooter?: boolean
  /** Optional header close button. */
  showClose?: boolean
  /** Disable close + cancel while saving. */
  busy?: boolean
  /** Wider content for richer forms. `story` = editorial journey (~700px). `document` = large contract preview shell. */
  size?: 'md' | 'lg' | 'auth' | 'story' | 'document'
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
  /**
   * Entrance motion. `settle` = longer premium fade/rise for discovery-style overlays.
   * Does not change overlay lifecycle — only CSS animation class.
   */
  entrance?: 'default' | 'settle'
  /** Extra classes on the dialog panel (surface polish). */
  panelClassName?: string
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
  cancelVariant = 'ghost',
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
  entrance = 'default',
  panelClassName,
}: ModalProps) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const isDocument = size === 'document'
  const settle = entrance === 'settle'

  useOverlay({ open, onClose, busy, panelRef, initialFocus })

  if (!open) return null

  const panelClasses = [
    styles.panel,
    styles[size],
    settle ? styles.panelSettle : '',
    panelClassName,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <ModalPortal>
      <div
        className={`${styles.root} ${mobilePresentation === 'center' || isDocument ? styles.centerMobile : ''} ${isDocument ? styles.documentRoot : ''}`.trim()}
        role="presentation"
      >
        <Backdrop
          entrance={entrance}
          disabled={busy}
          onClick={() => {
            if (!busy) onClose()
          }}
        />
        <div
          ref={panelRef}
          className={panelClasses}
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
                variant={cancelVariant}
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
