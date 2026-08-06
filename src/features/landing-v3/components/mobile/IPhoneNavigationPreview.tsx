import { MobileRouteMap } from '@/features/landing-v3/components/mobile/MobileRouteMap'
import { MOBILE_ROUTE_SUMMARY } from '@/features/landing-v3/motion/mobileWeddingDaySequence'
import styles from './IPhoneNavigationPreview.module.css'

type Props = {
  /** 0–1 visibility of the whole navigation layer */
  progress: number
  /** 0–1 route draw */
  routeProgress: number
  status: 'opening' | 'opened'
}

/**
 * Navigation layer: map fragment (~58–62% height) + route card.
 * Uses MobileRouteMap — previous diagonal SVG removed.
 */
export function IPhoneNavigationPreview({
  progress,
  routeProgress,
  status,
}: Props) {
  const r = MOBILE_ROUTE_SUMMARY
  const visible = progress > 0.02

  return (
    <div
      className={styles.layer}
      data-mobile-screen="navigation"
      data-screen-layer="navigation"
      data-active={visible ? 'true' : 'false'}
      style={{
        opacity: progress,
        transform: `translateY(${(1 - progress) * 10}px) scale(${0.985 + progress * 0.015})`,
      }}
      aria-hidden={!visible}
    >
      <div className={styles.inner}>
        <p className={styles.mapLabel}>{r.mapLabel}</p>

        <div className={styles.mapCard} data-map-preview="">
          <MobileRouteMap routeProgress={routeProgress} />
        </div>

        <div className={styles.routeCard} data-route-card="">
          <div className={styles.routeCardTop}>
            <div>
              <p className={styles.dest}>{r.to}</p>
              <p className={styles.from}>{r.fromLabel}</p>
            </div>
            <div className={styles.metrics}>
              <strong>{r.duration}</strong>
              <span>{r.distance}</span>
            </div>
          </div>
          <p
            className={styles.status}
            data-handoff-status={status}
            data-nav-status={status}
          >
            {status === 'opened' ? r.openedStatus : r.openingStatus}
          </p>
        </div>
      </div>
    </div>
  )
}
