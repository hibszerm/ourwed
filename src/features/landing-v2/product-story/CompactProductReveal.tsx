import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { HeroTabletFrame } from '@/features/landing-v2/hero/HeroTabletFrame'
import { measureCanonicalDeviceFit } from '@/features/landing-v2/hero/landingTabletFit'
import { FlattenedProductAutoplay } from '@/features/landing-v2/devices/FlattenedProductAutoplay'
import styles from './CompactProductReveal.module.css'

/**
 * Compact Product Story — Iteration 3A–3D.
 *
 * Visual stacking: transparent sticky under black (geometry only).
 * Exit: native sticky unpin 1:1 — no scroll/rAF measure loop.
 * Autoplay: hysteretic IntersectionObserver only (not scene07 handoff Mv).
 */
export function CompactProductReveal() {
  const trackRef = useRef<HTMLElement | null>(null)
  const stickyRef = useRef<HTMLDivElement | null>(null)
  const deviceFitRef = useRef<HTMLDivElement | null>(null)
  const reduced = Boolean(useReducedMotion())
  const [deviceFitScale, setDeviceFitScale] = useState(1)
  const [deviceFitSlot, setDeviceFitSlot] = useState<{
    w: number
    h: number
  } | null>(null)
  const [autoplayActive, setAutoplayActive] = useState(false)

  /*
   * Hysteretic autoplay gate — coarse resource control only.
   * Enter when comfortably established; leave when clearly offscreen.
   * Does not drive black/Product paint ownership.
   */
  useEffect(() => {
    if (reduced) {
      setAutoplayActive(false)
      return
    }
    const sticky = stickyRef.current
    if (!sticky || typeof IntersectionObserver === 'undefined') return

    let visible = false
    const io = new IntersectionObserver(
      ([entry]) => {
        const ratio = entry?.intersectionRatio ?? 0
        if (!visible && ratio >= 0.62) {
          visible = true
          setAutoplayActive(true)
          sticky.setAttribute('data-ps-autoplay-gate', 'on')
        } else if (visible && ratio <= 0.18) {
          visible = false
          setAutoplayActive(false)
          sticky.setAttribute('data-ps-autoplay-gate', 'off')
        }
      },
      {
        root: null,
        /* Shrink root so "established" ≈ tablet fully in presentation band. */
        rootMargin: '-12% 0px -12% 0px',
        threshold: [0, 0.18, 0.35, 0.62, 0.85, 1],
      },
    )
    io.observe(sticky)
    return () => io.disconnect()
  }, [reduced])

  useLayoutEffect(() => {
    const sticky = stickyRef.current
    const fitEl = deviceFitRef.current
    if (!sticky || !fitEl) return

    const measure = () => {
      const next = measureCanonicalDeviceFit({
        sticky,
        fit: fitEl,
        padX: 18,
        padY: 20,
        cssVar: '--ps-device-fit-scale',
      })
      if (!next) return
      setDeviceFitScale(next.scale)
      setDeviceFitSlot({ w: next.slotW, h: next.slotH })
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(sticky)
    return () => ro.disconnect()
  }, [])

  if (reduced) {
    return (
      <section
        className={styles.track}
        data-testid="lv2-product-story"
        data-product-theater="static"
        data-product-compact-reveal="true"
        aria-labelledby="lv2-product-heading"
      >
        <h2 id="lv2-product-heading" className={styles.visuallyHidden}>
          Jedno zlecenie w OurWed
        </h2>
        <div className={styles.staticStack}>
          <HeroTabletFrame canonical hardwareProgress={1} blackout={0}>
            <FlattenedProductAutoplay active={false} reducedMotion />
          </HeroTabletFrame>
        </div>
      </section>
    )
  }

  return (
    <section
      ref={trackRef}
      className={styles.track}
      data-testid="lv2-product-story"
      data-product-theater="compact-reveal"
      data-product-compact-reveal="true"
      data-product-exit="native-sticky"
      data-product-handoff="geometry"
      data-product-pointer="none"
      data-product-scroll-measure="off"
      aria-labelledby="lv2-product-heading"
    >
      <h2 id="lv2-product-heading" className={styles.visuallyHidden}>
        Jedno zlecenie w OurWed
      </h2>

      <div
        ref={stickyRef}
        className={styles.sticky}
        data-product-sticky-stage=""
        data-ps-compact="true"
        data-ps-camera-travel="false"
        data-ps-exit-scale="false"
        data-ps-paint="geometry"
        data-ps-autoplay-gate="off"
      >
        <div
          className={styles.stage}
          data-ps-visual-stage=""
          data-ps-stage-bg="transparent"
        >
          <div
            className={styles.deviceExit}
            data-ps-device-exit=""
            data-ps-exit-native="true"
            data-ps-device-bg="transparent"
          >
            <div
              className={styles.deviceFitSlot}
              data-ps-device-fit="scale"
              data-ps-fit-bg="transparent"
              style={
                deviceFitSlot
                  ? { width: deviceFitSlot.w, height: deviceFitSlot.h }
                  : undefined
              }
            >
              <div
                ref={deviceFitRef}
                className={styles.deviceFit}
                style={{
                  ['--ps-device-fit-scale' as string]: deviceFitScale,
                }}
              >
                <HeroTabletFrame canonical fitLock hardwareProgress={1} blackout={0}>
                  <div
                    className={styles.screenClip}
                    data-ps-workspace-clip=""
                    data-ps-workspace-dormant="false"
                    data-ps-beige-scope="screen"
                  >
                    <FlattenedProductAutoplay
                      active={autoplayActive}
                      reducedMotion={false}
                    />
                  </div>
                </HeroTabletFrame>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
