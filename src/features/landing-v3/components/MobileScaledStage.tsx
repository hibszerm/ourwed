import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import styles from './MobileScaledStage.module.css'

type Props = {
  baseWidth: number
  baseHeight: number
  /** @deprecated use mobilePadding */
  mobileHorizontalPadding?: number
  mobilePadding?: number
  maxScale?: number
  minScale?: number
  align?: 'top' | 'center'
  className?: string
  children: ReactNode
  fallbackDelayMs?: number
  /** Extra height allowance for soft shadows (px, unscaled). */
  shadowAllowance?: number
}

/**
 * Scale a fixed desktop-proportion artboard into mobile width.
 * Outer height = baseHeight * scale (+ optional shadow allowance).
 */
export function MobileScaledStage({
  baseWidth,
  baseHeight,
  mobileHorizontalPadding,
  mobilePadding,
  maxScale = 1,
  minScale = 0.48,
  align = 'top',
  className = '',
  children,
  fallbackDelayMs = 600,
  shadowAllowance = 0,
}: Props) {
  const pad = mobilePadding ?? mobileHorizontalPadding ?? 16
  const outerRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(() =>
    typeof window === 'undefined'
      ? 1
      : Math.min(
          maxScale,
          Math.max(minScale, (Math.min(window.innerWidth, 430) - pad * 2) / baseWidth),
        ),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = outerRef.current
    if (!el) return

    const measure = () => {
      const available = Math.max(0, el.clientWidth - pad * 2)
      if (available <= 1) return
      const next = Math.min(maxScale, Math.max(minScale, available / baseWidth))
      setScale(next)
      setReady(true)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)

    const fallback = window.setTimeout(() => {
      setReady(true)
    }, fallbackDelayMs)

    return () => {
      ro.disconnect()
      window.clearTimeout(fallback)
    }
  }, [baseWidth, maxScale, minScale, pad, fallbackDelayMs])

  const outerHeight = baseHeight * scale + shadowAllowance

  const outerStyle = {
    height: `${outerHeight}px`,
    aspectRatio: `${baseWidth} / ${baseHeight}`,
    maxHeight: `${outerHeight}px`,
    '--stage-scale': String(scale),
    '--stage-base-w': `${baseWidth}px`,
    '--stage-base-h': `${baseHeight}px`,
    opacity: ready ? 1 : 0.92,
  } as CSSProperties

  return (
    <div
      ref={outerRef}
      className={`${styles.outer} ${className}`}
      data-mobile-scaled-stage=""
      data-stage-ready={ready ? 'true' : 'false'}
      data-stage-align={align}
      data-stage-scale={scale.toFixed(3)}
      style={outerStyle}
    >
      <div className={styles.inner} data-stage-inner="">
        {children}
      </div>
    </div>
  )
}
