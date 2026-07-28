import { LoaderCircle } from 'lucide-react'
import { RECOVERY_PROGRESS_STAGES } from '../constants'
import styles from './RecoveryProgressPanel.module.css'

export function RecoveryProgressPanel({
  activeIndex,
  error,
}: {
  activeIndex: number
  error?: string | null
}) {
  return (
    <div className={styles.wrap}>
      <ol className={styles.list}>
        {RECOVERY_PROGRESS_STAGES.map((label, index) => {
          const status =
            error && index === activeIndex
              ? 'error'
              : index < activeIndex
                ? 'done'
                : index === activeIndex
                  ? 'active'
                  : 'pending'
          return (
            <li key={label} className={styles.item} data-status={status}>
              <span className={styles.icon} aria-hidden>
                {status === 'active' ? (
                  <LoaderCircle size={16} className={styles.spin} />
                ) : null}
              </span>
              <span>{label}</span>
            </li>
          )
        })}
      </ol>
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  )
}
