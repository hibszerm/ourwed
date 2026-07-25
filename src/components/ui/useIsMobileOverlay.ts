/**
 * Reactive mobile overlay breakpoint (< 640px by default).
 */

import { useEffect, useState } from 'react'
import {
  isMobileOverlayViewport,
  MOBILE_OVERLAY_BREAKPOINT,
  viewportWidth,
} from '@/components/ui/floatingPlacement'

export function useIsMobileOverlay(
  breakpoint = MOBILE_OVERLAY_BREAKPOINT,
): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window === 'undefined'
      ? false
      : viewportWidth() < breakpoint,
  )

  useEffect(() => {
    function update() {
      setMobile(isMobileOverlayViewport(viewportWidth()))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    const vv = window.visualViewport
    vv?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      vv?.removeEventListener('resize', update)
    }
  }, [breakpoint])

  return mobile
}
