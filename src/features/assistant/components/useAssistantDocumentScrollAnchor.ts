/**
 * Phase 2K.3 — while mobile Assistant is open, keep document at opening scroll.
 * Event-driven only (no rAF loop). Does not blur or remount the textarea.
 */
import { useLayoutEffect, useRef } from 'react'
import {
  ASSISTANT_DOCUMENT_SCROLL_TOLERANCE_PX,
  captureDocumentScrollAnchor,
  documentScrollDrifted,
  readDocumentScroll,
  restoreDocumentScrollAnchor,
  type DocumentScrollAnchor,
} from './assistantDocumentScrollAnchor'

export function useAssistantDocumentScrollAnchor(enabled: boolean): void {
  const anchorRef = useRef<DocumentScrollAnchor | null>(null)
  const restoringRef = useRef(false)

  useLayoutEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      anchorRef.current = null
      return
    }

    anchorRef.current = captureDocumentScrollAnchor(window)

    const restoreIfNeeded = () => {
      const anchor = anchorRef.current
      if (!anchor || restoringRef.current) return
      const current = readDocumentScroll(window)
      if (!documentScrollDrifted(anchor, current, ASSISTANT_DOCUMENT_SCROLL_TOLERANCE_PX)) {
        return
      }
      restoringRef.current = true
      try {
        restoreDocumentScrollAnchor(anchor, window)
      } finally {
        // Allow the next real Safari scroll after our restore settles.
        queueMicrotask(() => {
          restoringRef.current = false
        })
      }
    }

    // Capture phase — Safari focus-scroll hits window + document.
    window.addEventListener('scroll', restoreIfNeeded, true)
    document.addEventListener('scroll', restoreIfNeeded, true)
    // Also catch late focus-reveal scrolls that fire after VV resize.
    window.addEventListener('resize', restoreIfNeeded)
    const vv = window.visualViewport
    vv?.addEventListener('scroll', restoreIfNeeded)
    vv?.addEventListener('resize', restoreIfNeeded)

    // One immediate check in case scroll already drifted before listeners attached.
    restoreIfNeeded()

    return () => {
      window.removeEventListener('scroll', restoreIfNeeded, true)
      document.removeEventListener('scroll', restoreIfNeeded, true)
      window.removeEventListener('resize', restoreIfNeeded)
      vv?.removeEventListener('scroll', restoreIfNeeded)
      vv?.removeEventListener('resize', restoreIfNeeded)
      // On close: restore opening position once more (bodyLock unlock also restores).
      const anchor = anchorRef.current
      if (anchor) {
        restoreDocumentScrollAnchor(anchor, window)
      }
      anchorRef.current = null
    }
  }, [enabled])
}
