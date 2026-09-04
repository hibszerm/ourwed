import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Backdrop } from '@/components/ui/Backdrop'
import { IconClose } from '@/components/icons'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { useOverlay } from '@/components/ui/overlay/useOverlay'
import { useEffect, useId, useRef, useState } from 'react'
import styles from './WeddingEditDrawerV2.module.css'

export type WeddingEditOverlayPresentation = 'drawer' | 'centered'

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
  /**
   * Classic keeps the right drawer. Modern location editing uses the same
   * overlay primitives in a centered modal (Calendar Quick Preview language).
   */
  presentation?: WeddingEditOverlayPresentation
}

const CENTERED_CLOSE_MS = 200

/**
 * V2-native edit shell — workspace stays mounted behind the panel.
 * Default: wide right drawer. `centered`: Modern modal overlay.
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
  presentation = 'drawer',
}: WeddingEditDrawerV2Props) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const centered = presentation === 'centered'
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
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef<number | null>(null)

  function requestClose() {
    if (busy || closing) return
    if (!centered) {
      onClose()
      return
    }
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => {
      onClose()
      setClosing(false)
    }, CENTERED_CLOSE_MS)
  }

  useOverlay({
    open,
    onClose: requestClose,
    busy,
    panelRef,
  })

  useEffect(() => {
    if (!open) return
    const armId = window.setTimeout(() => {
      setBackdropDismissArmed(true)
    }, 300)
    return () => window.clearTimeout(armId)
  }, [open])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  if (!open) return null

  return (
    <ModalPortal>
      <div
        className={centered ? `${styles.root} ${styles.rootCentered}` : styles.root}
        role="presentation"
        data-testid={centered ? 'modern-places-edit-modal' : 'wedding-edit-drawer-v2'}
        data-presentation={presentation}
        data-closing={closing ? 'true' : 'false'}
      >
        <Backdrop
          disabled={busy || closing || !backdropDismissArmed}
          onClick={() => {
            if (!busy && !closing && backdropDismissArmed) requestClose()
          }}
        />
        <div
          ref={panelRef}
          className={centered ? `${styles.panel} ${styles.panelCentered}` : styles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          tabIndex={centered ? -1 : undefined}
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
              disabled={busy || closing}
              onClick={requestClose}
            >
              <IconClose width={18} height={18} />
            </button>
          </header>

          <div className={styles.body}>{children}</div>

          <footer className={styles.footer}>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || closing}
              onClick={requestClose}
            >
              Anuluj
            </Button>
            {!hideSave ? (
              <Button
                type="button"
                variant="primary"
                disabled={busy || closing}
                onClick={onSave}
              >
                {busy ? 'Zapisywanie…' : saveLabel}
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                disabled={busy || closing}
                onClick={requestClose}
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
