import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Backdrop } from '@/components/ui/Backdrop'
import { IconClose } from '@/components/icons'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { useOverlay } from '@/components/ui/overlay/useOverlay'
import { useEffect, useId, useRef, useState } from 'react'
import styles from './WeddingEditDrawerV2.module.css'

interface WeddingEditDrawerV2Props {
  open: boolean
  title: string
  description?: string
  busy?: boolean
  onClose: () => void
  onSave: () => void
  children: ReactNode
  /** Hide draft save for location-only editors (save happens on place select). */
  hideSave?: boolean
  saveLabel?: string
}

/**
 * V2-native edit shell — workspace stays mounted behind the panel.
 * Desktop: wide right drawer. Mobile: full-screen sheet.
 */
export function WeddingEditDrawerV2({
  open,
  title,
  description,
  busy = false,
  onClose,
  onSave,
  children,
  hideSave = false,
  saveLabel = 'Zapisz zmiany',
}: WeddingEditDrawerV2Props) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  /**
   * Opening from a control that sits under the frosted backdrop (Overview /
   * Wedding Day "Edytuj lokalizacje") mounts this drawer in the same click
   * turn. Without a short arming delay, that generating click hits the
   * backdrop and immediately closes the drawer — looks like "edit does nothing".
   * Editability must not depend on verified GeoPlace data; this guard is
   * purely about pointer lifetime.
   *
   * Parent unmounts this drawer when editing ends, so armed state resets on
   * each open via fresh mount (no sync setState in an effect).
   */
  const [backdropDismissArmed, setBackdropDismissArmed] = useState(false)

  useOverlay({ open, onClose, busy, panelRef })

  useEffect(() => {
    if (!open) return
    const armId = window.setTimeout(() => {
      setBackdropDismissArmed(true)
    }, 300)
    return () => window.clearTimeout(armId)
  }, [open])

  if (!open) return null

  return (
    <ModalPortal>
      <div className={styles.root} role="presentation" data-testid="wedding-edit-drawer-v2">
        <Backdrop
          disabled={busy || !backdropDismissArmed}
          onClick={() => {
            if (!busy && backdropDismissArmed) onClose()
          }}
        />
        <div
          ref={panelRef}
          className={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
        >
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
            <button
              type="button"
              className={styles.close}
              aria-label="Zamknij"
              disabled={busy}
              onClick={onClose}
            >
              <IconClose width={18} height={18} />
            </button>
          </header>

          <div className={styles.body}>{children}</div>

          <footer className={styles.footer}>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={onClose}
            >
              Anuluj
            </Button>
            {!hideSave ? (
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={onSave}
              >
                {busy ? 'Zapisywanie…' : saveLabel}
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={onClose}
              >
                Gotowe
              </Button>
            )}
          </footer>
        </div>
      </div>
    </ModalPortal>
  )
}
