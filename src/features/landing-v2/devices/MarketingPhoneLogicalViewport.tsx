import { useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import {
  CANONICAL_APP_VIEWPORT_WIDTH_PX,
  presentationScaleForPhysicalWidth,
  logicalViewportHeightFromPhysical,
} from '@/features/landing-v2/devices/phoneLogicalViewportCanon'
import styles from './MarketingPhoneLogicalViewport.module.css'

type Props = {
  children: ReactNode
}

/**
 * Physical phone screen clip → static scale → canonical ~390 logical app.
 * Scale is presentation-only (never animated). App scroll owns translateY separately.
 */
export function MarketingPhoneLogicalViewport({ children }: Props) {
  const clipRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const [logicalH, setLogicalH] = useState(844)

  useLayoutEffect(() => {
    const el = clipRef.current
    if (!el || typeof ResizeObserver === 'undefined') return

    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w < 2 || h < 2) return
      const nextScale = presentationScaleForPhysicalWidth(w)
      const nextH = logicalViewportHeightFromPhysical(h, nextScale)
      setScale(nextScale)
      setLogicalH(nextH)
      el.dataset.physicalWidth = String(Math.round(w))
      el.dataset.physicalHeight = String(Math.round(h))
      el.dataset.presentationScale = nextScale.toFixed(4)
      el.dataset.logicalHeight = String(Math.round(nextH))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scaleStyle = {
    width: CANONICAL_APP_VIEWPORT_WIDTH_PX,
    height: logicalH,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    ['--phone-presentation-scale' as string]: String(scale),
    ['--phone-logical-width' as string]: `${CANONICAL_APP_VIEWPORT_WIDTH_PX}px`,
    ['--phone-logical-height' as string]: `${logicalH}px`,
  } as CSSProperties

  return (
    <div
      ref={clipRef}
      className={styles.physicalClip}
      data-phone-screen-physical=""
      data-testid="lv2-phone-logical-viewport"
      data-canonical-app-width={String(CANONICAL_APP_VIEWPORT_WIDTH_PX)}
    >
      <div
        className={styles.logicalScale}
        data-phone-logical-scale=""
        data-transform-owner="logicalScale"
        style={scaleStyle}
      >
        <div
          className={styles.logicalViewport}
          data-phone-logical-viewport=""
          data-canonical-width={String(CANONICAL_APP_VIEWPORT_WIDTH_PX)}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
