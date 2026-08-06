import { useEffect, useState } from 'react'

export type LandingViewportMode =
  | 'desktop'
  | 'tablet'
  | 'mobile'
  | 'narrowMobile'

const DESKTOP_MIN = 1100
const TABLET_MIN = 769
const NARROW_MAX = 430

function modeFromWidth(width: number): LandingViewportMode {
  if (width >= DESKTOP_MIN) return 'desktop'
  if (width >= TABLET_MIN) return 'tablet'
  if (width <= NARROW_MAX) return 'narrowMobile'
  return 'mobile'
}

/**
 * Stable Landing V3 viewport mode.
 * Desktop (>=1100) must remain pixel-identical; mobile styles only below.
 * SSR-safe: defaults to desktop until measured.
 */
export function useLandingViewportMode(): LandingViewportMode {
  const [mode, setMode] = useState<LandingViewportMode>('desktop')

  useEffect(() => {
    const sync = () => setMode(modeFromWidth(window.innerWidth))
    sync()
    window.addEventListener('resize', sync)
    window.addEventListener('orientationchange', sync)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('orientationchange', sync)
    }
  }, [])

  return mode
}

export function isMobileLandingMode(mode: LandingViewportMode): boolean {
  return mode === 'mobile' || mode === 'narrowMobile'
}
