/**
 * Mobile full-viewport field dialog (visualViewport-aware).
 * Desktop overlays stay in ResponsiveFieldOverlay anchored mode.
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { lockBodyScroll, unlockBodyScroll } from '@/components/ui/bodyScrollLock'
import {
  readVisualViewportBounds,
  subscribeVisualViewport,
  type VisualViewportBounds,
} from '@/components/ui/visualViewportBounds'
import styles from './MobileFieldDialog.module.css'

export interface MobileFieldDialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Sticky footer (e.g. Anuluj / Wybierz). */
  footer?: ReactNode
  /** Optional content between header and scroll body (e.g. search input). */
  headerExtra?: ReactNode
  /** Element to focus when dialog opens. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Element to restore focus to on close. */
  restoreFocusRef?: RefObject<HTMLElement | null>
  zIndex?: number
  /** data-testid for the dialog root. */
  testId?: string
}

export function MobileFieldDialog({
  open,
  title,
  onClose,
  children,
  footer,
  headerExtra,
  initialFocusRef,
  restoreFocusRef,
  zIndex = 1300,
  testId = 'mobile-field-dialog',
}: MobileFieldDialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)
  const [bounds, setBounds] = useState<VisualViewportBounds>(() =>
    readVisualViewportBounds(),
  )

  useLayoutEffect(() => {
    if (!open) return
    setBounds(readVisualViewportBounds())
    return subscribeVisualViewport(setBounds)
  }, [open])

  useEffect(() => {
    if (!open) return
    lockBodyScroll()
    return () => unlockBodyScroll()
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      const target = initialFocusRef?.current ?? dialogRef.current
      target?.focus?.()
    }, 30)
    return () => window.clearTimeout(t)
  }, [open, initialFocusRef])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      return
    }
    if (!wasOpenRef.current) return
    wasOpenRef.current = false
    const el = restoreFocusRef?.current
    if (!el) return
    const t = window.setTimeout(() => el.focus?.(), 0)
    return () => window.clearTimeout(t)
  }, [open, restoreFocusRef])

  if (!open || typeof document === 'undefined') return null

  const style: CSSProperties = {
    position: 'fixed',
    top: bounds.top,
    left: bounds.left,
    width: bounds.width,
    height: bounds.height,
    zIndex,
    // CSS custom props for nested layout
    ['--visual-viewport-height' as string]: `${bounds.height}px`,
    ['--visual-viewport-top' as string]: `${bounds.top}px`,
  }

  return createPortal(
    <div
      ref={dialogRef}
      className={styles.dialog}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-overlay-mode="dialog"
      data-testid={testId}
      tabIndex={-1}
    >
      <header className={styles.header}>
        <p id={titleId} className={styles.title}>
          {title}
        </p>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
        >
          Zamknij
        </button>
      </header>
      {headerExtra ? <div className={styles.headerExtra}>{headerExtra}</div> : null}
      <div className={styles.body}>{children}</div>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </div>,
    document.body,
  )
}
