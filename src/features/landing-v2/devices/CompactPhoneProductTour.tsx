import { useEffect, useRef } from 'react'
import {
  animate,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from 'framer-motion'
import { MarketingPhoneLogicalViewport } from '@/features/landing-v2/devices/MarketingPhoneLogicalViewport'
import { MobileOurWedApp } from '@/features/landing-v2/mobile-story/app/MobileOurWedApp'
import { phoneSettled } from '@/features/landing-v2/mobile-story/mobileStoryProgress'
import {
  COMPACT_PHONE_TOUR_DURATION_S,
  COMPACT_PHONE_TOUR_SETTLE_DELAY_MS,
  appProgressAtTourNormalized,
} from '@/features/landing-v2/devices/compactPhoneProductTourTiming'

export {
  COMPACT_PHONE_TOUR_DURATION_S,
  COMPACT_PHONE_TOUR_SETTLE_DELAY_MS,
  COMPACT_PHONE_TOUR_SEGMENTS,
  appProgressAtTourElapsedMs,
  appProgressAtTourNormalized,
} from '@/features/landing-v2/devices/compactPhoneProductTourTiming'

type Props = {
  theaterProgress: MotionValue<number>
  reducedMotion?: boolean
}

/**
 * Compact phone product tour — desktop MobileOurWedApp choreography with
 * segment-remapped autonomous timing (3F.2 frozen) + canonical logical viewport (3F.3).
 */
export function CompactPhoneProductTour({
  theaterProgress,
  reducedMotion = false,
}: Props) {
  const masterT = useMotionValue(0)
  const tourProgress = useTransform(masterT, (t) => appProgressAtTourNormalized(Number(t)))
  const controlsRef = useRef<AnimationPlaybackControls | null>(null)
  const delayRef = useRef<number | null>(null)
  const settledRef = useRef(false)
  const nearRef = useRef(true)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const stopTour = (reset: boolean) => {
    if (delayRef.current != null) {
      window.clearTimeout(delayRef.current)
      delayRef.current = null
    }
    controlsRef.current?.stop()
    controlsRef.current = null
    if (reset) {
      masterT.set(0)
      settledRef.current = false
    }
  }

  const startTour = () => {
    stopTour(true)
    settledRef.current = true
    masterT.set(0)
    delayRef.current = window.setTimeout(() => {
      delayRef.current = null
      controlsRef.current = animate(masterT, 1, {
        duration: COMPACT_PHONE_TOUR_DURATION_S,
        ease: 'linear',
      })
    }, COMPACT_PHONE_TOUR_SETTLE_DELAY_MS)
  }

  useMotionValueEvent(theaterProgress, 'change', (p) => {
    if (reducedMotion) return
    const settled = phoneSettled(p)
    if (settled && !settledRef.current && nearRef.current) {
      startTour()
    }
    if (!settled && settledRef.current && p < 0.55) {
      stopTour(true)
    }
  })

  useEffect(() => {
    if (reducedMotion) {
      masterT.set(1)
      return
    }

    if (phoneSettled(theaterProgress.get()) && nearRef.current && !settledRef.current) {
      startTour()
    }

    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      return () => {
        stopTour(true)
      }
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        const ratio = entry?.intersectionRatio ?? 0
        if (ratio < 0.05 && nearRef.current) {
          nearRef.current = false
          stopTour(true)
          return
        }
        if (ratio >= 0.2 && !nearRef.current) {
          nearRef.current = true
          if (phoneSettled(theaterProgress.get()) && !settledRef.current) {
            startTour()
          }
        }
      },
      {
        root: null,
        threshold: [0, 0.05, 0.2, 0.5, 1],
        rootMargin: '10% 0px 10% 0px',
      },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      stopTour(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion])

  return (
    <div
      ref={rootRef}
      data-compact-phone-tour=""
      data-testid="lv2-compact-phone-tour"
      data-phone-tour-engine="mobile-ourwed-app"
      data-phone-tour-duration-s={String(COMPACT_PHONE_TOUR_DURATION_S)}
      data-phone-tour-remap="segments"
      data-phone-logical-viewport="canonical"
      style={{ width: '100%', height: '100%' }}
    >
      <MarketingPhoneLogicalViewport>
        <MobileOurWedApp
          appProgress={tourProgress}
          staticMode={reducedMotion}
        />
      </MarketingPhoneLogicalViewport>
    </div>
  )
}
