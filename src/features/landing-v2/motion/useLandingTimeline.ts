import { useLayoutEffect, useRef, useState } from 'react'
import {
  createLandingTimeline,
  sampleLandingFrame,
  type LandingFrameState,
} from './createLandingTimeline'
import { usePrefersReducedMotion } from './useMedia'

/**
 * Binds one master ScrollTrigger timeline to the cinematic stage.
 * React state updates are throttled to discrete visual changes.
 */
export function useLandingTimeline() {
  const reduced = usePrefersReducedMotion()
  const triggerRef = useRef<HTMLElement | null>(null)
  const pinRef = useRef<HTMLDivElement | null>(null)
  const [frame, setFrame] = useState<LandingFrameState>(() =>
    sampleLandingFrame(reduced ? 0.32 : 0),
  )
  const lastKey = useRef('')

  useLayoutEffect(() => {
    const trigger = triggerRef.current
    const pin = pinRef.current
    if (!trigger || !pin) return

    return createLandingTimeline({
      trigger,
      pin,
      reducedMotion: reduced,
      onUpdate: (next) => {
        const key = [
          next.phase,
          next.desktopBeat,
          next.contractBeat,
          next.mobileBeat,
          Math.round(next.lid * 24),
          Math.round(next.morph * 32),
          Math.round(next.screenOn * 16),
          Math.round(next.camRx * 2),
          Math.round(next.camRy * 2),
          Math.round(next.camScale * 40),
          Math.round(next.camTx / 4),
          Math.round(next.camTy / 4),
          Math.round(next.heroOpacity * 8),
          Math.round(next.copyOpacity * 8),
          next.copyTitle,
          Math.round(next.navDraw * 12),
          next.checklistDone ? 1 : 0,
          Math.round(next.syncReveal * 12),
          Math.round(next.ctaReveal * 12),
          next.showDual ? 1 : 0,
        ].join('|')
        if (key === lastKey.current) return
        lastKey.current = key
        setFrame(next)
      },
    })
  }, [reduced])

  return { triggerRef, pinRef, frame, reduced }
}
