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

interface UseOverlayOptions {
  open: boolean
  onClose: () => void
  /** When true, Escape / backdrop close are ignored. */
  busy?: boolean
  /** Panel that receives focus trap. */
  panelRef: RefObject<HTMLElement | null>
  /** Close on Escape (default true). */
  closeOnEscape?: boolean
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
}: UseOverlayOptions): void {
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null
    lockBodyScroll()
    setAppInert(true)

    const panel = panelRef.current
    const focusables = panel ? getFocusable(panel) : []
    const initial =
      focusables.find((el) => el.getAttribute('data-autofocus') === 'true') ??
      focusables[0]
    // Defer so portal content is mounted.
    const focusId = window.requestAnimationFrame(() => {
      initial?.focus()
    })

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && closeOnEscape && !busy) {
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
  }, [open, busy, closeOnEscape, panelRef])
}
