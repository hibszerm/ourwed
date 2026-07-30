import styles from './AuthLoadingScreen.module.css'

interface AuthLoadingScreenProps {
  /** Optional status copy. Defaults to „Ładowanie…”. */
  label?: string
}

export function AuthLoadingScreen({
  label = 'Ładowanie…',
}: AuthLoadingScreenProps) {
  return (
    <div className={styles.page} role="status" aria-live="polite">
      <div className={styles.panel}>
        <div className={styles.mark} aria-hidden>
          OW
        </div>
        <p className={styles.label}>{label}</p>
      </div>
    </div>
  )
}
