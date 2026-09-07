import { useEffect, useRef } from 'react'
import styles from './AuthVisualPanel.module.css'

/** Public asset — raw 4K mockup for auth visual QA (not yet re-encoded). */
const AUTH_PRODUCT_VIDEO_SRC = '/ourwed-auth-product.mp4'

/**
 * Desktop product-story surface for Studio auth.
 * Renders the product mockup video. Presentational only — no auth logic.
 *
 * Reduced motion: muted autoplay is paused on mount when
 * prefers-reduced-motion: reduce (first frame remains visible).
 */
export function AuthVisualPanel() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.autoplay = false
      el.pause()
      return
    }

    void el.play().catch(() => {
      /* Autoplay may be blocked; muted + playsInline usually succeeds. */
    })
  }, [])

  return (
    <aside className={styles.panel} data-auth-visual-panel="" aria-hidden="true">
      <div className={styles.frame} data-auth-visual-frame="">
        <video
          ref={videoRef}
          className={styles.video}
          data-auth-visual-video=""
          src={AUTH_PRODUCT_VIDEO_SRC}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          controls={false}
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
        />
      </div>
    </aside>
  )
}
