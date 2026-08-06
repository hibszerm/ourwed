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
  mobileHorizontalPadding?: number
  maxScale?: number
  minScale?: number
  align?: 'top' | 'center'
  className?: string
  children: ReactNode
  /** Reveal content even if measurement fails. */
  fallbackDelayMs?: number
}

/**
 * Proportionally scale a desktop-oriented product canvas to fit mobile width.
 * Outer height = baseHeight * scale. Does not scale page copy.
 */
export function MobileScaledStage({
  baseWidth,
  baseHeight,
  mobileHorizontalPadding = 16,
  maxScale = 1,
  minScale = 0.42,
  align = 'top',
  className = '',
  children,
  fallbackDelayMs = 600,
}: Props) {
  const outerRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = outerRef.current
    if (!el) return

    const measure = () => {
      const available = Math.max(
        0,
        el.clientWidth - mobileHorizontalPadding * 2,
      )
      if (available <= 0) return
      const next = Math.min(maxScale, Math.max(minScale, available / baseWidth))
      setScale(next)
      setReady(true)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)

    const fallback = window.setTimeout(() => {
      setReady(true)
      setScale((s) => (s > 0 ? s : minScale))
    }, fallbackDelayMs)

    return () => {
      ro.disconnect()
      window.clearTimeout(fallback)
    }
  }, [baseWidth, maxScale, minScale, mobileHorizontalPadding, fallbackDelayMs])

  const outerStyle = {
    height: `${baseHeight * scale}px`,
    '--stage-scale': String(scale),
    '--stage-base-w': `${baseWidth}px`,
    '--stage-base-h': `${baseHeight}px`,
    opacity: ready ? 1 : 0.01,
  } as CSSProperties

  return (
    <div
      ref={outerRef}
      className={`${styles.outer} ${className}`}
      data-mobile-scaled-stage=""
      data-stage-ready={ready ? 'true' : 'false'}
      data-stage-align={align}
      style={outerStyle}
    >
      <div className={styles.inner} data-stage-inner="">
        {children}
      </div>
    </div>
  )
}
