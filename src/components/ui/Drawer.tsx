import { useId, useRef, type ReactNode } from 'react'
import { IconClose } from '@/components/icons'
import { Backdrop } from '@/components/ui/Backdrop'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { useOverlay } from '@/components/ui/overlay/useOverlay'
import styles from './Drawer.module.css'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Side the panel slides from. */
  side?: 'right' | 'left'
  /** labelledby override; defaults to generated title id when title set. */
  'aria-label'?: string
}

/**
 * Right (or left) slide-over panel with frosted backdrop.
 * Used for mobile navigation and similar overlays.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  side = 'right',
  'aria-label': ariaLabel,
}: DrawerProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useOverlay({ open, onClose, panelRef })

  if (!open) return null

  return (
    <ModalPortal>
      <div className={styles.root} role="presentation">
        <Backdrop onClick={onClose} />
        <div
          ref={panelRef}
          className={`${styles.panel} ${side === 'left' ? styles.left : styles.right}`}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel ?? title}
          aria-labelledby={title ? titleId : undefined}
        >
            {title ? (
            <header className={styles.header}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              <button
                type="button"
                className={styles.close}
                aria-label="Zamknij"
                onClick={onClose}
              >
                <IconClose width={18} height={18} />
              </button>
            </header>
          ) : null}
          <div className={styles.body}>{children}</div>
        </div>
      </div>
    </ModalPortal>
  )
}
