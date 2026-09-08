import { useEffect, useRef, useState } from 'react'
import { useMotionValueEvent, type MotionValue } from 'framer-motion'
import {
  phoneLayerSrc,
  type LandingPhoneLayerId,
} from '@/features/landing-v2/devices/landingDeviceAssets'
import {
  PHONE_DEMO_PHASES,
  PHONE_DEMO_SETTLE_DELAY_MS,
  phoneDemoActiveLayerCount,
} from '@/features/landing-v2/devices/flattenedPhoneAutoplaySchedule'
import { phoneSettled } from '@/features/landing-v2/mobile-story/mobileStoryProgress'
import styles from './FlattenedPhoneAppContent.module.css'

type Props = {
  /** Theater progress 0→1 — used only to detect PHONE_SETTLED. */
  theaterProgress: MotionValue<number>
  reducedMotion?: boolean
}

type Visual = {
  a: LandingPhoneLayerId
  b: LandingPhoneLayerId
  blend: number
  stripT: number
  phaseIndex: number
  dual: boolean
}

const REST: Visual = {
  a: 'dashStrip',
  b: 'dashStrip',
  blend: 0,
  stripT: 0,
  phaseIndex: 0,
  dual: false,
}

/**
 * Time-driven compact phone app tour.
 * Starts after phoneSettled + settle delay; pauses/resets when far offscreen.
 * Does not read app/scroll progress for visual state.
 */
export function FlattenedPhoneAutoplay({
  theaterProgress,
  reducedMotion = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [visual, setVisual] = useState<Visual>(REST)
  const [running, setRunning] = useState(false)
  const timersRef = useRef<number[]>([])
  const settledRef = useRef(false)
  const nearRef = useRef(true)
  const generationRef = useRef(0)

  const clearTimers = () => {
    for (const id of timersRef.current) window.clearTimeout(id)
    timersRef.current = []
  }

  const stopAndReset = () => {
    clearTimers()
    generationRef.current += 1
    settledRef.current = false
    setRunning(false)
    setVisual(REST)
  }

  const startTour = () => {
    clearTimers()
    const gen = ++generationRef.current
    setRunning(true)
    setVisual(REST)

    let elapsed = PHONE_DEMO_SETTLE_DELAY_MS
    const schedule = (ms: number, fn: () => void) => {
      const id = window.setTimeout(() => {
        if (generationRef.current !== gen) return
        fn()
      }, ms)
      timersRef.current.push(id)
    }

    PHONE_DEMO_PHASES.forEach((phase, index) => {
      schedule(elapsed, () => {
        setVisual({
          a: phase.a,
          b: phase.b,
          blend: phase.blend,
          stripT: phase.stripT,
          phaseIndex: index,
          dual: phase.a !== phase.b,
        })
      })
      elapsed += phase.ms
    })
  }

  useMotionValueEvent(theaterProgress, 'change', (p) => {
    if (reducedMotion) return
    const settled = phoneSettled(p)
    if (settled && !settledRef.current && nearRef.current) {
      settledRef.current = true
      startTour()
    }
    if (!settled && settledRef.current && p < 0.55) {
      /* Meaningful reverse past phone entrance — allow replay when settled again. */
      stopAndReset()
    }
  })

  useEffect(() => {
    if (reducedMotion) {
      setVisual({
        a: 'brief',
        b: 'brief',
        blend: 0,
        stripT: 0,
        phaseIndex: PHONE_DEMO_PHASES.length - 1,
        dual: false,
      })
      return
    }

    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    const io = new IntersectionObserver(
      ([entry]) => {
        const ratio = entry?.intersectionRatio ?? 0
        const near = ratio >= 0.2
        const far = ratio < 0.05
        if (far && nearRef.current) {
          nearRef.current = false
          stopAndReset()
          return
        }
        if (near && !nearRef.current) {
          nearRef.current = true
          if (phoneSettled(theaterProgress.get()) && !settledRef.current) {
            settledRef.current = true
            startTour()
          }
        }
      },
      { root: null, threshold: [0, 0.05, 0.2, 0.5, 1], rootMargin: '10% 0px 10% 0px' },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      clearTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theaterProgress is a stable MV
  }, [reducedMotion, theaterProgress])

  /* Warm next assets without mounting >2 layers. */
  useEffect(() => {
    const warm = (id: LandingPhoneLayerId) => {
      const img = new Image()
      img.src = phoneLayerSrc(id)
    }
    warm('dashStrip')
    const t1 = window.setTimeout(() => warm('day'), 200)
    const t2 = window.setTimeout(() => {
      warm('nav')
      warm('brief')
    }, 600)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [])

  const frontOp = visual.dual ? 1 - visual.blend : 1
  const backOp = visual.dual ? visual.blend : 0
  const stripPercent =
    visual.a === 'dashStrip' || visual.b === 'dashStrip'
      ? -visual.stripT * 34.5
      : 0

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-flattened-phone-app=""
      data-flattened-phone-autoplay=""
      data-testid="lv2-flattened-phone-autoplay"
      data-phone-layers={phoneDemoActiveLayerCount(visual.phaseIndex)}
      data-phone-demo-running={running ? 'true' : 'false'}
      data-phone-demo-phase={PHONE_DEMO_PHASES[visual.phaseIndex]?.id ?? 'intro'}
      role="img"
      aria-label="OurWed — aplikacja mobilna (podgląd)"
    >
      <img
        className={visual.a === 'dashStrip' ? styles.stripLayer : styles.layer}
        src={phoneLayerSrc(visual.a)}
        alt=""
        draggable={false}
        decoding="async"
        style={{
          opacity: frontOp,
          transform:
            visual.a === 'dashStrip'
              ? `translate3d(0, ${stripPercent}%, 0)`
              : undefined,
          transition:
            'opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1), transform 1.8s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        data-flattened-layer={visual.a}
      />
      {visual.dual ? (
        <img
          className={visual.b === 'dashStrip' ? styles.stripLayer : styles.layer}
          src={phoneLayerSrc(visual.b)}
          alt=""
          draggable={false}
          decoding="async"
          style={{
            opacity: backOp,
            transform:
              visual.b === 'dashStrip'
                ? `translate3d(0, ${stripPercent}%, 0)`
                : 'translate3d(0, 8px, 0)',
            transition:
              'opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1), transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          data-flattened-layer={visual.b}
        />
      ) : null}
    </div>
  )
}
