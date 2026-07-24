import styles from '../DashboardV2.module.css'

export function DashboardV2Skeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="Ładowanie">
      <div className={styles.skelHero} />
      <div className={styles.skelRow} />
      <div className={styles.skelRow} />
      <div className={styles.skelRow} />
    </div>
  )
}
