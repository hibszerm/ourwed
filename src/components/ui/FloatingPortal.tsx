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

interface FloatingPortalProps {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  children: (placement: FloatingPlacementResult) => ReactNode
  /** Called when position should refresh (scroll/resize). */
  onReposition?: () => void
  zIndex?: number
}

/**
 * Renders children into document.body with fixed positioning anchored to a ref.
 * Survives parent overflow: hidden (e.g. questionnaire cards).
 */
export function FloatingPortal({
  open,
  anchorRef,
  children,
  onReposition,
  zIndex = 1200,
}: FloatingPortalProps) {
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
      computeFloatingPlacement(rectFromElement(el), viewportSize()),
    )
    onReposition?.()
  }, [anchorRef, onReposition])

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null)
      return
    }
    update()
  }, [open, update])

  useEffect(() => {
    if (!open) return
    const onScroll = () => update()
    const onResize = () => update()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    const vv = window.visualViewport
    vv?.addEventListener('resize', onResize)
    vv?.addEventListener('scroll', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      vv?.removeEventListener('resize', onResize)
      vv?.removeEventListener('scroll', onScroll)
    }
  }, [open, update])

  if (!open || !placement || typeof document === 'undefined') return null

  // FloatingPortal is desktop-anchored; force anchored metrics if a narrow
  // viewport would otherwise select dialog mode (callers should use MobileFieldDialog).
  const style: CSSProperties = {
    position: 'fixed',
    top: placement.top,
    left: placement.left,
    width: placement.width,
    maxHeight: placement.maxHeight,
    zIndex,
    boxSizing: 'border-box',
  }

  return createPortal(
    <div
      data-floating-portal="true"
      data-placement={placement.placement}
      data-overlay-mode={placement.mode}
      style={style}
    >
      {children(placement)}
    </div>,
    document.body,
  )
}
