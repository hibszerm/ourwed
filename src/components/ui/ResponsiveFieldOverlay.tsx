import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  computeFloatingPlacement,
  rectFromElement,
  viewportSize,
  type FloatingPlacementResult,
} from '@/components/ui/floatingPlacement'
import styles from './ResponsiveFieldOverlay.module.css'

export interface ResponsiveFieldOverlayProps {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  children: (placement: FloatingPlacementResult) => ReactNode
  /** Sheet header label (mobile). */
  sheetTitle?: string
  onClose?: () => void
  onReposition?: () => void
  zIndex?: number
  /** Max height for desktop anchored popover. */
  maxMenuHeight?: number
  sheetFraction?: number
}

/**
 * Desktop: anchored floating popover.
 * Mobile: bottom sheet sized to the visual viewport (keyboard-aware).
 */
export function ResponsiveFieldOverlay({
  open,
  anchorRef,
  children,
  sheetTitle = 'Wybierz',
  onClose,
  onReposition,
  zIndex = 1200,
  maxMenuHeight = 280,
  sheetFraction = 0.48,
}: ResponsiveFieldOverlayProps) {
  const titleId = useId()
  const [placement, setPlacement] = useState<FloatingPlacementResult | null>(
    null,
  )

  const update = useCallback(() => {
    const el = anchorRef.current
    if (!el) {
      setPlacement(null)
      return
    }
    setPlacement(
      computeFloatingPlacement(rectFromElement(el), viewportSize(), {
        maxMenuHeight,
        sheetFraction,
      }),
    )
    onReposition?.()
  }, [anchorRef, maxMenuHeight, onReposition, sheetFraction])

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null)
      return
    }
    update()
  }, [open, update])

  useEffect(() => {
    if (!open) return
    const onWin = () => update()
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    window.addEventListener('orientationchange', onWin)
    const vv = window.visualViewport
    vv?.addEventListener('resize', onWin)
    vv?.addEventListener('scroll', onWin)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
      window.removeEventListener('orientationchange', onWin)
      vv?.removeEventListener('resize', onWin)
      vv?.removeEventListener('scroll', onWin)
    }
  }, [open, update])

  useEffect(() => {
    if (!open || placement?.mode !== 'sheet') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, placement?.mode])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !placement || typeof document === 'undefined') return null

  const isSheet = placement.mode === 'sheet'
  const style: CSSProperties = isSheet
    ? {
        position: 'fixed',
        top: placement.top,
        left: placement.left,
        width: placement.width,
        maxHeight: placement.maxHeight,
        zIndex,
      }
    : {
        position: 'fixed',
        top: placement.top,
        left: placement.left,
        width: placement.width,
        maxHeight: placement.maxHeight,
        zIndex,
      }

  return createPortal(
    <>
      {isSheet ? (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Zamknij"
          style={{ zIndex: zIndex - 1 }}
          onClick={() => onClose?.()}
        />
      ) : null}
      <div
        className={isSheet ? styles.sheet : styles.anchored}
        style={style}
        data-floating-portal="true"
        data-overlay-mode={placement.mode}
        role={isSheet ? 'dialog' : undefined}
        aria-modal={isSheet ? true : undefined}
        aria-labelledby={isSheet ? titleId : undefined}
      >
        {isSheet ? (
          <div className={styles.sheetHeader}>
            <p id={titleId} className={styles.sheetTitle}>
              {sheetTitle}
            </p>
            <button
              type="button"
              className={styles.sheetClose}
              onClick={() => onClose?.()}
            >
              Zamknij
            </button>
          </div>
        ) : null}
        <div className={styles.body}>{children(placement)}</div>
      </div>
    </>,
    document.body,
  )
}
