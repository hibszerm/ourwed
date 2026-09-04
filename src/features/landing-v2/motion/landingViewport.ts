import { useEffect, useState } from 'react'

/** Shared compact breakpoint for Landing V2 theaters. */
export const LANDING_COMPACT_MAX_WIDTH_PX = 1100

export const LANDING_COMPACT_MEDIA_QUERY = `(max-width: ${LANDING_COMPACT_MAX_WIDTH_PX}px)`

/**
 * Viewport width only — geometry / scale / scroll distance.
 * Must NOT be treated as reduced-motion.
 */
export function useLandingCompactViewport(): boolean {
  const [isCompactViewport, setIsCompactViewport] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(LANDING_COMPACT_MEDIA_QUERY)
    const sync = () => setIsCompactViewport(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return isCompactViewport
}
