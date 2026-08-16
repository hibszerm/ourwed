import { useEffect, useRef, type RefObject } from 'react'
import {
  lockBodyScroll,
  setAppInert,
  unlockBodyScroll,
} from '@/components/ui/overlay/bodyLock'

export const OVERLAY_FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(OVERLAY_FOCUSABLE),
  ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
}

/** Nested field popovers (address/date) own Escape while open. */
function hasNestedFieldOverlayOpen(): boolean {
  if (typeof document === 'undefined') return false
  return Boolean(
    document.querySelector('[data-floating-portal="true"]') ||
      document.querySelector('[data-testid="location-mobile-address-dialog"]') ||
      document.querySelector(
        '[data-testid="mobile-field-dialog"][data-overlay-mode="dialog"]',
      ),
  )
}

export type OverlayInitialFocus = 'first' | 'panel'

interface UseOverlayOptions {
  open: boolean
  onClose: () => void
  /** When true, Escape / backdrop close are ignored. */
  busy?: boolean
  /** Panel that receives focus trap. */
  panelRef: RefObject<HTMLElement | null>
  /** Close on Escape (default true). */
  closeOnEscape?: boolean
  /**
   * Where to place focus when the overlay opens.
   * - `first` (default): `data-autofocus` target, else first focusable
   * - `panel`: dialog container (no input keyboard on mobile open)
   */
  initialFocus?: OverlayInitialFocus
}

/**
 * Body scroll lock, app inert, focus trap, Escape, restore focus.
 */
export function useOverlay({
  open,
  onClose,
  busy = false,
  panelRef,
  closeOnEscape = true,
  initialFocus = 'first',
}: UseOverlayOptions): void {
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null
    lockBodyScroll()
    setAppInert(true)

    const panel = panelRef.current
    const focusables = panel ? getFocusable(panel) : []
    const marked = focusables.find(
      (el) => el.getAttribute('data-autofocus') === 'true',
    )
    const initial =
      initialFocus === 'panel'
        ? panel
        : (marked ?? focusables[0] ?? panel)
    // Defer so portal content is mounted.
    const focusId = window.requestAnimationFrame(() => {
      initial?.focus()
    })

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && closeOnEscape && !busy) {
        // Let LocationSearchField / date overlays dismiss first — do not close
        // the host drawer/modal on the same Escape keypress.
        if (hasNestedFieldOverlayOpen()) return
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) return

      const nodes = getFocusable(panelRef.current)
      if (nodes.length === 0) {
        event.preventDefault()
        return
      }

      const first = nodes[0]!
      const last = nodes[nodes.length - 1]!

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.cancelAnimationFrame(focusId)
      document.removeEventListener('keydown', onKeyDown, true)
      unlockBodyScroll()
      setAppInert(false)
      previouslyFocused.current?.focus?.()
    }
  }, [open, busy, closeOnEscape, panelRef, initialFocus])
}
