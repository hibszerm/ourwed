import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  productLayerSrc,
  type LandingProductLayerId,
} from '@/features/landing-v2/devices/landingDeviceAssets'
import styles from './FlattenedProductTabletContent.module.css'

const PRODUCT_AUTOPLAY_ORDER: LandingProductLayerId[] = [
  'overview',
  'logistics',
  'finance',
  'questionnaire',
]

const HOLD_MS = 1750
const CROSSFADE_MS = 420

type Props = {
  /** When false, timers pause and no further state advances. */
  active: boolean
  /** Disable timed loop (prefers-reduced-motion). */
  reducedMotion?: boolean
}

/**
 * Compact Product tablet content — time-based tab loop (not scroll-driven).
 * Max 2 opacity layers during crossfade; live ProductStoryWorkspace must NOT mount.
 */
export function FlattenedProductAutoplay({
  active,
  reducedMotion = false,
}: Props) {
  const [index, setIndex] = useState(0)
  const [prevIndex, setPrevIndex] = useState<number | null>(null)
  const [blend, setBlend] = useState(0)
  const timerRef = useRef<number | null>(null)
  const fadeRef = useRef<number | null>(null)
  const indexRef = useRef(0)
  indexRef.current = index

  useEffect(() => {
    const warm = (id: LandingProductLayerId) => {
      const img = new Image()
      img.src = productLayerSrc(id)
    }
    for (const id of PRODUCT_AUTOPLAY_ORDER) warm(id)
  }, [])

  useEffect(() => {
    const clearTimers = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (fadeRef.current != null) {
        window.clearTimeout(fadeRef.current)
        fadeRef.current = null
      }
    }

    if (!active || reducedMotion) {
      clearTimers()
      setPrevIndex(null)
      setBlend(0)
      return
    }

    const scheduleNext = () => {
      clearTimers()
      timerRef.current = window.setTimeout(() => {
        const from = indexRef.current
        const to = (from + 1) % PRODUCT_AUTOPLAY_ORDER.length
        setPrevIndex(from)
        setIndex(to)
        setBlend(0)
        /* rAF then set blend 1 so CSS transition runs */
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setBlend(1))
        })
        fadeRef.current = window.setTimeout(() => {
          setPrevIndex(null)
          setBlend(0)
          scheduleNext()
        }, CROSSFADE_MS + 32)
      }, HOLD_MS)
    }

    scheduleNext()
    return clearTimers
  }, [active, reducedMotion])

  const current = PRODUCT_AUTOPLAY_ORDER[index]!
  const previous =
    prevIndex != null ? PRODUCT_AUTOPLAY_ORDER[prevIndex]! : null
  const dual = previous != null && previous !== current

  return (
    <div
      className={styles.root}
      data-flattened-product-tablet=""
      data-flattened-product-autoplay=""
      data-testid="lv2-flattened-product-tablet"
      data-product-layers={dual ? 2 : 1}
      data-product-tab={current}
      data-product-autoplay={active && !reducedMotion ? 'on' : 'off'}
      role="img"
      aria-label="OurWed — szczegóły zlecenia (podgląd)"
    >
      {dual && previous ? (
        <motion.img
          className={styles.layer}
          src={productLayerSrc(previous)}
          alt=""
          draggable={false}
          decoding="async"
          style={{ opacity: 1 - blend }}
          data-flattened-layer={previous}
        />
      ) : null}
      <img
        className={styles.layer}
        src={productLayerSrc(current)}
        alt=""
        draggable={false}
        decoding="async"
        style={{
          opacity: dual ? blend : 1,
          transition: dual ? `opacity ${CROSSFADE_MS}ms ease-out` : undefined,
        }}
        data-flattened-layer={current}
      />
    </div>
  )
}

export const PRODUCT_AUTOPLAY_HOLD_MS = HOLD_MS
export const PRODUCT_AUTOPLAY_CROSSFADE_MS = CROSSFADE_MS
export const PRODUCT_AUTOPLAY_TAB_ORDER = PRODUCT_AUTOPLAY_ORDER
