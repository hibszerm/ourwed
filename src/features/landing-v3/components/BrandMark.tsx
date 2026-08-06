import styles from '@/features/landing-v3/styles/landingV3.module.css'

export function BrandMark({
  withWordmark = true,
  className,
}: {
  withWordmark?: boolean
  className?: string
}) {
  return (
    <span className={[styles.brand, className].filter(Boolean).join(' ')}>
      <span className={styles.brandMark} aria-hidden>
        OW
      </span>
      {withWordmark ? <span>OurWed</span> : null}
    </span>
  )
}
