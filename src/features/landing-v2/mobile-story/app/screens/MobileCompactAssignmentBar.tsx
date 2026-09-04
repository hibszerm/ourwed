import { motion, type MotionValue } from 'framer-motion'
import { IconChevronRight } from '@/components/icons'
import { compactAssignmentMonogram } from '@/features/dashboard-v3/dashboardV3AssignmentPresentation'
import { mobileOurWedDemo } from '@/features/landing-v2/mobile-story/app/data/mobileOurWedDemoData'
import styles from './MobileCompactAssignmentBar.module.css'

type Props = {
  opacity: MotionValue<number>
}

/**
 * Local visual replica of production MobileNextAssignmentBar.
 * Progress-driven (no IntersectionObserver) — glass strip under sticky shell header.
 */
export function MobileCompactAssignmentBar({ opacity }: Props) {
  const n = mobileOurWedDemo.dashboard.nearest
  const monogram = compactAssignmentMonogram(n.coupleName)

  return (
    <motion.div
      className={styles.sticky}
      style={{ opacity }}
      data-mobile-compact-bar=""
      data-mobile-dashboard-compact-bar=""
      data-active="true"
      aria-hidden
    >
      <div className={styles.bar}>
        <span className={styles.typeCue} aria-hidden>
          {monogram}
        </span>
        <span className={styles.identity}>
          <span className={styles.name}>{n.coupleName}</span>
          <span className={styles.meta}>
            {n.typeLabel} · {n.countdownRelative}
          </span>
        </span>
        <IconChevronRight className={styles.chevron} aria-hidden />
      </div>
    </motion.div>
  )
}
