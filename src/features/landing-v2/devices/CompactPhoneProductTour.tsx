import { useEffect, useRef, useState } from 'react'
import {
  animate,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from 'framer-motion'
import { MarketingPhoneLogicalViewport } from '@/features/landing-v2/devices/MarketingPhoneLogicalViewport'
import { LANDING_DEVICE_ASSETS } from '@/features/landing-v2/devices/landingDeviceAssets'
import { MobileOurWedApp } from '@/features/landing-v2/mobile-story/app/MobileOurWedApp'
import { phoneSettled } from '@/features/landing-v2/mobile-story/mobileStoryProgress'
import { POST_BRIEF_MORPH_START } from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'
import {
  COMPACT_PHONE_TOUR_DURATION_S,
  COMPACT_PHONE_TOUR_SETTLE_DELAY_MS,
  appProgressAtTourNormalized,
} from '@/features/landing-v2/devices/compactPhoneProductTourTiming'
import styles from './CompactPhoneProductTour.module.css'

export {
  COMPACT_PHONE_TOUR_DURATION_S,
  COMPACT_PHONE_TOUR_SETTLE_DELAY_MS,
  COMPACT_PHONE_TOUR_SEGMENTS,
  appProgressAtTourElapsedMs,
  appProgressAtTourNormalized,
} from '@/features/landing-v2/devices/compactPhoneProductTourTiming'

type Props = {
  theaterProgress: MotionValue<number>
  /** When morph begins, freeze the in-phone tour (no concurrent animation). */
  postBriefProgress?: MotionValue<number>
  reducedMotion?: boolean
}

/**
 * Compact phone product tour — desktop MobileOurWedApp choreography with
 * segment-remapped autonomous timing (3F.2 frozen) + canonical logical viewport (3F.3).
 *
 * 3G: freeze tour the instant phone→lock morph starts.
 * 3G.2: invisible live→static Brief screen handoff at morph start so Stage-2
 * geometry morph runs against a flat real-UI capture, not the live app DOM.
 */
export function CompactPhoneProductTour({
  theaterProgress,
  postBriefProgress,
  reducedMotion = false,
}: Props) {
  const masterT = useMotionValue(0)
  const tourProgress = useTransform(masterT, (t) => appProgressAtTourNormalized(Number(t)))
  const controlsRef = useRef<AnimationPlaybackControls | null>(null)
  const delayRef = useRef<number | null>(null)
  const settledRef = useRef(false)
  const nearRef = useRef(true)
  const morphFrozenRef = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [screenFlattened, setScreenFlattened] = useState(false)

  const activateFlatten = () => {
    /* Morph starts after Brief in the intended story — snap to final Brief frame. */
    masterT.set(1)
    setScreenFlattened(true)
    rootRef.current?.setAttribute('data-phone-screen-flattened', 'true')
  }

  const deactivateFlatten = () => {
    setScreenFlattened(false)
    rootRef.current?.setAttribute('data-phone-screen-flattened', 'false')
  }

  const freezeTourInPlace = () => {
    if (delayRef.current != null) {
      window.clearTimeout(delayRef.current)
      delayRef.current = null
    }
    controlsRef.current?.stop()
    controlsRef.current = null
    const alreadyFrozen = morphFrozenRef.current
    morphFrozenRef.current = true
    /* Semantic one-time activation — never setState per scroll frame. */
    if (!alreadyFrozen) activateFlatten()
  }

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
      morphFrozenRef.current = false
      deactivateFlatten()
    }
  }

  const startTour = () => {
    if (morphFrozenRef.current) return
    if (postBriefProgress && postBriefProgress.get() > POST_BRIEF_MORPH_START) {
      morphFrozenRef.current = true
      activateFlatten()
      return
    }
    stopTour(true)
    settledRef.current = true
    masterT.set(0)
    delayRef.current = window.setTimeout(() => {
      delayRef.current = null
      if (morphFrozenRef.current) return
      controlsRef.current = animate(masterT, 1, {
        duration: COMPACT_PHONE_TOUR_DURATION_S,
        ease: 'linear',
      })
    }, COMPACT_PHONE_TOUR_SETTLE_DELAY_MS)
  }

  useMotionValueEvent(theaterProgress, 'change', (p) => {
    if (reducedMotion) return
    if (morphFrozenRef.current) return
    const settled = phoneSettled(p)
    if (settled && !settledRef.current && nearRef.current) {
      startTour()
    }
    if (!settled && settledRef.current && p < 0.55) {
      stopTour(true)
    }
  })

  useMotionValueEvent(postBriefProgress ?? theaterProgress, 'change', (pb) => {
    /* Only postBriefProgress freezes the tour — theaterProgress is a no-op stub. */
    if (!postBriefProgress || reducedMotion) return
    if (pb > POST_BRIEF_MORPH_START) {
      freezeTourInPlace()
      rootRef.current?.setAttribute('data-phone-tour-morph-frozen', 'true')
      return
    }
    if (pb <= 0 && morphFrozenRef.current) {
      morphFrozenRef.current = false
      deactivateFlatten()
      rootRef.current?.setAttribute('data-phone-tour-morph-frozen', 'false')
    }
  })

  useEffect(() => {
    const img = new Image()
    img.src = LANDING_DEVICE_ASSETS.phoneBrief
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      masterT.set(1)
      return
    }

    if (
      phoneSettled(theaterProgress.get()) &&
      nearRef.current &&
      !settledRef.current &&
      !morphFrozenRef.current
    ) {
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
          if (!morphFrozenRef.current) stopTour(true)
          return
        }
        if (ratio >= 0.2 && !nearRef.current) {
          nearRef.current = true
          if (
            !morphFrozenRef.current &&
            phoneSettled(theaterProgress.get()) &&
            !settledRef.current
          ) {
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
      className={styles.root}
      data-compact-phone-tour=""
      data-testid="lv2-compact-phone-tour"
      data-phone-tour-engine="mobile-ourwed-app"
      data-phone-tour-duration-s={String(COMPACT_PHONE_TOUR_DURATION_S)}
      data-phone-tour-remap="segments"
      data-phone-logical-viewport="canonical"
      data-phone-tour-morph-frozen={morphFrozenRef.current ? 'true' : 'false'}
      data-phone-screen-flattened={screenFlattened ? 'true' : 'false'}
      data-phone-morph-surface={screenFlattened ? 'brief-static' : 'live'}
    >
      <div
        className={styles.liveLayer}
        data-phone-live-screen=""
        aria-hidden={screenFlattened}
      >
        <MarketingPhoneLogicalViewport>
          <MobileOurWedApp appProgress={tourProgress} staticMode={reducedMotion} />
        </MarketingPhoneLogicalViewport>
      </div>
      <div className={styles.flatLayer} data-phone-flat-screen="" aria-hidden={!screenFlattened}>
        <img
          className={styles.flatImg}
          src={LANDING_DEVICE_ASSETS.phoneBrief}
          alt=""
          draggable={false}
          decoding="async"
          data-phone-flat-asset="phone-brief"
        />
      </div>
    </div>
  )
}
