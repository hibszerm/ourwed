/**
 * Desktop anchored floating popover for field overlays.
 * Mobile full-viewport dialogs use MobileFieldDialog instead.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  onClose?: () => void
  onReposition?: () => void
  zIndex?: number
  maxMenuHeight?: number
  /**
   * Cap desktop popover width so compact content (e.g. month calendar) does
   * not stretch to a full-width field anchor. Omit for menus that should
   * match the anchor (address suggestions).
   */
  maxMenuWidth?: number
  /**
   * When false, body does not scroll — use for compact content that should
   * size naturally (e.g. month calendar). Default true for long suggestion lists.
   */
  scrollBody?: boolean
}

/**
 * Desktop-only anchored popover (portal to document.body).
 * Do not use for mobile — use MobileFieldDialog.
 */
export function ResponsiveFieldOverlay({
  open,
  anchorRef,
  children,
  onClose,
  onReposition,
  zIndex = 1200,
  maxMenuHeight = 280,
  maxMenuWidth,
  scrollBody = true,
}: ResponsiveFieldOverlayProps) {
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
        maxMenuWidth,
        forceSheet: false,
      }),
    )
    onReposition?.()
  }, [anchorRef, maxMenuHeight, maxMenuWidth, onReposition])

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
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [open, update])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !placement || typeof document === 'undefined') return null
  if (placement.mode !== 'anchored') return null

  const style: CSSProperties = {
    position: 'fixed',
    top: placement.top,
    left: placement.left,
    width: placement.width,
    maxHeight: placement.maxHeight,
    zIndex,
  }

  return createPortal(
    <div
      className={styles.anchored}
      style={style}
      data-floating-portal="true"
      data-overlay-mode="anchored"
      data-testid="responsive-field-overlay-anchored"
    >
      <div
        className={scrollBody ? styles.body : styles.bodyNatural}
      >
        {children(placement)}
      </div>
    </div>,
    document.body,
  )
}
