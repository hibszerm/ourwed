import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  COMPOSITION_VERSION,
  computeCompositionScale,
  computeScaledHeight,
  type CompositionKey,
  DESKTOP_COMPOSITION_METRICS,
} from '@/features/landing-v3/components/desktopCompositionMetrics'
import { DesktopParityProvider } from '@/features/landing-v3/components/DesktopParityContext'
import { useLandingViewportMode } from '@/features/landing-v3/hooks/useLandingViewportMode'
import styles from './DesktopCompositionScale.module.css'

type Props = {
  composition: CompositionKey
  children: ReactNode
  className?: string
  horizontalPadding?: number
  maxScale?: number
  forceScale?: boolean
}

/**
 * ONLY mobile/tablet transformation for product showcases.
 * Desktop: scale = 1, no transform, children render naturally.
 * Below 1100px: exact desktop canvas uniformly scaled to available width.
 */
export function DesktopCompositionScale({
  composition,
  children,
  className = '',
  horizontalPadding = 0,
  maxScale = 1,
  forceScale = false,
}: Props) {
  const viewport = useLandingViewportMode()
  const metrics = DESKTOP_COMPOSITION_METRICS[composition]
  const shouldScale = forceScale || viewport !== 'desktop'

  const outerRef = useRef<HTMLDivElement | null>(null)
  const [measuredScale, setMeasuredScale] = useState(1)

  useLayoutEffect(() => {
    if (!shouldScale) return
    const el = outerRef.current
    if (!el) return

    const measure = () => {
      const available = Math.max(0, el.clientWidth - horizontalPadding * 2)
      if (available <= 1) return
      const next = computeCompositionScale(metrics.width, available, maxScale)
      setMeasuredScale((prev) => (Math.abs(prev - next) < 0.00001 ? prev : next))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [shouldScale, metrics.width, horizontalPadding, maxScale])

  const activeScale = shouldScale ? measuredScale : 1
  const shadow = metrics.shadowPadding ?? 0
  const wrapperHeight = shouldScale
    ? computeScaledHeight(metrics.height, activeScale, shadow)
    : undefined

  const outerStyle = (
    shouldScale
      ? {
          height: `${wrapperHeight}px`,
        }
      : undefined
  ) as CSSProperties | undefined

  const innerStyle = (
    shouldScale
      ? {
          width: metrics.width,
          height: metrics.height,
          transform: `translateX(-50%) scale(${activeScale})`,
          ['--lv3-container' as string]: `${metrics.width}px`,
        }
      : undefined
  ) as CSSProperties | undefined

  return (
    <div
      ref={outerRef}
      className={`${styles.outer} ${className}`}
      data-desktop-composition-scale=""
      data-scale-active={shouldScale ? 'true' : 'false'}
      data-composition-key={composition}
      data-base-width={metrics.width}
      data-base-height={metrics.height}
      data-computed-scale={activeScale.toFixed(6)}
      style={outerStyle}
    >
      <DesktopParityProvider value={shouldScale ? 'desktopParity' : 'responsive'}>
        <div
          className={styles.inner}
          data-desktop-parity-canvas={shouldScale ? 'true' : undefined}
          data-composition-id={metrics.compositionId}
          data-composition-version={COMPOSITION_VERSION}
          data-render-mode={shouldScale ? 'desktopParity' : 'responsive'}
          style={innerStyle}
        >
          {children}
        </div>
      </DesktopParityProvider>
    </div>
  )
}
