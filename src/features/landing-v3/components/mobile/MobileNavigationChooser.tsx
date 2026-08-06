import type { MobileDemoFocus } from '@/features/landing-v3/motion/mobileWeddingDaySequence'
import styles from './MobileNavigationChooser.module.css'

type Props = {
  /** 0 closed → 1 open */
  progress: number
  focus: MobileDemoFocus
}

/** Stable chooser layer — translateY only, always inside display mask. */
export function MobileNavigationChooser({ progress, focus }: Props) {
  const open = progress > 0.02
  return (
    <div
      className={styles.layer}
      data-mobile-screen="mapChooser"
      data-screen-layer="chooser"
      data-open={open ? 'true' : 'false'}
      style={{
        opacity: Math.min(1, progress * 1.15),
        transform: `translateY(${(1 - progress) * 100}%)`,
      }}
      aria-hidden={!open}
    >
      <div className={styles.sheet}>
        <div className={styles.handle} aria-hidden />
        <p className={styles.title}>Otwórz nawigację</p>
        <p className={styles.support}>
          Wybierz aplikację, z której korzystasz.
        </p>
        <div className={styles.options}>
          <span
            className={styles.option}
            data-focus={focus === 'googleMaps' ? 'true' : 'false'}
            data-demo-option="google-maps"
          >
            <span className={styles.mark} aria-hidden>
              G
            </span>
            Google Maps
          </span>
          <span className={styles.option} data-demo-option="apple-maps">
            <span className={styles.mark} aria-hidden>
              A
            </span>
            Apple Maps
          </span>
        </div>
        <div className={styles.safeArea} aria-hidden />
      </div>
    </div>
  )
}
