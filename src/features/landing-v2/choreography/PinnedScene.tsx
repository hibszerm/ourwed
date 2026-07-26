import type { ReactNode, RefObject } from 'react'
import styles from './PinnedScene.module.css'

/**
 * Scroll runway that pins its sticky stage for a given viewport multiple.
 * GSAP ScrollTrigger attaches to `triggerRef` / `pinRef`.
 */
export function PinnedScene({
  triggerRef,
  pinRef,
  heightVh = 300,
  children,
  className,
  ariaLabel,
}: {
  triggerRef: RefObject<HTMLElement | null>
  pinRef: RefObject<HTMLDivElement | null>
  heightVh?: number
  children: ReactNode
  className?: string
  ariaLabel?: string
}) {
  return (
    <section
      ref={triggerRef}
      className={`${styles.runway} ${className ?? ''}`}
      style={{ height: `${heightVh}vh` }}
      aria-label={ariaLabel}
    >
      <div ref={pinRef} className={styles.pin}>
        {children}
      </div>
    </section>
  )
}
