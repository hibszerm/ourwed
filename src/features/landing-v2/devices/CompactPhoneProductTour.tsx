import { useEffect, useRef } from 'react'
import {
  animate,
  useMotionValue,
  useMotionValueEvent,
  type AnimationPlaybackControls,
  type MotionValue,
} from 'framer-motion'
import { MobileOurWedApp } from '@/features/landing-v2/mobile-story/app/MobileOurWedApp'
import { phoneSettled } from '@/features/landing-v2/mobile-story/mobileStoryProgress'
import {
  COMPACT_PHONE_TOUR_DURATION_S,
  COMPACT_PHONE_TOUR_SETTLE_DELAY_MS,
} from '@/features/landing-v2/devices/compactPhoneProductTourTiming'

export {
  COMPACT_PHONE_TOUR_DURATION_S,
  COMPACT_PHONE_TOUR_SETTLE_DELAY_MS,
} from '@/features/landing-v2/devices/compactPhoneProductTourTiming'

type Props = {
  theaterProgress: MotionValue<number>
  reducedMotion?: boolean
}

/**
 * Compact phone product tour — desktop MobileOurWedApp choreography,
 * driven by ONE time-based progress (NOT scroll appProgress, NOT bitmap slideshow).
 */
export function CompactPhoneProductTour({
  theaterProgress,
  reducedMotion = false,
}: Props) {
  const tourProgress = useMotionValue(0)
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
      tourProgress.set(0)
      settledRef.current = false
    }
  }

  const startTour = () => {
    stopTour(true)
    settledRef.current = true
    tourProgress.set(0)
    delayRef.current = window.setTimeout(() => {
      delayRef.current = null
      controlsRef.current = animate(tourProgress, 1, {
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
    /* Meaningful reverse past phone entrance — allow clean replay later. */
    if (!settled && settledRef.current && p < 0.55) {
      stopTour(true)
    }
  })

  useEffect(() => {
    if (reducedMotion) {
      tourProgress.set(1)
      return
    }

    /* Bootstrap if phone already settled when this mounts (no change event yet). */
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
    // theaterProgress / tourProgress are stable MotionValues
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion])

  return (
    <div
      ref={rootRef}
      data-compact-phone-tour=""
      data-testid="lv2-compact-phone-tour"
      data-phone-tour-engine="mobile-ourwed-app"
      data-phone-tour-duration-s={String(COMPACT_PHONE_TOUR_DURATION_S)}
      style={{ width: '100%', height: '100%' }}
    >
      <MobileOurWedApp
        appProgress={tourProgress}
        staticMode={reducedMotion}
      />
    </div>
  )
}
