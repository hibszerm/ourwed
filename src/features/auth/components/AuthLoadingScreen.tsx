import styles from './AuthLoadingScreen.module.css'

export function AuthLoadingScreen() {
  return (
    <div className={styles.page} role="status" aria-live="polite">
      <div className={styles.panel}>
        <div className={styles.mark} aria-hidden>
          OW
        </div>
        <p className={styles.label}>Ładowanie…</p>
      </div>
    </div>
  )
}
